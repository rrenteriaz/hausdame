// lib/workgroups/assertNoConflictingExecutor.ts
//
// Helper centralizado para la regla de unicidad operativa de WorkGroupExecutor:
//
//   Para un mismo WorkGroup, no puede haber dos WorkGroupExecutor ACTIVE del mismo
//   servicesTenantId apuntando a teams distintos.
//
// Usado por:
//   - app/host/workgroups/actions-executors.ts  (addExecutorToWorkGroup)
//   - lib/workgroups/toggleExecutorStatus.ts    (al reactivar a ACTIVE)
//   - app/api/host-workgroup-invites/[token]/claim/route.ts (dentro de $transaction)
//
// Acepta cualquier cliente Prisma compatible (instancia completa o tx de $transaction).

import type { PrismaClient } from "../generated/prisma";

// Pick mínimo que necesitamos — compatible tanto con PrismaClient como con
// el cliente de transacción (Prisma.TransactionClient).
type WGEQueryClient = Pick<PrismaClient, "workGroupExecutor">;

export interface ConflictingExecutorParams {
  hostTenantId: string;
  workGroupId: string;
  servicesTenantId: string;
  /** teamId que queremos activar — se excluye del check para permitir reactivación del mismo team. */
  teamId: string;
}

/**
 * Lanza Error si ya existe un WorkGroupExecutor ACTIVE para el mismo WG
 * con el mismo servicesTenantId pero un teamId distinto.
 *
 * @throws Error con mensaje de usuario si existe conflicto.
 */
export async function assertNoConflictingExecutor(
  client: WGEQueryClient,
  params: ConflictingExecutorParams
): Promise<void> {
  const { hostTenantId, workGroupId, servicesTenantId, teamId } = params;

  const conflicting = await client.workGroupExecutor.findFirst({
    where: {
      hostTenantId,
      workGroupId,
      status: "ACTIVE",
      servicesTenantId,
      teamId: { not: teamId },
    },
    select: { teamId: true },
  });

  if (conflicting) {
    throw new Error(
      "Este WorkGroup ya tiene un equipo activo asignado. Desactiva el equipo actual antes de asignar otro."
    );
  }
}
