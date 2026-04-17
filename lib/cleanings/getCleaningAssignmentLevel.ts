/**
 * Helper canónico para determinar el nivel de asignación de una limpieza.
 *
 * Basado en: docs/contracts/cleaning-assignment-model.md
 *
 * Este helper es la única fuente de verdad para el nivel de asignación.
 * NO infiere estados, NO lee UI, NO toca DB.
 */

import { hasEffectiveAssignee } from "./getEffectiveAssignee";

export type CleaningAssignmentLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface CleaningAssignmentLevelInput {
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
}

/**
 * Determina el nivel de asignación de una limpieza.
 * 
 * Niveles:
 * - 0: Sin contexto ejecutor (no hay equipos disponibles)
 * - 1: Con contexto disponible pero sin asignar (hay equipos, pero teamId es null)
 * - 2: Asignada a Team (teamId existe, pero assignedMembershipId es null)
 * - 3: Aceptada por Cleaner (assignedMembershipId existe)
 * - 4: En ejecución (status: IN_PROGRESS)
 * - 5: Completada (status: COMPLETED)
 */
export function getCleaningAssignmentLevel(
  input: CleaningAssignmentLevelInput
): CleaningAssignmentLevel {
  const {
    teamId,
    assignedMembershipId,
    status,
    startedAt,
    completedAt,
    hasAvailableTeams,
  } = input;

  // Nivel 5: Completada (estado terminal)
  if (status === "COMPLETED" && completedAt !== null) {
    return 5;
  }

  // Nivel 4: En ejecución
  if (status === "IN_PROGRESS" && startedAt !== null) {
    return 4;
  }

  // Nivel 3: Aceptada por Cleaner
  if (hasEffectiveAssignee({ assignedMembershipId })) {
    return 3;
  }

  // Nivel 2: Asignada a Team
  // Tiene teamId pero no tiene assignedMembershipId
  if (teamId !== null) {
    return 2;
  }

  // Nivel 1: Con contexto disponible pero sin asignar
  // No tiene teamId pero hay equipos disponibles
  if (hasAvailableTeams) {
    return 1;
  }

  // Nivel 0: Sin contexto ejecutor
  // No tiene teamId y no hay equipos disponibles
  return 0;
}

