/**
 * Helper para derivar atención requerida basado en el nivel de asignación.
 * 
 * Basado en:
 * - docs/contracts/CLEANING_ASSIGNMENT_V1.md — Sección 4 (Reglas de "Atención requerida")
 * - docs/contracts/CLEANING_DETAIL_UX_V1.md — Sección 3 (Asignación y Atención)
 * 
 * La atención se deriva del nivel, NO al revés.
 */

import { CleaningAssignmentLevel, getCleaningAssignmentLevel } from "./getCleaningAssignmentLevel";
import type { CleaningAttentionLevelInput } from "./getCleaningAttention.types";

export type AttentionType = "CONFIGURATION" | "ACCEPTANCE" | "OPERATIONAL" | null;

export interface CleaningAttentionResult {
  /** Si debe mostrarse atención requerida */
  needsAttention: boolean;
  /** Tipo de atención (si aplica) */
  attentionType: AttentionType;
  /** Código de razón de atención (si aplica) */
  attentionCode: string | null;
  /** Mensaje conceptual (no copy final) */
  messageConcept: string | null;
}

/**
 * Deriva atención requerida basado en el nivel de asignación y contexto adicional.
 */
export function getCleaningAttention(
  input: CleaningAttentionLevelInput
): CleaningAttentionResult {
  const level = getCleaningAssignmentLevel({
    teamId: input.teamId,
    assignedMembershipId: input.assignedMembershipId,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    hasAvailableTeams: input.hasAvailableTeams,
  });

  // Prioridad de status: IN_PROGRESS, COMPLETED y CANCELLED nunca requieren atención visual.
  // El status de ejecución tiene precedencia absoluta sobre el flag persisted needsAttention.
  if (
    input.status === "IN_PROGRESS" ||
    input.status === "COMPLETED" ||
    input.status === "CANCELLED"
  ) {
    return {
      needsAttention: false,
      attentionType: null,
      attentionCode: null,
      messageConcept: null,
    };
  }

  // Nivel 0: Sin contexto ejecutor
  // SIEMPRE requiere atención (configuración)
  if (level === 0) {
    return {
      needsAttention: true,
      attentionType: "CONFIGURATION",
      attentionCode: "NO_TEAM_EXECUTING",
      messageConcept: "No hay equipos disponibles para esta propiedad",
    };
  }

  // Nivel 1: Con contexto disponible pero sin asignar
  // NO muestra atención por defecto (asignación pendiente normal)
  // SOLO muestra atención si hay problema operativo (needsAttention flag)
  if (level === 1) {
    // Si el flag needsAttention está activo, puede ser problema operativo
    if (input.needsAttention && input.attentionReason) {
      // Verificar si es problema operativo (no de configuración)
      const isOperationalIssue = 
        input.attentionReason !== "NO_TEAM_CONFIGURED" &&
        input.attentionReason !== "NO_HOST_TEAM_CONFIG";
      
      if (isOperationalIssue) {
        return {
          needsAttention: true,
          attentionType: "OPERATIONAL",
          attentionCode: input.attentionReason,
          messageConcept: null, // Se deriva del código específico
        };
      }
    }
    
    // Sin atención requerida (asignación pendiente normal)
    return {
      needsAttention: false,
      attentionType: null,
      attentionCode: null,
      messageConcept: null,
    };
  }

  // Nivel 2: Asignada a Team
  // Muestra atención SOLO si el Team no tiene miembros activos
  if (level === 2) {
    if (input.teamMembershipsCount !== undefined && input.teamMembershipsCount === 0) {
      return {
        needsAttention: true,
        attentionType: "CONFIGURATION",
        attentionCode: "NO_AVAILABLE_MEMBER",
        messageConcept: "El equipo asignado no tiene miembros activos",
      };
    }
    
    // Si hay miembros pero needsAttention está activo, puede ser problema operativo
    if (input.needsAttention && input.attentionReason) {
      const isOperationalIssue = 
        input.attentionReason !== "NO_TEAM_CONFIGURED" &&
        input.attentionReason !== "NO_HOST_TEAM_CONFIG" &&
        input.attentionReason !== "NO_AVAILABLE_MEMBER";
      
      if (isOperationalIssue) {
        return {
          needsAttention: true,
          attentionType: "OPERATIONAL",
          attentionCode: input.attentionReason,
          messageConcept: null,
        };
      }
    }
    
    // Sin atención requerida (espera normal de aceptación)
    return {
      needsAttention: false,
      attentionType: null,
      attentionCode: null,
      messageConcept: null,
    };
  }

  // Nivel 3: Aceptada por Cleaner
  // NO muestra atención por defecto (asignación correcta)
  // SOLO muestra atención si hay problema operativo
  if (level === 3) {
    if (input.needsAttention && input.attentionReason) {
      return {
        needsAttention: true,
        attentionType: "OPERATIONAL",
        attentionCode: input.attentionReason,
        messageConcept: null,
      };
    }
    
    return {
      needsAttention: false,
      attentionType: null,
      attentionCode: null,
      messageConcept: null,
    };
  }

  // Nivel 4: En ejecución
  // NO muestra atención por defecto (ejecución normal)
  // SOLO muestra atención si hay problema operativo
  if (level === 4) {
    if (input.needsAttention && input.attentionReason) {
      return {
        needsAttention: true,
        attentionType: "OPERATIONAL",
        attentionCode: input.attentionReason,
        messageConcept: null,
      };
    }
    
    return {
      needsAttention: false,
      attentionType: null,
      attentionCode: null,
      messageConcept: null,
    };
  }

  // Nivel 5: Completada (ya manejado arriba, pero por seguridad)
  return {
    needsAttention: false,
    attentionType: null,
    attentionCode: null,
    messageConcept: null,
  };
}

