/**
 * Tipos para el helper de atención requerida.
 */

export interface CleaningAttentionLevelInput {
  /** ID del Team asignado a la limpieza (null si no hay) */
  teamId: string | null;
  /** ID del TeamMembership que aceptó la limpieza (null si no hay) */
  assignedMembershipId: string | null;
  /** Estado de ejecución de la limpieza */
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  /** Timestamp de inicio de ejecución (null si no ha iniciado) */
  startedAt: Date | null;
  /** Timestamp de finalización (null si no ha completado) */
  completedAt: Date | null;
  /** Indica si hay equipos disponibles para la propiedad (contexto) */
  hasAvailableTeams: boolean;
  /** Flag existente de needsAttention (para problemas operativos) */
  needsAttention: boolean;
  /** Código de razón de atención existente (si aplica) */
  attentionReason: string | null;
  /** Cantidad de TeamMemberships activos en el Team asignado (si aplica) */
  teamMembershipsCount?: number;
}

