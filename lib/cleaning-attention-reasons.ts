// lib/cleaning-attention-reasons.ts
import { getStartOfCdmxToday, getStartOfCdmxDay, formatScheduledForDetail } from "@/lib/time";

export type CleaningAttentionReasonCode =
  | "NO_AVAILABLE_MEMBER"
  | "DECLINED_BY_ASSIGNEE"
  | "NO_TEAM_EXECUTING"
  | "NO_HOST_TEAM_CONFIG"
  | "NO_PRIMARY_ASSIGNEE"
  | "CLEANING_PENDING_OVERDUE"
  | "CLEANING_PENDING_NO_ASSIGNMENT"
  | "CLEANING_ASSIGNED_NOT_AVAILABLE"
  | "MANUAL_REVIEW_REQUIRED";

export type CleaningAttentionSeverity = "CRITICAL" | "WARNING";

export interface CleaningAttentionReason {
  code: CleaningAttentionReasonCode;
  title: string;
  detail?: string;
  cta?: {
    label: string;
    href: string;
  };
  severity: CleaningAttentionSeverity;
}

/**
 * Mapea attentionReason de la base de datos a mensajes en español.
 */
function mapAttentionReasonToMessage(
  attentionReason: string | null | undefined
): {
  code: CleaningAttentionReasonCode;
  title: string;
  severity: CleaningAttentionSeverity;
} {
  switch (attentionReason) {
    case "NO_AVAILABLE_MEMBER":
      return {
        code: "NO_AVAILABLE_MEMBER",
        title: "Ningún cleaner ha aceptado la limpieza",
        severity: "CRITICAL",
      };
    case "DECLINED_BY_ASSIGNEE":
      return {
        code: "DECLINED_BY_ASSIGNEE",
        title: "Un cleaner declinó la limpieza",
        severity: "CRITICAL",
      };
    case "NO_TEAM_CONFIGURED":
      return {
        code: "NO_HOST_TEAM_CONFIG",
        title: "Configuración de equipo pendiente",
        severity: "WARNING",
      };
    default:
      return {
        code: "MANUAL_REVIEW_REQUIRED",
        title: "Se requiere atención del host para resolver la asignación",
        severity: "CRITICAL",
      };
  }
}

/**
 * Calcula los motivos de "Atención requerida" para una limpieza individual.
 * 
 * La fuente principal es Cleaning.needsAttention y Cleaning.attentionReason (persistidos en DB).
 * Luego complementa con motivos dinámicos si aplican.
 */
export async function getCleaningAttentionReasons(
  tenantId: string,
  cleaning: {
    id: string;
    status: string;
    scheduledDate: Date;
    scheduledAtPlanned?: Date | null;
    assignedMembershipId?: string | null;
    assignedMember?: {
      id: string;
      name: string;
      team?: {
        id: string;
        name: string;
      } | null;
    } | null;
    propertyId: string;
    teamId?: string | null;
    needsAttention: boolean;
    attentionReason: string | null;
    propertyTeamsCount?: number;
    teamMembershipsCount?: number;
    /** Si hay equipos disponibles (UNION de WorkGroups + PropertyTeam). Si no se proporciona, se calcula desde propertyTeamsCount. */
    hasAvailableTeams?: boolean;
  }
): Promise<CleaningAttentionReason[]> {
  const reasons: CleaningAttentionReason[] = [];
  const startOfToday = getStartOfCdmxToday();

  // Solo calcular motivos para limpiezas que no estén completadas o canceladas
  if (cleaning.status === "COMPLETED" || cleaning.status === "CANCELLED") {
    return reasons;
  }

  const scheduledAt = cleaning.scheduledAtPlanned || cleaning.scheduledDate;
  const scheduledDateStart = getStartOfCdmxDay(new Date(scheduledAt));

  const hasExecution = !!cleaning.teamId || !!cleaning.assignedMembershipId;

  // 0) DETECTAR CAUSA RAÍZ: No hay equipo/persona ejecutando la limpieza (CRÍTICO)
  // Solo mostrar si NO hay equipos disponibles (Nivel 0)
  // Si hay equipos disponibles pero no asignados (Nivel 1), NO mostrar este mensaje
  if (!cleaning.teamId && !cleaning.assignedMembershipId) {
    // Verificar si hay equipos disponibles (contexto)
    // Usar hasAvailableTeams si se proporciona (UNION de WorkGroups + PropertyTeam)
    // Si no, calcular desde propertyTeamsCount (fallback para compatibilidad)
    const hasAvailableTeams = cleaning.hasAvailableTeams !== undefined
      ? cleaning.hasAvailableTeams
      : (cleaning.propertyTeamsCount !== undefined && cleaning.propertyTeamsCount > 0);
    
    if (!hasAvailableTeams) {
      // Nivel 0: Sin contexto ejecutor
      reasons.push({
        code: "NO_TEAM_EXECUTING",
        title: "No hay equipos disponibles para esta propiedad.",
        severity: "CRITICAL",
        cta: {
          label: "Ir a propiedad y configurar equipo",
          href: `/host/properties/${cleaning.propertyId}`,
        },
      });
      return reasons;
    }
    // Si hay equipos disponibles (Nivel 1), NO agregar este motivo aquí
    // Se manejará más abajo según needsAttention flag
  }

  // 0.1) AVISO: Configuración de equipo pendiente en Host
  // Solo mostrar si realmente NO hay equipos disponibles (UNION de ambas fuentes)
  const hasAvailableTeamsForWarning = cleaning.hasAvailableTeams !== undefined
    ? cleaning.hasAvailableTeams
    : (cleaning.propertyTeamsCount !== undefined && cleaning.propertyTeamsCount > 0);
  
  if (!hasAvailableTeamsForWarning) {
    reasons.push({
      code: "NO_HOST_TEAM_CONFIG",
      title: "Configuración de equipo pendiente",
      detail:
        "La limpieza no está asignada, porque esta propiedad no tiene un equipo configurado en Host. Esto puede afectar asignaciones automáticas futuras.",
      cta: {
        label: "Ir a propiedad y configurar equipo",
        href: `/host/properties/${cleaning.propertyId}`,
      },
      severity: "WARNING",
    });
  }

  // 0.2) DETECTAR CAUSA RAÍZ: Equipo sin miembros activos
  if (
    cleaning.teamId &&
    cleaning.teamMembershipsCount !== undefined &&
    cleaning.teamMembershipsCount === 0 &&
    (cleaning.propertyTeamsCount === undefined || cleaning.propertyTeamsCount > 0)
  ) {
    reasons.push({
      code: "NO_AVAILABLE_MEMBER",
      title: "El equipo asignado no tiene miembros activos.",
      detail: "Invita o agrega miembros al equipo para poder asignar esta limpieza.",
      cta: {
        label: "Ir a propiedad y configurar equipo",
        href: `/host/properties/${cleaning.propertyId}`,
      },
      severity: "CRITICAL",
    });
    // Si la causa raíz es falta de miembros, no agregar otros motivos
    return reasons;
  }

  // 1) FUENTE PRINCIPAL: Si needsAttention es true, incluir motivos según el nivel
  // PERO: Solo para problemas operativos, NO para configuración cuando hay equipos disponibles
  if (cleaning.needsAttention && !cleaning.assignedMembershipId) {
    const mappedReason = mapAttentionReasonToMessage(cleaning.attentionReason);
    // Usar hasAvailableTeams si se proporciona (UNION de WorkGroups + PropertyTeam)
    // Si no, calcular desde propertyTeamsCount (fallback para compatibilidad)
    const hasAvailableTeams = cleaning.hasAvailableTeams !== undefined
      ? cleaning.hasAvailableTeams
      : (cleaning.propertyTeamsCount !== undefined && cleaning.propertyTeamsCount > 0);
    const attentionReasonStr = cleaning.attentionReason || "";
    
    // Si el motivo es NO_HOST_TEAM_CONFIG o NO_TEAM_CONFIGURED, evitar duplicar cuando hay equipos disponibles
    if (attentionReasonStr === "NO_HOST_TEAM_CONFIG" || attentionReasonStr === "NO_TEAM_CONFIGURED") {
      if (cleaning.propertyTeamsCount === 0) {
        // Ya agregado arriba (Nivel 0), skip
      } else if (cleaning.propertyTeamsCount !== undefined && hasExecution) {
        // Solo agregar si hay ejecución (teamId o assignedMembershipId)
        reasons.push({
          code: mappedReason.code,
          title: mappedReason.title,
          severity: mappedReason.severity,
        });
      }
      // Si hay equipos disponibles pero no hay ejecución (Nivel 1), NO agregar
    } else {
      // Solo agregar si NO es problema de configuración cuando hay equipos disponibles
      // Si hay equipos disponibles (Nivel 1) y el motivo es de configuración, NO agregar
      const isConfigurationIssue = 
        attentionReasonStr === "NO_TEAM_CONFIGURED" ||
        attentionReasonStr === "NO_HOST_TEAM_CONFIG" ||
        mappedReason.code === "NO_TEAM_EXECUTING";
      
      if (!(hasAvailableTeams && isConfigurationIssue)) {
        reasons.push({
          code: mappedReason.code,
          title: mappedReason.title,
          severity: mappedReason.severity,
          detail: scheduledAt ? formatScheduledForDetail(new Date(scheduledAt)) : undefined,
        });
      }
    }
  }

  // 2) COMPLEMENTAR con motivos dinámicos (evitando duplicados)
  // A) Limpieza pendiente y ya está atrasada
  if (
    cleaning.status === "PENDING" &&
    scheduledDateStart < startOfToday &&
    !reasons.some((r) => r.code === "CLEANING_PENDING_OVERDUE")
  ) {
    reasons.push({
      code: "CLEANING_PENDING_OVERDUE",
      title: "Limpieza pendiente con fecha pasada.",
      severity: "CRITICAL",
      detail: formatScheduledForDetail(new Date(scheduledAt)),
    });
  }

  // B) Limpieza pendiente sin cleaner principal asignado (solo si no hay primary)
  if (
    cleaning.status === "PENDING" &&
    !cleaning.assignedMembershipId &&
    !reasons.some((r) => r.code === "CLEANING_PENDING_NO_ASSIGNMENT" || r.code === "NO_AVAILABLE_MEMBER" || r.code === "NO_PRIMARY_ASSIGNEE")
  ) {
    // Solo agregar si hay equipos y miembros disponibles (si no, ya se detectó arriba)
    // Usar hasAvailableTeams si está disponible (UNION de WorkGroups + PropertyTeam)
    const hasAvailableTeamsForPrimary = cleaning.hasAvailableTeams !== undefined
      ? cleaning.hasAvailableTeams
      : (cleaning.propertyTeamsCount !== undefined && cleaning.propertyTeamsCount > 0);
    
    if (hasAvailableTeamsForPrimary &&
        cleaning.teamMembershipsCount !== undefined && cleaning.teamMembershipsCount > 0) {
      reasons.push({
        code: "NO_PRIMARY_ASSIGNEE",
        title: "Esta limpieza aún no tiene un miembro asignado.",
        severity: "CRITICAL",
        detail: formatScheduledForDetail(new Date(scheduledAt)),
      });
    }
  }

  return reasons;
}

