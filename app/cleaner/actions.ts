// app/cleaner/actions.ts
"use server";

import prisma from "@/lib/prisma";
import { getDefaultTenant } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOrUpdateInventoryReview } from "@/app/host/inventory-review/actions";
import { InventoryReviewStatus, type Prisma } from "@prisma/client";
import { requireCleanerAccessToCleaning } from "@/lib/cleaner/requireCleanerAccessToCleaning";
import { assertCleanerCanOperateCleaning } from "@/lib/cleaner/assertCleanerCanOperateCleaning";
import { resolveCleanerContext } from "@/lib/cleaner/resolveCleanerContext";
import { getAvailabilityWindow } from "@/lib/cleaner/availabilityWindow";
import { getAccessibleTeamsForUser } from "@/lib/cleaner/getAccessibleTeamsForUser";
import { getAccessiblePropertiesAndTenants } from "@/lib/cleaner/getAccessiblePropertiesAndTenants";
import { getServiceTeamsForPropertyViaWorkGroupsWithFallback } from "@/lib/workgroups/getServiceTeamsForPropertyViaWorkGroups";

const DEBUG_LOGS = process.env.DEBUG_LOGS === "1";

export async function acceptCleaning(formData: FormData) {
  const cleaningId = String(formData.get("cleaningId") || "");
  if (!cleaningId) {
    redirect("/cleaner");
    return;
  }

  const returnTo = formData.get("returnTo")?.toString();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  try {
    const ctx = await resolveCleanerContext();

    // LEGACY: conservar flujo existente
    if (ctx.mode === "legacy") {
      const access = await requireCleanerAccessToCleaning(cleaningId);

      const cleaning = await prisma.cleaning.findFirst({
        where: { id: cleaningId, tenantId: access.cleaning.tenantId },
        select: {
          id: true,
          assignmentStatus: true,
          assignedMemberId: true,
          needsAttention: true,
          attentionReason: true,
        },
      });

      if (!cleaning || !access.legacyMember) {
        redirect("/cleaner");
        return;
      }

      const currentMemberId = access.legacyMember.id;

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const currentCleaning = await tx.cleaning.findFirst({
          where: {
            id: cleaningId,
            tenantId: access.cleaning.tenantId,
            assignmentStatus: "OPEN",
            assignedMemberId: null,
            scheduledDate: { gte: startOfToday },
          },
        });

        if (!currentCleaning) throw new Error("ALREADY_TAKEN");

        await tx.cleaning.update({
          where: { id: cleaningId },
          data: {
            assignmentStatus: "ASSIGNED",
            assignedMemberId: currentMemberId,
            needsAttention:
              cleaning.needsAttention && cleaning.attentionReason === "NO_AVAILABLE_MEMBER"
                ? false
                : cleaning.needsAttention,
            attentionReason:
              cleaning.needsAttention && cleaning.attentionReason === "NO_AVAILABLE_MEMBER"
                ? null
                : cleaning.attentionReason,
          },
        });

        const existingAssignee = await tx.cleaningAssignee.findFirst({
          where: { cleaningId, memberId: currentMemberId },
        });

        if (existingAssignee) {
          await tx.cleaningAssignee.update({
            where: { id: existingAssignee.id },
            data: { status: "ASSIGNED", assignedAt: new Date() },
          });
        } else {
          await tx.cleaningAssignee.create({
            data: {
              tenantId: access.cleaning.tenantId,
              cleaningId,
              memberId: currentMemberId,
              status: "ASSIGNED",
              assignedAt: new Date(),
              assignedByUserId: null,
            },
          });
        }
      });

      revalidatePath("/cleaner");
      revalidatePath("/cleaner/cleanings");
      if (returnTo && returnTo.startsWith("/cleaner")) redirect(returnTo);
      redirect("/cleaner");
      return;
    }

    // MEMBERSHIP: asignar por team con acceso a la propiedad
    const myMemberships = ctx.memberships;
    if (!myMemberships || myMemberships.length === 0) {
      redirect("/cleaner");
      return;
    }

    const cleaning = await prisma.cleaning.findUnique({
      where: { id: cleaningId },
      select: {
        id: true,
        teamId: true,
        propertyId: true,
        tenantId: true,
        scheduledDate: true,
        assignmentStatus: true,
        assignedMemberId: true,
        assignedMembershipId: true,
        needsAttention: true,
        attentionReason: true,
      },
    });

    if (!cleaning) {
      redirect("/cleaner");
      return;
    }

    // Obtener scope canónico (WGE o PropertyTeam) - mismo que usa la lista de disponibles
    const { propertyIds, tenantIds } = await getAccessiblePropertiesAndTenants(
      ctx.user.id,
      myMemberships.map((m) => m.teamId)
    );
    if (
      !propertyIds.includes(cleaning.propertyId) ||
      !tenantIds.includes(cleaning.tenantId)
    ) {
      redirect("/cleaner");
      return;
    }

    // Obtener teams que pueden atender esta propiedad (WGE + fallback PropertyTeam)
    const eligibleTeamIds = await getServiceTeamsForPropertyViaWorkGroupsWithFallback(
      cleaning.tenantId,
      cleaning.propertyId
    );
    const membershipTeamIds = new Set(myMemberships.map((m) => m.teamId));
    const overlappingTeamIds = eligibleTeamIds.filter((tid) =>
      membershipTeamIds.has(tid)
    );

    if (overlappingTeamIds.length === 0) {
      redirect("/cleaner");
      return;
    }

    const { activeTeamIds } = await getAccessibleTeamsForUser(ctx.user.id);

    // Validación de disponibilidad
    const isUnassigned =
      cleaning.assignmentStatus === "OPEN" &&
      cleaning.assignedMembershipId === null &&
      cleaning.assignedMemberId === null;

    const { start: startDate, end } = getAvailabilityWindow(now);
    const isInAllowedWindow =
      cleaning.scheduledDate >= startDate &&
      cleaning.scheduledDate <= end;

    if (!isUnassigned || !isInAllowedWindow) {
      revalidatePath("/cleaner");
      if (returnTo && returnTo.startsWith("/cleaner")) redirect(returnTo);
      redirect("/cleaner");
      return;
    }

    const teamForCleaningId =
      cleaning.teamId || overlappingTeamIds[0] || null;
    const mustBeActiveForFuture = teamForCleaningId
      ? activeTeamIds.includes(teamForCleaningId)
      : false;
    const isFuture = cleaning.scheduledDate > now;
    if (isFuture && !mustBeActiveForFuture) {
      redirect("/cleaner");
      return;
    }

    const targetTeamId =
      cleaning.teamId && overlappingTeamIds.includes(cleaning.teamId)
        ? cleaning.teamId
        : overlappingTeamIds[0];

    const myMembership = myMemberships.find((m) => m.teamId === targetTeamId);
    if (!myMembership) {
      redirect("/cleaner");
      return;
    }

    // Compatibilidad: si existe TeamMember legacy para este user+team, setear assignedMemberId y CleaningAssignee
    const teamMember = targetTeamId
      ? await prisma.teamMember.findFirst({
          where: { userId: ctx.user.id, teamId: targetTeamId, isActive: true },
          select: { id: true },
        })
      : null;
    const teamMemberId: string | null = teamMember?.id ?? null;

    await prisma.$transaction(async (tx) => {
      const current = await tx.cleaning.findFirst({
        where: {
          id: cleaningId,
          assignmentStatus: "OPEN",
          assignedMembershipId: null,
          assignedMemberId: null,
          scheduledDate: {
            gte: startDate,
            lte: end,
          },
          // Permitir aceptar limpiezas pasadas durante pruebas
        },
        select: { needsAttention: true, attentionReason: true },
      });

      if (!current) throw new Error("ALREADY_TAKEN");

      await tx.cleaning.update({
        where: { id: cleaningId },
        data: {
          assignmentStatus: "ASSIGNED",
          assignedMembershipId: myMembership.id,
          ...(cleaning.teamId ? {} : targetTeamId ? { teamId: targetTeamId } : {}),
          ...(teamMemberId ? { assignedMemberId: teamMemberId } : {}),
          needsAttention:
            current.needsAttention && current.attentionReason === "NO_AVAILABLE_MEMBER" ? false : current.needsAttention,
          attentionReason:
            current.needsAttention && current.attentionReason === "NO_AVAILABLE_MEMBER" ? null : current.attentionReason,
        },
      });

      if (teamMemberId) {
        const existingAssignee = await tx.cleaningAssignee.findFirst({
          where: { cleaningId, memberId: teamMemberId },
        });

        if (existingAssignee) {
          await tx.cleaningAssignee.update({
            where: { id: existingAssignee.id },
            data: { status: "ASSIGNED", assignedAt: new Date() },
          });
        } else {
          await tx.cleaningAssignee.create({
            data: {
              tenantId: cleaning.tenantId,
              cleaningId,
              memberId: teamMemberId,
              status: "ASSIGNED",
              assignedAt: new Date(),
              assignedByUserId: null,
            },
          });
        }
      }
    });

    revalidatePath("/cleaner");
    revalidatePath("/cleaner/cleanings");
    if (returnTo && returnTo.startsWith("/cleaner")) redirect(returnTo);
    redirect("/cleaner");
  } catch (error: unknown) {
    const err = error as { message?: string; digest?: string };
    if (err?.message === "NEXT_REDIRECT" || `${err?.digest || ""}`.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (err?.message === "ALREADY_TAKEN") {
      revalidatePath("/cleaner");
      if (returnTo && returnTo.startsWith("/cleaner")) redirect(returnTo);
      redirect("/cleaner");
      return;
    }
    if (DEBUG_LOGS) console.error("[acceptCleaning] Error:", err);
    redirect("/cleaner");
  }
}

export async function startCleaning(formData: FormData) {
  try {
    const cleaningId = String(formData.get("cleaningId") || "");
    if (!cleaningId) {
      redirect("/cleaner");
      return;
    }

    const access = await assertCleanerCanOperateCleaning(cleaningId);
    const membershipId = access.membershipId;
    let currentMemberId: string | null = access.memberId;
    if (!currentMemberId && access.cleaning.teamId) {
      const teamMember = await prisma.teamMember.findFirst({
        where: {
          userId: access.userId,
          teamId: access.cleaning.teamId,
          isActive: true,
        },
      });
      if (teamMember) {
        currentMemberId = teamMember.id;
      }
    }

    // Solo permitir iniciar si está asignada a este miembro (membership o legacy) y está PENDING
    const result = await prisma.cleaning.updateMany({
      where: {
        id: cleaningId,
        tenantId: access.cleaning.tenantId,
        assignmentStatus: "ASSIGNED",
        status: "PENDING",
        OR: [
          ...(membershipId ? [{ assignedMembershipId: membershipId }] : []),
          ...(currentMemberId ? [{ assignedMemberId: currentMemberId }] : []),
        ],
      },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

  // Crear o asegurar InventoryReview en DRAFT al iniciar la limpieza
  if (result.count > 0) {
    try {
      const existingReview = await prisma.inventoryReview.findUnique({
        where: { cleaningId },
        select: { id: true, status: true },
      });

      if (!existingReview) {
        // Crear nueva revisión en DRAFT
        const reviewFormData = new FormData();
        reviewFormData.set("callerContext", "cleaner");
        reviewFormData.set("cleaningId", cleaningId);
        await createOrUpdateInventoryReview(reviewFormData);
        if (DEBUG_LOGS) console.log("[startCleaning] InventoryReview creado en DRAFT");
      } else if (existingReview.status === InventoryReviewStatus.DRAFT) {
        // Ya existe en DRAFT, reusar
        if (DEBUG_LOGS) console.log("[startCleaning] InventoryReview ya existe en DRAFT, reusando");
      } else if (existingReview.status === InventoryReviewStatus.SUBMITTED) {
        // Ya está enviado, solo lectura
        if (DEBUG_LOGS) console.log("[startCleaning] InventoryReview ya está SUBMITTED, solo lectura");
      }
    } catch (error) {
      if (DEBUG_LOGS) console.error("[startCleaning] Error al crear/asegurar InventoryReview:", error);
      // No bloquear el inicio de limpieza si falla la creación del review
      }
    }

    revalidatePath("/cleaner");
    revalidatePath("/cleaner/cleanings");
    
    // Redirigir al detalle de la limpieza después de iniciar
    redirect(`/cleaner/cleanings/${cleaningId}`);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err?.status === 403 || err?.status === 404) {
      throw err;
    }
    if (DEBUG_LOGS) console.error("[startCleaning] Error:", err);
    redirect("/cleaner");
  }
}

export async function completeCleaning(formData: FormData) {
  try {
    const cleaningId = String(formData.get("cleaningId") || "");
    if (!cleaningId) {
      redirect("/cleaner");
      return;
    }

    const access = await assertCleanerCanOperateCleaning(cleaningId);
    const membershipId = access.membershipId;
    let currentMemberId: string | null = access.memberId;
    if (!currentMemberId && access.cleaning.teamId) {
      const teamMember = await prisma.teamMember.findFirst({
        where: {
          userId: access.userId,
          teamId: access.cleaning.teamId,
          isActive: true,
        },
      });
      if (teamMember) {
        currentMemberId = teamMember.id;
      }
    }

    // Solo permitir completar si está asignada a este miembro
    await prisma.cleaning.updateMany({
      where: {
        id: cleaningId,
        tenantId: access.cleaning.tenantId,
        assignmentStatus: "ASSIGNED",
        OR: [
          ...(membershipId ? [{ assignedMembershipId: membershipId }] : []),
          ...(currentMemberId ? [{ assignedMemberId: currentMemberId }] : []),
        ],
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    revalidatePath("/cleaner");
    revalidatePath("/cleaner/cleanings");
    
    // Si viene returnTo y es válido, usarlo; si no, volver a /cleaner
    const returnTo = formData.get("returnTo")?.toString();
    if (returnTo && returnTo.startsWith("/cleaner")) {
      redirect(returnTo);
      return;
    }
    
    redirect("/cleaner");
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err?.status === 403 || err?.status === 404) {
      throw err;
    }
    if (DEBUG_LOGS) console.error("[completeCleaning] Error:", err);
    redirect("/cleaner");
  }
}

export async function declineCleaning(formData: FormData) {
  try {
    const cleaningId = String(formData.get("cleaningId") || "");
    if (!cleaningId) {
      redirect("/cleaner");
      return;
    }

    const access = await assertCleanerCanOperateCleaning(cleaningId);
    const membershipId = access.membershipId;
    let currentMemberId: string | null = access.memberId;
    if (!currentMemberId && access.cleaning.teamId) {
      const teamMember = await prisma.teamMember.findFirst({
        where: {
          userId: access.userId,
          teamId: access.cleaning.teamId,
          isActive: true,
        },
      });
      if (teamMember) {
        currentMemberId = teamMember.id;
      }
    }

    // Solo el primary assignee puede declinar (membership o legacy)
    const cleaning = await prisma.cleaning.findFirst({
      where: {
        id: cleaningId,
        tenantId: access.cleaning.tenantId,
        assignmentStatus: "ASSIGNED",
        OR: [
          ...(membershipId ? [{ assignedMembershipId: membershipId }] : []),
          ...(currentMemberId ? [{ assignedMemberId: currentMemberId }] : []),
        ],
      },
      select: {
        id: true,
        teamId: true,
      },
    });

    if (!cleaning) {
      redirect("/cleaner");
      return;
    }

    // Transacción para declinar
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Marcar CleaningAssignee como DECLINED
      if (currentMemberId) {
        await tx.cleaningAssignee.updateMany({
          where: {
            cleaningId: cleaningId,
            memberId: currentMemberId,
            status: "ASSIGNED",
          },
          data: {
            status: "DECLINED",
          },
        });
      }

      // Actualizar cleaning: volver a OPEN y marcar atención requerida
      const result = await tx.cleaning.updateMany({
        where: {
          id: cleaningId,
          tenantId: access.cleaning.tenantId,
          assignmentStatus: "ASSIGNED",
          status: "PENDING",
          OR: [
            ...(membershipId ? [{ assignedMembershipId: membershipId }] : []),
            ...(currentMemberId ? [{ assignedMemberId: currentMemberId }] : []),
          ],
        },
        data: {
          assignmentStatus: "OPEN",
          assignedMemberId: null, // Limpiar primary assignee
          assignedMembershipId: null,
          needsAttention: true,
          attentionReason: "DECLINED_BY_ASSIGNEE",
        },
      });
      if (result.count === 0) {
        return;
      }
    });

    revalidatePath("/cleaner");
    revalidatePath("/cleaner/cleanings");
    revalidatePath("/host/cleanings");
    
    // Si viene returnTo y es válido, usarlo; si no, volver a /cleaner
    const returnTo = formData.get("returnTo")?.toString();
    if (returnTo && returnTo.startsWith("/cleaner")) {
      redirect(returnTo);
      return;
    }
    
    redirect("/cleaner");
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err?.status === 403 || err?.status === 404) {
      throw err;
    }
    if (DEBUG_LOGS) console.error("[declineCleaning] Error:", err);
    redirect("/cleaner");
  }
}

/**
 * Marca una limpieza como "vista" por un miembro del equipo.
 * Idempotente: si ya existe el registro, no falla ni duplica.
 */
export async function markCleaningViewed(cleaningId: string, memberId: string, shouldRevalidate: boolean = false) {
  const tenant = await getDefaultTenant();
  if (!tenant) {
    console.warn("[markCleaningViewed] No tenant encontrado");
    return;
  }

  // Validar que el cleaning y el member pertenecen al tenant
  const [cleaning, member] = await Promise.all([
    prisma.cleaning.findFirst({
      where: {
        id: cleaningId,
        tenantId: tenant.id,
      },
    }),
    prisma.teamMember.findFirst({
      where: {
        id: memberId,
        tenantId: tenant.id,
        isActive: true,
      },
    }),
  ]);

  if (!cleaning) {
    console.warn("[markCleaningViewed] Cleaning no encontrado");
    return;
  }
  
  if (!member) {
    console.warn("[markCleaningViewed] Member no encontrado o inactivo");
    return;
  }

  // Upsert idempotente: si ya existe, no hace nada; si no, crea el registro
  try {
    // NOTE: model may not exist in generated client in some envs; keep runtime guard
    const prismaWithCleaningView = prisma as unknown as {
      cleaningView?: { upsert: (args: unknown) => Promise<unknown> };
    };
    if (!prismaWithCleaningView.cleaningView) {
      console.warn("[markCleaningViewed] Modelo cleaningView no disponible");
      return;
    }
    
    await prismaWithCleaningView.cleaningView.upsert({
      where: {
        cleaningId_memberId: {
          cleaningId,
          memberId,
        },
      },
      update: {
        // Si ya existe, actualizar viewedAt (opcional, pero útil para tracking)
        viewedAt: new Date(),
      },
      create: {
        tenantId: tenant.id,
        cleaningId,
        memberId,
        viewedAt: new Date(),
      },
    });
    
    // Solo revalidar si se solicita explícitamente (desde Server Actions, no durante render)
    if (shouldRevalidate) {
      revalidatePath("/host/cleanings");
    }
  } catch (error: unknown) {
    const err = error as { message?: string };
    // Si falla por cualquier razón (ej: tabla no existe, constraint), ignorar silenciosamente
    // Esto asegura que sea idempotente y no rompa el flujo si la tabla aún no existe
    if (process.env.DEBUG_LOGS === "1") {
      console.error("[markCleaningViewed] Error:", err?.message || err);
    }
    // No re-throw, es una acción idempotente y no crítica para el flujo principal
  }
}
