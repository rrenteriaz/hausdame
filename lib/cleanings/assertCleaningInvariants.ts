/**
 * Invariantes del modelo de limpiezas.
 * Referencia: docs/contracts/cleaning-operating-model.md
 *
 * Estas funciones lanzan inmediatamente si se viola un contrato.
 * No cambian lógica — solo aseguran que la lógica que llegó aquí es correcta.
 */

/**
 * Invariante §3: assignedMembershipId != null → needsAttention debe ser false.
 *
 * Si alguien asigna un miembro y deja needsAttention=true al mismo tiempo,
 * el modelo está en estado incoherente.
 */
export function assertAssignmentCoherence(
  {
    assignedMembershipId,
    needsAttention,
    attentionReason,
  }: {
    assignedMembershipId: string | null | undefined;
    needsAttention: boolean;
    attentionReason?: string | null;
  },
  context: string
): void {
  if (assignedMembershipId != null && needsAttention) {
    throw new Error(
      `Invariant violated [${context}]: assignedMembershipId is set but needsAttention=true. ` +
        `assignedMembershipId=${assignedMembershipId}, attentionReason=${attentionReason ?? "null"}`
    );
  }
}

/**
 * Invariante §8/§10: scheduledDate debe ser un Date válido (no NaN, no null, no undefined).
 *
 * Un Date inválido en DB produce horarios corruptos imposibles de depurar.
 */
export function assertValidScheduledDate(date: unknown, context: string): void {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error(
      `Invariant violated [${context}]: scheduledDate is not a valid Date. Got: ${String(date)}`
    );
  }
}
