/**
 * Guard de congelamiento de limpiezas.
 *
 * Regla del contrato: una vez que una limpieza entra en IN_PROGRESS,
 * no se puede cambiar teamId ni assignedMembershipId.
 *
 * Lanzar antes de cualquier acción que modifique:
 * - teamId
 * - assignedMembershipId
 */

export class CleaningFrozenError extends Error {
  readonly cleaningId: string;
  readonly status: string;

  constructor(cleaningId: string, status: string) {
    super(
      `CLEANING_FROZEN: La limpieza ${cleaningId} está en estado ${status} y no admite reasignación.`
    );
    this.name = "CleaningFrozenError";
    this.cleaningId = cleaningId;
    this.status = status;
  }
}

/**
 * Lanza CleaningFrozenError si la limpieza está congelada (IN_PROGRESS o COMPLETED).
 */
export function assertCleaningIsNotFrozen(
  cleaningId: string,
  status: string
): void {
  if (status === "IN_PROGRESS" || status === "COMPLETED") {
    throw new CleaningFrozenError(cleaningId, status);
  }
}
