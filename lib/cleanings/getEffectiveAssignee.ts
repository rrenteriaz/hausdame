/**
 * lib/cleanings/getEffectiveAssignee.ts
 *
 * Helper canónico para resolver el ejecutor efectivo de una limpieza.
 *
 * Regla (contrato §CAMPOS OFICIALES):
 *   assignedMembershipId es el único campo oficial de asignación.
 *   Si existe → hay ejecutor. Si es null → sin ejecutor.
 *
 * Esta función es la única fuente de verdad para lecturas de asignación.
 * NO modificar lógica de escritura aquí.
 */

export interface EffectiveAssignee {
  /** ID del TeamMembership que ejecuta la limpieza */
  id: string;
  source: "membership";
}

export interface CleaningAssigneeFields {
  assignedMembershipId?: string | null;
}

/**
 * Retorna el ejecutor efectivo de una limpieza.
 */
export function getEffectiveAssignee(
  cleaning: CleaningAssigneeFields
): EffectiveAssignee | null {
  if (cleaning.assignedMembershipId) {
    return { id: cleaning.assignedMembershipId, source: "membership" };
  }
  return null;
}

/**
 * Indica si la limpieza tiene un ejecutor asignado.
 */
export function hasEffectiveAssignee(cleaning: CleaningAssigneeFields): boolean {
  return cleaning.assignedMembershipId != null;
}

/**
 * Indica si el ejecutor fue asignado por membership (único modelo válido).
 */
export function isAssignedByMembership(cleaning: CleaningAssigneeFields): boolean {
  return cleaning.assignedMembershipId != null;
}
