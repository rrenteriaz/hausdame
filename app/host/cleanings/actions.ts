// app/host/cleanings/actions.ts
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CleaningStatus } from "@prisma/client";
import { getEligibleMembersForCleaning } from "@/lib/cleaning-eligibility";
import { createChecklistSnapshotForCleaning } from "@/lib/checklist-snapshot";
import { createOrUpdateInventoryReview } from "@/app/host/inventory-review/actions";
import { InventoryReviewStatus } from "@prisma/client";
// FASE 5: property-id-helper eliminado, propertyId ahora es el PK directamente

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

  revalidatePath("/host/cleanings");
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

  revalidatePath("/host/cleanings");
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
        assignedMemberId: true,
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

      // Si cleaning.assignedMemberId es null, setearlo al primer asignado (primary)
      // El primer cleaner asignado es automáticamente el principal
      if (!cleaning.assignedMemberId) {
        await tx.cleaning.update({
          where: { id: cleaningId },
          data: {
            assignedMemberId: memberId,
            assignmentStatus: "ASSIGNED",
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
  // FASE 4.4.2: Soporte para assigneeType dual (MEMBERSHIP | TEAM_MEMBER)
  const assigneeType = formData.get("assigneeType")?.toString() as "MEMBERSHIP" | "TEAM_MEMBER" | null;
  const assignedMembershipId = formData.get("assignedMembershipId")?.toString() || null;
  const teamMemberId = formData.get("teamMemberId")?.toString() || null;

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

  // FASE 4.4.2: Validar assignee según assigneeType
  let finalAssigneeId: string | null = null;
  
  if (assigneeType === "MEMBERSHIP" && assignedMembershipId) {
    // Validar que el TeamMembership existe, pertenece al tenant y al team de la limpieza
    const membership = await prisma.teamMembership.findFirst({
      where: {
        id: assignedMembershipId,
        status: "ACTIVE",
        role: "CLEANER",
        teamId: cleaning.teamId || undefined,
        Team: { tenantId },
      },
      select: {
        id: true,
        teamId: true,
      },
    });

    if (!membership || (cleaning.teamId && membership.teamId !== cleaning.teamId)) {
      redirectBack(formData);
      return;
    }

    finalAssigneeId = assignedMembershipId;
  } else if (assigneeType === "TEAM_MEMBER" && teamMemberId) {
    // Validar que el TeamMember existe y pertenece al team de la limpieza (legacy)
    const member = await (prisma as any).teamMember.findFirst({
      where: {
        id: teamMemberId,
        isActive: true,
        tenantId,
        teamId: cleaning.teamId || undefined,
      },
      select: {
        id: true,
        teamId: true,
      },
    });

    if (!member || (cleaning.teamId && member.teamId !== cleaning.teamId)) {
      redirectBack(formData);
      return;
    }

    finalAssigneeId = teamMemberId;
  } else if (!assigneeType && teamMemberId) {
    // Legacy: sin assigneeType, usar teamMemberId (compatibilidad hacia atrás)
    finalAssigneeId = teamMemberId;
  }

  // Calcular si necesita atención después de la asignación
  let needsAttention = false;
  let attentionReason: string | null = null;

  if (finalAssigneeId) {
    // Se está asignando un miembro
    const scheduledAt = cleaning.scheduledAtPlanned || cleaning.scheduledDate;
    
    // Verificar si el miembro asignado está disponible
    // Nota: getEligibleMembersForCleaning solo funciona con TeamMember legacy
    // Para membership mode, la validación de disponibilidad se puede hacer después si es necesario
    try {
      let assignedMemberIsEligible = true;
      
      // Solo validar disponibilidad si es legacy (TeamMember)
      if (assigneeType === "TEAM_MEMBER" || (!assigneeType && teamMemberId)) {
        const eligibleMembers = await getEligibleMembersForCleaning(
          tenantId,
          cleaning.propertyId,
          scheduledAt
        );

        assignedMemberIsEligible = eligibleMembers.some(
          (m) => m.id === finalAssigneeId
        );
      }
      // Para membership mode, por ahora asumimos disponible (validación futura)

      if (!assignedMemberIsEligible) {
        // El miembro asignado no está disponible → marcar para atención
        needsAttention = true;
        attentionReason = "CLEANING_ASSIGNED_NOT_AVAILABLE";
      } else {
        // El miembro está disponible → limpiar flags de atención (si el motivo era NO_AVAILABLE_MEMBER)
        if (cleaning.attentionReason === "NO_AVAILABLE_MEMBER") {
          needsAttention = false;
          attentionReason = null;
        } else {
          // Mantener el estado actual si el motivo es otro (ej: DECLINED_BY_ASSIGNEE)
          needsAttention = cleaning.needsAttention;
          attentionReason = cleaning.attentionReason;
        }
      }
    } catch (error) {
      console.error("[assignTeamMemberToCleaning] Error verificando disponibilidad:", error);
      // En caso de error, limpiar flags si el motivo era NO_AVAILABLE_MEMBER
      if (cleaning.attentionReason === "NO_AVAILABLE_MEMBER") {
        needsAttention = false;
        attentionReason = null;
      } else {
        needsAttention = cleaning.needsAttention;
        attentionReason = cleaning.attentionReason;
      }
    }
  } else {
    // Se está quitando la asignación → recalcular si necesita atención
    const scheduledAt = cleaning.scheduledAtPlanned || cleaning.scheduledDate;
    
    try {
      const eligibleMembers = await getEligibleMembersForCleaning(
        tenantId,
        cleaning.propertyId,
        scheduledAt
      );

      if (eligibleMembers.length === 0) {
        // No hay miembros disponibles → marcar para atención
        needsAttention = true;
        attentionReason = "NO_AVAILABLE_MEMBER";
      } else {
        // Hay miembros disponibles → limpiar flags
        needsAttention = false;
        attentionReason = null;
      }
    } catch (error) {
      console.error("[assignTeamMemberToCleaning] Error verificando disponibilidad:", error);
      // En caso de error, mantener el estado actual
      needsAttention = cleaning.needsAttention;
      attentionReason = cleaning.attentionReason;
    }
  }

  // Transacción para actualizar cleaning y sincronizar CleaningAssignee
  await (prisma as any).$transaction(async (tx: any) => {
    // FASE 4.4.2: Actualizar cleaning con assignedMembershipId o assignedMemberId según assigneeType
    const updateData: any = {
      assignmentStatus: finalAssigneeId ? "ASSIGNED" : "OPEN",
      needsAttention,
      attentionReason,
    };

    if (assigneeType === "MEMBERSHIP") {
      // Asignar membership: set assignedMembershipId, clear assignedMemberId
      updateData.assignedMembershipId = finalAssigneeId;
      updateData.assignedMemberId = null;
      updateData.assignedTeamMemberId = null;
    } else if (assigneeType === "TEAM_MEMBER" || (!assigneeType && teamMemberId)) {
      // Asignar legacy: set assignedMemberId, clear assignedMembershipId
      updateData.assignedMemberId = finalAssigneeId;
      updateData.assignedTeamMemberId = finalAssigneeId; // Mantener compatibilidad legacy
      updateData.assignedMembershipId = null;
    } else {
      // Sin asignación: clear ambos
      updateData.assignedMemberId = null;
      updateData.assignedTeamMemberId = null;
      updateData.assignedMembershipId = null;
    }

    await tx.cleaning.updateMany({
      where: {
        id: cleaningId,
        tenantId,
      },
      data: updateData,
    });

    // Sincronizar CleaningAssignee (solo para legacy TeamMember)
    if (finalAssigneeId && (assigneeType === "TEAM_MEMBER" || (!assigneeType && teamMemberId))) {
      // Upsert: crear o actualizar CleaningAssignee (solo para legacy)
      // Verificar si ya existe
      const existingAssignee = await tx.cleaningAssignee.findFirst({
        where: {
          cleaningId: cleaningId,
          memberId: finalAssigneeId,
        },
      });

      if (existingAssignee) {
        // Actualizar si existe
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
            memberId: finalAssigneeId,
            status: "ASSIGNED",
            assignedAt: new Date(),
            assignedByUserId: null, // TODO: obtener del usuario autenticado
          },
        });
      }
    } else if (!finalAssigneeId) {
      // Si se quita la asignación, marcar todos los assignees como DECLINED o eliminar
      // Por ahora, solo marcar como DECLINED si existían
      await tx.cleaningAssignee.updateMany({
        where: {
          cleaningId: cleaningId,
          status: "ASSIGNED",
        },
        data: {
          status: "DECLINED",
        },
      });
    }
    // Nota: Para membership mode, no se usa CleaningAssignee (solo legacy)
  });

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

  const scheduledDate = new Date(scheduledAtStr);

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

  // PASO 1: Determinar el equipo de limpieza de la propiedad (flag-aware: WGE o PropertyTeam legacy)
  const useWorkGroupReads = process.env.WORKGROUP_READS_ENABLED === "1";
  let teamId: string | null = null;

  if (useWorkGroupReads) {
    const { getServiceTeamsForPropertyViaWorkGroups } = await import(
      "@/lib/workgroups/resolveWorkGroupsForProperty"
    );
    const wgeTeamIds = await getServiceTeamsForPropertyViaWorkGroups(tenantId, property.id);
    if (wgeTeamIds.length === 1) {
      teamId = wgeTeamIds[0];
    } else if (wgeTeamIds.length > 1) {
      // Un solo query para todos: preferir el primer equipo con al menos 1 membership ACTIVE
      const membershipsPerTeam = await prisma.teamMembership.findMany({
        where: { teamId: { in: wgeTeamIds }, status: "ACTIVE" },
        select: { teamId: true },
      });
      const teamsWithMembers = new Set(membershipsPerTeam.map((m) => m.teamId));
      // Mantener orden canónico (wgeTeamIds ya viene ordenado por ID)
      teamId = wgeTeamIds.find((id) => teamsWithMembers.has(id)) ?? wgeTeamIds[0];
    }
    // wgeTeamIds.length === 0 → teamId permanece null → NO_TEAM_CONFIGURED
  } else {
    const propertyTeam = await (prisma as any).propertyTeam.findFirst({
      where: {
        propertyId: property.id,
        tenantId,
      },
      select: {
        teamId: true,
      },
    });
    teamId = propertyTeam?.teamId ?? null;
  }

  const assignedMemberId: string | null = null;
  let assignmentStatus: "OPEN" | "ASSIGNED" = "OPEN";
  let needsAttention = false;
  let attentionReason: string | null = null;

  // PASO 2: Si hay equipo, obtener memberships activas del equipo
  let assignedMembershipId: string | null = null;
  if (teamId) {
    // Obtener TeamMembership ACTIVE del equipo (estándar)
    const activeMemberships = await prisma.teamMembership.findMany({
      where: {
        teamId: teamId!, // teamId no puede ser null aquí porque propertyTeam existe
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    // PASO 3: Reglas de asignación según cantidad de memberships
    if (activeMemberships.length === 1) {
      // Solo 1 membership → auto-asignar usando assignedMembershipId
      assignedMembershipId = activeMemberships[0].id;
      assignmentStatus = "ASSIGNED";
    } else if (activeMemberships.length === 0) {
      // 0 memberships → marcar para atención
      needsAttention = true;
      attentionReason = "NO_AVAILABLE_MEMBER";
    }
    // Si hay 2+ memberships, queda OPEN (sin asignar) - requiere selección manual
  } else {
    // No hay equipo configurado → marcar para atención
    needsAttention = true;
    attentionReason = "NO_TEAM_CONFIGURED";
  }

  // PASO 4: Crear la limpieza con snapshot de propiedad (requisito técnico)
  const cleaning = await (prisma as any).cleaning.create({
    data: {
      tenantId,
      propertyId: property.id,
      teamId: teamId,
      scheduledDate,
      status: "PENDING",
      notes,
      reservationId: null,
      assignedToId: null,
      assignmentStatus,
      assignedMemberId: null, // Legacy - no usar para auto-asignación
      assignedMembershipId: assignedMembershipId, // Estándar - usar para auto-asignación
      needsAttention,
      attentionReason,
      // Snapshot de propiedad (requisito técnico para histórico sin depender de Property actual)
      propertyName: property.name,
      propertyShortName: property.shortName ?? null,
      propertyAddress: property.address ?? null,
    },
  });

  // PASO 5: Si se auto-asignó (1 membership), crear CleaningAssignee (opcional, para compatibilidad)
  // Nota: La asignación principal está en cleaning.assignedMembershipId
  if (assignedMembershipId) {
    // Obtener el userId de la membership para crear CleaningAssignee si es necesario
    const membership = await prisma.teamMembership.findFirst({
      where: {
        id: assignedMembershipId,
        Team: { tenantId },
      },
      select: { userId: true },
    });
    
    if (membership) {
      // Crear CleaningAssignee para compatibilidad (si la tabla existe y se usa)
      try {
        await (prisma as any).cleaningAssignee.create({
          data: {
            tenantId,
            cleaningId: cleaning.id,
            userId: membership.userId, // Usar userId en lugar de memberId
            status: "ASSIGNED",
            assignedAt: new Date(),
            assignedByUserId: null, // Auto-asignado
          },
        });
      } catch (error) {
        // Si CleaningAssignee no existe o falla, continuar (la asignación principal está en cleaning.assignedMembershipId)
        console.warn("[createCleaning] Error creando CleaningAssignee (puede no existir):", error);
      }
    }
  }

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
        assignedMemberId: true,
        needsAttention: true,
        attentionReason: true,
      },
    });

    if (!cleaning) {
      redirectBack(formData);
      return;
    }

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

      // Setear cleaning.assignedMemberId = memberId (primary)
      const newNeedsAttention = cleaning.needsAttention;
      const newAttentionReason = cleaning.attentionReason;
      
      // Limpiar needsAttention si era NO_PRIMARY_ASSIGNEE o NO_AVAILABLE_MEMBER
      let finalNeedsAttention = newNeedsAttention;
      let finalAttentionReason = newAttentionReason;
      
      if (cleaning.attentionReason === "NO_PRIMARY_ASSIGNEE" || cleaning.attentionReason === "NO_AVAILABLE_MEMBER") {
        // Verificar si hay otros motivos que requieran atención
        // Por ahora, limpiar si era solo NO_PRIMARY_ASSIGNEE o NO_AVAILABLE_MEMBER
        finalNeedsAttention = false;
        finalAttentionReason = null;
      }

      // Actualizar cleaning: setear primary y teamId si no existe
      await tx.cleaning.update({
        where: { id: cleaningId },
        data: {
          assignedMemberId: memberId,
          assignmentStatus: "ASSIGNED",
          needsAttention: finalNeedsAttention,
          attentionReason: finalAttentionReason,
          // Si cleaning.teamId es null, actualizarlo con el teamId del miembro
          ...(cleaning.teamId ? {} : { teamId: member.teamId }),
        },
      });
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

      // Setear cleaning.assignedMemberId = NULL
      await tx.cleaning.update({
        where: { id: cleaningId },
        data: {
          assignedMemberId: null,
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

