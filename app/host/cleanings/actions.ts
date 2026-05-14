// app/host/cleanings/actions.ts
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CleaningStatus } from "@/lib/generated/prisma";
import { getEligibleMembersForCleaning } from "@/lib/cleaning-eligibility";
import { createChecklistSnapshotForCleaning } from "@/lib/checklist-snapshot";
import { resolveAutoAssignment } from "@/lib/cleanings/resolveAutoAssignment";
import { assertCleaningIsNotFrozen } from "@/lib/cleanings/assertCleaningIsNotFrozen";
import { assertValidScheduledDate, assertAssignmentCoherence } from "@/lib/cleanings/assertCleaningInvariants";
import { buildCleaningScheduledDate } from "@/lib/datetime/buildCleaningScheduledDate";
import { createOrUpdateInventoryReview } from "@/app/host/inventory-review/actions";
import { InventoryReviewStatus } from "@/lib/generated/prisma";
import { createNotification } from "@/lib/notifications/createNotification";
// FASE 5: property-id-helper eliminado, propertyId ahora es el PK directamente

export async function rescheduleCleaning(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const cleaningId = String(formData.get("cleaningId") || "");
  const dateStr = String(formData.get("date") || "");
  const timeStr = String(formData.get("time") || "");
  const returnTo = formData.get("returnTo")?.toString();

  if (!cleaningId || !dateStr || !timeStr) throw new Error("Datos incompletos");

  // Validar formato
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("Fecha inválida");
  if (!/^\d{2}:\d{2}$/.test(timeStr)) throw new Error("Hora inválida");

  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  // buildCleaningScheduledDate interpreta la hora en CDMX (UTC-6) → UTC correcto
  const newDate = buildCleaningScheduledDate(y, m - 1, d, h, min);
  if (isNaN(newDate.getTime())) throw new Error("Fecha u hora inválida");

  // Verificar que la limpieza es manual (reservationId === null) y PENDING
  const cleaning = await (prisma as any).cleaning.findFirst({
    where: { id: cleaningId, tenantId },
    select: { id: true, status: true, reservationId: true },
  });

  if (!cleaning) throw new Error("Limpieza no encontrada");
  if (cleaning.reservationId !== null) throw new Error("Solo se pueden reprogramar limpiezas manuales");
  if (cleaning.status !== "PENDING") throw new Error("Solo se pueden reprogramar limpiezas pendientes");

  await (prisma as any).cleaning.update({
    where: { id: cleaningId },
    data: {
      scheduledDate: newDate,
      scheduledAtPlanned: newDate,
      scheduledAtOriginal: newDate,
    },
  });

  revalidatePath("/host/cleanings");
  revalidatePath(`/host/cleanings/${cleaningId}`);
  redirect(`/host/cleanings/${cleaningId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
}

function redirectBack(formData: FormData) {
  const returnTo = formData.get("returnTo")?.toString();
  // Si viene returnTo y es seguro (solo /host/cleanings...), usarlo
  if (returnTo && returnTo.startsWith("/host/cleanings")) {
    redirect(returnTo);
  }

  // Si no, usar el redirect por view/date/month
  const view = String(formData.get("view") || "day");
  const date = String(formData.get("date") || "");
  const month = String(formData.get("month") || "");

  const params = new URLSearchParams();
  params.set("view", view);
  if (date) params.set("date", date);
  if (month) params.set("month", month);

  redirect(`/host/cleanings?${params.toString()}`);
}

export async function startCleaning(formData: FormData) {
  try {
    const user = await requireHostUser();
    const tenantId = user.tenantId;
    if (!tenantId) {
      redirectBack(formData);
      return;
    }

    const id = String(formData.get("cleaningId") || "");
    if (!id) {
      console.error("[startCleaning] No cleaningId provided");
      redirectBack(formData);
      return;
    }

    const result = await prisma.cleaning.updateMany({
      where: {
        id,
        tenantId,
        status: CleaningStatus.PENDING, // Solo permitir iniciar si está pendiente
      },
      data: {
        status: CleaningStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    console.log("[startCleaning] Update result:", result);

    if (result.count === 0) {
      console.warn("[startCleaning] No rows updated. Cleaning may not exist, not be PENDING, or belong to different tenant.");
    } else {
      // Crear o asegurar InventoryReview en DRAFT al iniciar la limpieza
      try {
        const existingReview = await prisma.inventoryReview.findFirst({
          where: { cleaningId: id, tenantId },
          select: { id: true, status: true },
        });

        if (!existingReview) {
          // Crear nueva revisión en DRAFT
          const formData = new FormData();
          formData.set("cleaningId", id);
          await createOrUpdateInventoryReview(formData);
          console.log("[startCleaning] InventoryReview creado en DRAFT");
        } else if (existingReview.status === InventoryReviewStatus.DRAFT) {
          // Ya existe en DRAFT, reusar
          console.log("[startCleaning] InventoryReview ya existe en DRAFT, reusando");
        } else if (existingReview.status === InventoryReviewStatus.SUBMITTED) {
          // Ya está enviado, solo lectura
          console.log("[startCleaning] InventoryReview ya está SUBMITTED, solo lectura");
        }
      } catch (error) {
        console.error("[startCleaning] Error al crear/asegurar InventoryReview:", error);
        // No bloquear el inicio de limpieza si falla la creación del review
        // El review se puede crear después cuando el cleaner acceda al inventario
      }
    }

    revalidatePath("/host/cleanings");
    redirectBack(formData);
  } catch (error) {
    console.error("[startCleaning] Error:", error);
    // Re-throw para que Next.js muestre el error
    throw error;
  }
}

export async function completeCleaning(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const id = String(formData.get("cleaningId") || "");
  if (!id) {
    redirectBack(formData);
    return;
  }

  // GATING: Verificar que existe una revisión de inventario SUBMITTED antes de permitir concluir
  try {
    const inventoryReview = await prisma.inventoryReview.findFirst({
      where: {
        cleaningId: id,
        tenantId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    console.log("[completeCleaning] Verificando revisión de inventario:", {
      cleaningId: id,
      hasReview: !!inventoryReview,
      reviewStatus: inventoryReview?.status,
    });

    if (!inventoryReview || inventoryReview.status !== "SUBMITTED") {
      console.log("[completeCleaning] Revisión no encontrada o no SUBMITTED, bloqueando completar");
      // Lanzar error controlado que la UI puede manejar
      throw new Error("INVENTORY_REVIEW_REQUIRED");
    }

    console.log("[completeCleaning] Revisión SUBMITTED encontrada, permitiendo completar");
  } catch (error: any) {
    // Si el error es INVENTORY_REVIEW_REQUIRED, re-lanzarlo
    if (error.message === "INVENTORY_REVIEW_REQUIRED") {
      throw error;
    }
    // Si hay un error de base de datos (tabla no existe), también bloquear
    console.error("[completeCleaning] Error al verificar revisión:", error);
    throw new Error("INVENTORY_REVIEW_REQUIRED");
  }

  await prisma.cleaning.updateMany({
    where: {
      id,
      tenantId,
    },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  // Auto-cerrar TaskRecurringDues asignadas a esta limpieza
  await prisma.taskRecurringDue.updateMany({
    where: { assignedCleaningId: id, tenantId, status: "ASSIGNED" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  revalidatePath("/host/cleanings");
  revalidatePath("/host/tareas-pro/pendientes");
  redirectBack(formData);
}

export async function cancelCleaning(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const id = String(formData.get("cleaningId") || "");
  if (!id) {
    redirectBack(formData);
    return;
  }

  await prisma.cleaning.updateMany({
    where: {
      id,
      tenantId,
    },
    data: {
      status: "CANCELLED",
    },
  });

  // Revertir TaskRecurringDues asignadas a esta limpieza → vuelven a PENDING_ASSIGNMENT
  await prisma.taskRecurringDue.updateMany({
    where: { assignedCleaningId: id, tenantId, status: "ASSIGNED" },
    data: { status: "PENDING_ASSIGNMENT", assignedCleaningId: null, assignedAt: null },
  });

  revalidatePath("/host/cleanings");
  revalidatePath("/host/tareas-pro/pendientes");
  redirectBack(formData);
}

export async function reopenCleaning(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const id = String(formData.get("cleaningId") || "");
  if (!id) {
    redirectBack(formData);
    return;
  }

  await prisma.cleaning.updateMany({
    where: {
      id,
      tenantId,
    },
    data: {
      status: "PENDING",
      completedAt: null,
      startedAt: null,
    },
  });

  revalidatePath("/host/cleanings");
  redirectBack(formData);
}

export async function deleteCleaning(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const id = String(formData.get("cleaningId") || "");
  if (!id) {
    redirectBack(formData);
    return;
  }

  // Revertir TaskRecurringDues antes de eliminar (el cascade SetNull no actualiza el status)
  await prisma.taskRecurringDue.updateMany({
    where: { assignedCleaningId: id, tenantId, status: "ASSIGNED" },
    data: { status: "PENDING_ASSIGNMENT", assignedCleaningId: null, assignedAt: null },
  });

  // Solo permitir eliminar limpiezas canceladas
  await prisma.cleaning.deleteMany({
    where: {
      id,
      tenantId,
      status: CleaningStatus.CANCELLED,
    },
  });

  revalidatePath("/host/cleanings");
  
  // Redirigir a la página de limpiezas
  const returnTo = formData.get("returnTo")?.toString();
  if (returnTo && returnTo.startsWith("/host/cleanings") && !returnTo.includes(`/${id}`)) {
    redirect(returnTo);
  } else {
    redirect("/host/cleanings");
  }
}

export async function addAssigneeToCleaning(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const cleaningId = String(formData.get("cleaningId") || "");
  const memberId = String(formData.get("memberId") || "");

  if (!cleaningId || !memberId) {
    redirectBack(formData);
    return;
  }

  try {
    // Obtener la limpieza para verificar teamId
    const cleaning = await (prisma as any).cleaning.findFirst({
      where: {
        id: cleaningId,
        tenantId,
      },
      select: {
        id: true,
        teamId: true,
      },
    });

    if (!cleaning) {
      redirectBack(formData);
      return;
    }

    // Verificar que el miembro pertenece al equipo de la limpieza
    if (cleaning.teamId) {
      const member = await (prisma as any).teamMember.findFirst({
        where: {
          id: memberId,
          teamId: cleaning.teamId,
          tenantId,
          isActive: true,
        },
      });

      if (!member) {
        // El miembro no pertenece al equipo
        redirectBack(formData);
        return;
      }
    }

    // Verificar que no esté ya asignado
    const existingAssignee = await (prisma as any).cleaningAssignee.findFirst({
      where: {
        cleaningId: cleaningId,
        memberId: memberId,
        status: "ASSIGNED",
      },
    });

    if (existingAssignee) {
      // Ya está asignado, simplemente recargar
      revalidatePath(`/host/cleanings/${cleaningId}`);
      const returnTo = formData.get("returnTo")?.toString();
      redirect(`/host/cleanings/${cleaningId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
      return;
    }

    // Obtener el usuario actual (Host/Manager) para assignedByUserId
    // Por ahora usar null si no hay autenticación
    const assignedByUserId = null; // TODO: obtener del usuario autenticado

    // Transacción para agregar assignee
    await (prisma as any).$transaction(async (tx: any) => {
      // Verificar si ya existe CleaningAssignee
      const existingAssignee = await tx.cleaningAssignee.findFirst({
        where: {
          cleaningId: cleaningId,
          memberId: memberId,
        },
      });

      if (existingAssignee) {
        // Actualizar si existe (cambiar de DECLINED a ASSIGNED si aplica)
        await tx.cleaningAssignee.update({
          where: { id: existingAssignee.id },
          data: {
            status: "ASSIGNED",
            assignedAt: new Date(),
          },
        });
      } else {
        // Crear si no existe
        await tx.cleaningAssignee.create({
          data: {
            tenantId,
            cleaningId: cleaningId,
            memberId: memberId,
            status: "ASSIGNED",
            assignedAt: new Date(),
            assignedByUserId: assignedByUserId,
          },
        });
      }

    });

    revalidatePath("/host/cleanings");
    revalidatePath(`/host/cleanings/${cleaningId}`);
    const returnTo = formData.get("returnTo")?.toString();
    redirect(`/host/cleanings/${cleaningId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  } catch (error) {
    console.error("[addAssigneeToCleaning] Error:", error);
    // En caso de error (ej: tabla no existe), simplemente recargar
    revalidatePath(`/host/cleanings/${cleaningId}`);
    const returnTo = formData.get("returnTo")?.toString();
    redirect(`/host/cleanings/${cleaningId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  }
}

export async function assignTeamMemberToCleaning(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const cleaningId = String(formData.get("cleaningId") || "");
  const assignedMembershipId = formData.get("assignedMembershipId")?.toString() || null;

  if (!cleaningId) {
    redirectBack(formData);
    return;
  }

  // Obtener la limpieza para verificar su estado actual y datos necesarios
  const cleaning = await (prisma as any).cleaning.findFirst({
    where: {
      id: cleaningId,
      tenantId,
    },
    select: {
      id: true,
      teamId: true,
      propertyId: true,
      status: true,
      scheduledDate: true,
      scheduledAtPlanned: true,
      needsAttention: true,
      attentionReason: true,
    },
  });

  if (!cleaning) {
    redirectBack(formData);
    return;
  }

  // Freeze guard: no reasignar si ya inició
  assertCleaningIsNotFrozen(cleaningId, cleaning.status);

  // Validar membership: debe ser ACTIVE y pertenecer al mismo team
  let finalAssigneeId: string | null = null;

  if (assignedMembershipId) {
    const membership = await prisma.teamMembership.findFirst({
      where: {
        id: assignedMembershipId,
        status: "ACTIVE",
        teamId: cleaning.teamId || undefined,
        Team: { tenantId },
      },
      select: { id: true, teamId: true },
    });

    if (!membership || (cleaning.teamId && membership.teamId !== cleaning.teamId)) {
      redirectBack(formData);
      return;
    }

    finalAssigneeId = assignedMembershipId;
  }

  // Calcular flags de atención post-asignación
  let needsAttention = cleaning.needsAttention;
  let attentionReason: string | null = cleaning.attentionReason;

  if (finalAssigneeId) {
    // Se está asignando un miembro → limpiar flags de NO_AVAILABLE_MEMBER / DECLINED
    const clearableReasons = ["NO_AVAILABLE_MEMBER", "DECLINED_BY_ASSIGNEE"];
    if (attentionReason && clearableReasons.includes(attentionReason)) {
      needsAttention = false;
      attentionReason = null;
    }
  } else {
    // Se está quitando la asignación → verificar si hay memberships activas
    if (cleaning.teamId) {
      const activeCount = await prisma.teamMembership.count({
        where: { teamId: cleaning.teamId, status: "ACTIVE" },
      });
      if (activeCount === 0) {
        needsAttention = true;
        attentionReason = "NO_AVAILABLE_MEMBER";
      } else {
        needsAttention = false;
        attentionReason = null;
      }
    }
  }

  assertAssignmentCoherence({ assignedMembershipId: finalAssigneeId, needsAttention, attentionReason }, "assignTeamMemberToCleaning");

  // Actualizar cleaning con membership como único modelo de asignación
  await (prisma as any).cleaning.updateMany({
    where: { id: cleaningId, tenantId },
    data: {
      assignedMembershipId: finalAssigneeId ?? null,
      assignmentStatus: finalAssigneeId ? "ASSIGNED" : "OPEN",
      needsAttention,
      attentionReason,
    },
  });

  // Notificar al cleaner asignado
  if (finalAssigneeId) {
    try {
      const membership = await prisma.teamMembership.findUnique({
        where: { id: finalAssigneeId },
        select: { userId: true },
      });
      if (membership?.userId) {
        await createNotification({
          tenantId,
          userId: membership.userId,
          type: "CLEANING_ASSIGNED",
          title: "Limpieza asignada",
          body: "Se te ha asignado una nueva limpieza.",
          href: `/cleaner/cleanings/${cleaningId}`,
          dedupeKey: `cleaning:${cleaningId}:assigned:${finalAssigneeId}`,
          sendPush: true,
        });
      }
    } catch (notifError) {
      console.error("[assignTeamMemberToCleaning] Error enviando notificación:", notifError);
    }
  }

  revalidatePath("/host/cleanings");
  revalidatePath("/host/cleanings/needs-attention");
  const returnTo = formData.get("returnTo")?.toString();

  // Revalidar la página del detalle de limpieza
  revalidatePath(`/host/cleanings/${cleaningId}`);

  // Si viene desde una reserva, revalidar también esa página (pero no redirigir ahí)
  if (returnTo && returnTo.startsWith("/host/reservations/")) {
    revalidatePath(returnTo);
  }

  // Siempre redirigir al detalle de limpieza, no al returnTo
  // Esto asegura que el usuario permanezca en la página de limpieza después de asignar
  redirect(`/host/cleanings/${cleaningId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
}

export async function createCleaning(formData: FormData) {
  console.log("★★★ [createCleaning] v2 — INICIO ★★★");
  const propertyId = formData.get("propertyId")?.toString();
  const scheduledAtStr = formData.get("scheduledAt")?.toString();
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!propertyId || !scheduledAtStr) {
    revalidatePath("/host/cleanings");
    return;
  }

  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    revalidatePath("/host/cleanings");
    return;
  }

  // scheduledAtStr viene de DateTimePicker como "YYYY-MM-DDTHH:mm" sin timezone.
  // Parsear manualmente para evitar ambigüedad de runtime, luego aplicar CDMX (UTC-6).
  const [datePart, timePart] = scheduledAtStr.split("T");
  const [syear, smonth, sday] = (datePart ?? "").split("-").map(Number);
  const [shours, sminutes] = (timePart ?? "11:00").split(":").map(Number);
  const scheduledDate = buildCleaningScheduledDate(syear, smonth - 1, sday, shours, sminutes);

  // Verificar que la propiedad existe y pertenece al tenant
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: {
      id: true,
      name: true,
      shortName: true,
      address: true,
    },
  });
  
  if (!property) {
    console.error("[createCleaning] Property not found or does not belong to tenant:", propertyId);
    revalidatePath("/host/cleanings");
    return;
  }

  // PASO 1: Resolver team via WorkGroups (con fallback transparente a PropertyTeam legacy)
  const { resolveEffectiveTeamsForProperty } = await import(
    "@/lib/workgroups/resolveEffectiveTeamsForProperty"
  );
  const { teamIds } = await resolveEffectiveTeamsForProperty(tenantId, property.id);
  // Exactamente 1 team → pasar a resolveAutoAssignment; 0 o 2+ → null (OPEN por contrato)
  const teamId = teamIds.length === 1 ? teamIds[0] : null;

  // PASO 2+3: Resolver asignación automática (preferred executor → 1 membership → OPEN)
  const assignment = await resolveAutoAssignment(property.id, teamId);
  const { assignedMembershipId, assignmentStatus, needsAttention, attentionReason } = assignment;
  // Usar el teamId resuelto por el helper (puede ser null si no hay team)
  const resolvedTeamId = assignment.teamId;

  console.log("[createCleaning] assignedMembershipId resolved:", assignedMembershipId ?? "null (OPEN)");

  assertValidScheduledDate(scheduledDate, "createCleaning");
  assertAssignmentCoherence({ assignedMembershipId, needsAttention, attentionReason }, "createCleaning");

  // PASO 4: Crear la limpieza con snapshot de propiedad (requisito técnico)
  const cleaning = await (prisma as any).cleaning.create({
    data: {
      tenantId,
      propertyId: property.id,
      teamId: resolvedTeamId,
      scheduledDate,
      status: "PENDING",
      notes,
      reservationId: null,
      assignedToId: null,
      assignmentStatus,
      assignedMembershipId: assignedMembershipId ?? null,
      needsAttention,
      attentionReason,
      // Snapshot de propiedad (requisito técnico para histórico sin depender de Property actual)
      propertyName: property.name,
      propertyShortName: property.shortName ?? null,
      propertyAddress: property.address ?? null,
    },
  });

  console.log("[createCleaning] cleaningId created:", cleaning.id, "assignmentStatus:", assignmentStatus);

  // PASO 5: Si se auto-asignó (1 membership), crear CleaningAssignee + notificación
  if (assignedMembershipId) {
    // Igual que assignTeamMemberToCleaning: findUnique sin filtro de tenantId extra
    const membership = await prisma.teamMembership.findUnique({
      where: { id: assignedMembershipId },
      select: { userId: true },
    });

    console.log("[createCleaning] membership for notification:", membership?.userId ?? "NOT FOUND");

    if (membership) {
      // Crear CleaningAssignee para compatibilidad (si la tabla existe y se usa)
      try {
        await (prisma as any).cleaningAssignee.create({
          data: {
            tenantId,
            cleaningId: cleaning.id,
            userId: membership.userId,
            status: "ASSIGNED",
            assignedAt: new Date(),
            assignedByUserId: null,
          },
        });
        console.log("[createCleaning] assignee created for userId:", membership.userId);
      } catch (error) {
        console.warn("[createCleaning] Error creando CleaningAssignee (puede no existir):", error);
      }

      // Notificar al cleaner auto-asignado
      console.log("[createCleaning] notification target userId:", membership.userId);
      console.log("[createCleaning] calling createNotification...");
      try {
        const notifResult = await createNotification({
          tenantId,
          userId: membership.userId,
          type: "CLEANING_ASSIGNED",
          title: "Limpieza asignada",
          body: `Nueva limpieza en ${property.shortName ?? property.name}.`,
          href: `/cleaner/cleanings/${cleaning.id}`,
          dedupeKey: `cleaning:${cleaning.id}:assigned:${assignedMembershipId}`,
          sendPush: true,
        });
        console.log("[createCleaning] createNotification result:", notifResult?.id ?? "null (dedupe o error)");
      } catch (notifError) {
        console.error("[createCleaning] Error enviando notificación:", notifError);
      }
    } else {
      console.warn("[createCleaning] membership NOT FOUND para assignedMembershipId:", assignedMembershipId);
    }
  } else {
    console.log("[createCleaning] Sin assignedMembershipId — limpieza OPEN, sin notificación.");
  }

  console.log("[assignment-model] createCleaning", {
    cleaningId: cleaning.id,
    origin: "manual",
    teamId: resolvedTeamId ?? null,
    assignedMembershipId: assignedMembershipId ?? null,
    assignmentStatus,
  });

  // Crear snapshot del checklist
  await createChecklistSnapshotForCleaning(tenantId, property.id, cleaning.id);

  revalidatePath("/host/cleanings");
}

export async function setPrimaryAssignee(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const cleaningId = String(formData.get("cleaningId") || "");
  const memberId = String(formData.get("memberId") || "");

  if (!cleaningId || !memberId) {
    redirectBack(formData);
    return;
  }

  try {
    // Obtener la limpieza para verificar teamId
    const cleaning = await (prisma as any).cleaning.findFirst({
      where: {
        id: cleaningId,
        tenantId,
      },
      select: {
        id: true,
        teamId: true,
        status: true,
        needsAttention: true,
        attentionReason: true,
      },
    });

    if (!cleaning) {
      redirectBack(formData);
      return;
    }

    // Freeze guard: no reasignar si ya inició
    assertCleaningIsNotFrozen(cleaningId, cleaning.status);

    // Obtener el miembro y su teamId
    const member = await (prisma as any).teamMember.findFirst({
      where: {
        id: memberId,
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        teamId: true,
      },
    });

    if (!member) {
      redirectBack(formData);
      return;
    }

    // Si la limpieza tiene teamId, verificar que el miembro pertenece a ese equipo
    if (cleaning.teamId && member.teamId !== cleaning.teamId) {
      redirectBack(formData);
      return;
    }

    // Transacción para setear primary
    await (prisma as any).$transaction(async (tx: any) => {
      // Asegurar que exista CleaningAssignee ASSIGNED para memberId
      const existingAssignee = await tx.cleaningAssignee.findFirst({
        where: {
          cleaningId: cleaningId,
          memberId: memberId,
        },
      });

      if (existingAssignee) {
        // Actualizar si existe (cambiar de DECLINED a ASSIGNED si aplica)
        await tx.cleaningAssignee.update({
          where: { id: existingAssignee.id },
          data: {
            status: "ASSIGNED",
          },
        });
      } else {
        // Crear si no existe
        await tx.cleaningAssignee.create({
          data: {
            tenantId,
            cleaningId: cleaningId,
            memberId: memberId,
            status: "ASSIGNED",
            assignedAt: new Date(),
            assignedByUserId: null, // TODO: obtener del usuario autenticado
          },
        });
      }

      // Resolver TeamMember → TeamMembership para usar modelo canónico
      const tmRecord = await (prisma as any).teamMember.findFirst({
        where: { id: memberId, tenantId },
        select: { userId: true, teamId: true },
      });
      const activeMembership = tmRecord
        ? await prisma.teamMembership.findFirst({
            where: { userId: tmRecord.userId, teamId: tmRecord.teamId, status: "ACTIVE" },
            select: { id: true },
          })
        : null;

      // Limpiar needsAttention si era NO_PRIMARY_ASSIGNEE o NO_AVAILABLE_MEMBER
      let finalNeedsAttention = cleaning.needsAttention;
      let finalAttentionReason = cleaning.attentionReason;
      if (cleaning.attentionReason === "NO_PRIMARY_ASSIGNEE" || cleaning.attentionReason === "NO_AVAILABLE_MEMBER") {
        finalNeedsAttention = false;
        finalAttentionReason = null;
      }

      if (activeMembership) {
        assertAssignmentCoherence({ assignedMembershipId: activeMembership.id, needsAttention: finalNeedsAttention, attentionReason: finalAttentionReason }, "setPrimaryAssignee");
        await tx.cleaning.update({
          where: { id: cleaningId },
          data: {
            assignedMembershipId: activeMembership.id,
            assignmentStatus: "ASSIGNED",
            needsAttention: finalNeedsAttention,
            attentionReason: finalAttentionReason,
            ...(cleaning.teamId ? {} : { teamId: member.teamId }),
          },
        });
      }
    });

    revalidatePath("/host/cleanings");
    revalidatePath(`/host/cleanings/${cleaningId}`);
    const returnTo = formData.get("returnTo")?.toString();
    redirect(`/host/cleanings/${cleaningId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  } catch (error) {
    console.error("[setPrimaryAssignee] Error:", error);
    revalidatePath(`/host/cleanings/${cleaningId}`);
    const returnTo = formData.get("returnTo")?.toString();
    redirect(`/host/cleanings/${cleaningId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  }
}

export async function clearPrimaryAssignee(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const cleaningId = String(formData.get("cleaningId") || "");

  if (!cleaningId) {
    redirectBack(formData);
    return;
  }

  try {
    // Verificar que la limpieza existe y pertenece al tenant antes de mutar
    const cleaning = await (prisma as any).cleaning.findFirst({
      where: { id: cleaningId, tenantId },
      select: { id: true },
    });
    if (!cleaning) {
      console.warn("[clearPrimaryAssignee] Cleaning not found or does not belong to tenant:", cleaningId);
      redirectBack(formData);
      return;
    }

    // Transacción para quitar primary y marcar todos los assignees como DECLINED
    await (prisma as any).$transaction(async (tx: any) => {
      // Marcar todos los CleaningAssignee como DECLINED
      await tx.cleaningAssignee.updateMany({
        where: {
          cleaningId: cleaningId,
          status: "ASSIGNED",
        },
        data: {
          status: "DECLINED",
        },
      });

      await tx.cleaning.update({
        where: { id: cleaningId },
        data: {
          assignedMembershipId: null,
          assignmentStatus: "OPEN",
          needsAttention: true,
          attentionReason: "NO_PRIMARY_ASSIGNEE",
        },
      });
    });

    revalidatePath("/host/cleanings");
    revalidatePath(`/host/cleanings/${cleaningId}`);
    const returnTo = formData.get("returnTo")?.toString();
    redirect(`/host/cleanings/${cleaningId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  } catch (error) {
    console.error("[clearPrimaryAssignee] Error:", error);
    revalidatePath(`/host/cleanings/${cleaningId}`);
    const returnTo = formData.get("returnTo")?.toString();
    redirect(`/host/cleanings/${cleaningId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  }
}

/**
 * Cambia el equipo responsable de una limpieza PENDING.
 *
 * Reglas (contrato §FASE-F):
 * - Solo aplica si cleaning.status === "PENDING"
 * - El nuevo team debe tener cobertura válida sobre la propiedad (WGE o PropertyTeam)
 * - Al cambiar team, recalcula el ejecutor con resolveAutoAssignment
 */
export async function changeCleaningTeam(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const cleaningId = String(formData.get("cleaningId") || "");
  const newTeamId = String(formData.get("teamId") || "");

  if (!cleaningId || !newTeamId) {
    redirectBack(formData);
    return;
  }

  try {
    const cleaning = await (prisma as any).cleaning.findFirst({
      where: { id: cleaningId, tenantId },
      select: { id: true, propertyId: true, status: true, teamId: true },
    });

    if (!cleaning) {
      redirectBack(formData);
      return;
    }

    // Freeze guard: no cambiar team si ya inició
    assertCleaningIsNotFrozen(cleaningId, cleaning.status);

    // Validar que el nuevo team tiene cobertura sobre la propiedad
    const { getServiceTeamsForPropertyViaWorkGroupsWithFallback } = await import(
      "@/lib/workgroups/getServiceTeamsForPropertyViaWorkGroups"
    );
    const eligibleTeamIds = await getServiceTeamsForPropertyViaWorkGroupsWithFallback(
      tenantId,
      cleaning.propertyId
    );

    if (!eligibleTeamIds.includes(newTeamId)) {
      console.warn("[changeCleaningTeam] El team no tiene cobertura sobre la propiedad", {
        cleaningId,
        newTeamId,
        propertyId: cleaning.propertyId,
      });
      redirectBack(formData);
      return;
    }

    // Recalcular asignación automática para el nuevo team
    const assignment = await resolveAutoAssignment(cleaning.propertyId, newTeamId);

    assertAssignmentCoherence({ assignedMembershipId: assignment.assignedMembershipId, needsAttention: assignment.needsAttention, attentionReason: assignment.attentionReason }, "changeCleaningTeam");

    await (prisma as any).cleaning.update({
      where: { id: cleaningId },
      data: {
        teamId: newTeamId,
        assignedMembershipId: assignment.assignedMembershipId,
        assignmentStatus: assignment.assignmentStatus,
        needsAttention: assignment.needsAttention,
        attentionReason: assignment.attentionReason,
      },
    });

    console.log("[assignment-model] changeCleaningTeam", {
      cleaningId,
      prevTeamId: cleaning.teamId,
      newTeamId,
      assignedMembershipId: assignment.assignedMembershipId,
      assignmentStatus: assignment.assignmentStatus,
    });

    revalidatePath("/host/cleanings");
    revalidatePath(`/host/cleanings/${cleaningId}`);
    revalidatePath("/host/cleanings/needs-attention");
    const returnTo = formData.get("returnTo")?.toString();
    redirect(`/host/cleanings/${cleaningId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  } catch (error: any) {
    if (error?.name === "CleaningFrozenError") {
      console.warn("[changeCleaningTeam] Intento de cambio en limpieza congelada:", error.message);
      redirectBack(formData);
      return;
    }
    if (error?.message === "NEXT_REDIRECT" || `${error?.digest || ""}`.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("[changeCleaningTeam] Error:", error);
    throw error;
  }
}

