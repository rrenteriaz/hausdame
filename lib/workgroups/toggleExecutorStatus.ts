// lib/workgroups/toggleExecutorStatus.ts
// Función backend para cambiar WorkGroupExecutor.status y aplicar efectos en limpiezas futuras

import prisma from "@/lib/prisma";

export interface ToggleExecutorStatusParams {
  hostTenantId: string;
  workGroupId: string;
  teamId: string;
  newStatus: "ACTIVE" | "INACTIVE";
}

export interface ToggleExecutorStatusResult {
  success: boolean;
  executorId: string;
  affectedCleaningsCount: number;
  message?: string;
}

/**
 * Cambia el status de un WorkGroupExecutor y aplica efectos en limpiezas futuras.
 * 
 * Efectos al pasar a INACTIVE:
 * - Limpiezas FUTURAS asignadas o reclamadas por ese Team/TL pasan a "Sin asignar"
 * - Se activa attentionReason con código "NO_TEAM_EXECUTING"
 * - Limpiezas PASADAS no se modifican
 * 
 * Efectos al pasar a ACTIVE:
 * - No re-asigna automáticamente limpiezas
 * - Solo re-habilita visibilidad/posible asignación futura
 * 
 * @param params - Parámetros para toggle del executor
 * @returns Resultado de la operación
 */
export async function toggleExecutorStatus(
  params: ToggleExecutorStatusParams
): Promise<ToggleExecutorStatusResult> {
  const { hostTenantId, workGroupId, teamId, newStatus } = params;

  // Validar que el executor existe y pertenece al hostTenantId/workGroupId
  const executor = await prisma.workGroupExecutor.findFirst({
    where: {
      hostTenantId,
      workGroupId,
      teamId,
    },
    select: {
      id: true,
      status: true,
      servicesTenantId: true,
    },
  });

  if (!executor) {
    throw new Error(
      `WorkGroupExecutor no encontrado para hostTenantId=${hostTenantId}, workGroupId=${workGroupId}, teamId=${teamId}`
    );
  }

  // Si ya está en el estado deseado, no hacer nada
  if (executor.status === newStatus) {
    return {
      success: true,
      executorId: executor.id,
      affectedCleaningsCount: 0,
      message: `El executor ya está en estado ${newStatus}`,
    };
  }

  // Aplicar cambios en transacción
  const result = await prisma.$transaction(async (tx) => {
    // 1. Actualizar el executor
    await tx.workGroupExecutor.update({
      where: { id: executor.id },
      data: { status: newStatus },
    });

    let affectedCleaningsCount = 0;

    // 2. Si se desactiva (INACTIVE), afectar limpiezas futuras
    if (newStatus === "INACTIVE") {
      const now = new Date();

      // Obtener TeamMemberships del team para identificar limpiezas asignadas
      const teamMemberships = await tx.teamMembership.findMany({
        where: {
          teamId,
          status: "ACTIVE",
        },
        select: {
          id: true,
        },
      });

      const membershipIds = teamMemberships.map((m) => m.id);

      // Obtener propertyIds asignadas al WorkGroup (para filtrar limpiezas)
      const workGroupProperties = await tx.hostWorkGroupProperty.findMany({
        where: {
          tenantId: hostTenantId,
          workGroupId,
        },
        select: { propertyId: true },
      });

      const propertyIds = workGroupProperties.map((p) => p.propertyId);

      if (propertyIds.length === 0) {
        // Si no hay propiedades asignadas, no hay limpiezas que afectar
        return {
          success: true,
          executorId: executor.id,
          affectedCleaningsCount: 0,
        };
      }

      // Identificar limpiezas FUTURAS asociadas a este executor/team
      // Criterio: limpiezas con scheduledDate >= now que están asignadas a este team
      // o tienen assignedMembershipId del team
      const futureCleanings = await tx.cleaning.findMany({
        where: {
          propertyId: {
            in: propertyIds,
          },
          scheduledDate: {
            gte: now, // Solo futuras
          },
          status: {
            not: "COMPLETED", // Excluir completadas
          },
          OR: [
            // Limpiezas asignadas a memberships del team
            ...(membershipIds.length > 0
              ? [
                  {
                    assignedMembershipId: { in: membershipIds },
                  },
                ]
              : []),
            // Limpiezas con teamId del executor
            {
              teamId,
            },
          ],
        },
        select: {
          id: true,
          assignmentStatus: true,
        },
      });

      // Aplicar cambios a limpiezas futuras
      if (futureCleanings.length > 0) {
        const cleaningIds = futureCleanings.map((c) => c.id);

        // Pasar a "Sin asignar" y activar attentionReason
        await tx.cleaning.updateMany({
          where: {
            id: { in: cleaningIds },
          },
          data: {
            assignmentStatus: "OPEN",
            assignedMembershipId: null,
            teamId: null,
            needsAttention: true,
            attentionReason: "NO_TEAM_EXECUTING",
          },
        });

        // Limpiar CleaningAssignee relacionadas (si existen)
        // Nota: CleaningAssignee usa memberId (TeamMember), no userId directamente
        // Por ahora, solo limpiamos los campos principales de Cleaning
        // CleaningAssignee se puede limpiar manualmente o en una fase posterior si es necesario

        affectedCleaningsCount = futureCleanings.length;
      }
    }
    // Si se activa (ACTIVE), no hacer cambios automáticos en limpiezas
    // Solo re-habilitar visibilidad

    return {
      success: true,
      executorId: executor.id,
      affectedCleaningsCount,
    };
  });

  return result;
}

