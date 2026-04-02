/**
 * Sistema visual centralizado para limpiezas.
 * Fuente única de verdad para colores, badges e iconos.
 *
 * NO contiene lógica de negocio — solo mapea estados a clases visuales.
 */

// ─── Tipos de estado ────────────────────────────────────────────────────────

/** Perspectiva del Cleaner */
export type CleanerKind =
  | "mine_pending"      // Asignada a mí, PENDING
  | "mine_inprogress"   // Asignada a mí, IN_PROGRESS
  | "available"         // OPEN, PENDING, claimable, futura
  | "available_overdue" // OPEN, PENDING, claimable, fecha pasada
  | "other_member"      // Asignada a otro del mismo equipo
  | "completed"         // COMPLETED
  | "lost"              // OPEN pero fuera de ventana temporal (no reclamable)
  | "open_past"         // OPEN, PENDING, pasada, dentro de ventana (claimable)

/** Perspectiva del Host */
export type HostKind =
  | "unassigned"        // OPEN, sin cleaner, PENDING
  | "assigned_pending"  // ASSIGNED, PENDING
  | "in_progress"       // IN_PROGRESS
  | "completed"         // COMPLETED
  | "cancelled"         // CANCELLED

// ─── Resultado visual ────────────────────────────────────────────────────────

export interface CleaningVisual {
  /** Badge largo para listas: "Mía · En progreso" */
  badgeFull: string;
  /** Badge corto para calendario: "Prog." */
  badgeShort: string;

  // Calendar pill (fondo claro para no saturar la celda)
  pillBg: string;
  pillText: string;

  // List card
  cardBg: string;
  cardBorder: string;
  cardText: string;
  /** Acento izquierdo border-l-4 */
  accentBorder: string;

  // Inline badge chip (sólido donde aplica, para máximo contraste semántico)
  badgeBg: string;
  badgeTextColor: string;

  isActionable: boolean;
  dimmed: boolean;
  strikethrough: boolean;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/**
 * Extrae el primer nombre de un nombre completo para badges compactos.
 * "Itzel García López" → "Itzel"
 */
export function firstNameOf(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first ?? null;
}

/**
 * Trunca un texto al máximo de caracteres para uso en badges de calendario.
 */
export function truncateBadge(text: string, maxChars = 7): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

// ─── Cleaner visual states ────────────────────────────────────────────────────

export function getCleanerVisual(kind: CleanerKind): CleaningVisual {
  switch (kind) {
    // ── Mía, pendiente: azul suave
    case "mine_pending":
      return {
        badgeFull: "Mía",
        badgeShort: "Mía",
        pillBg: "bg-blue-100",
        pillText: "text-blue-900",
        cardBg: "bg-blue-50",
        cardBorder: "border-blue-200",
        cardText: "text-blue-900",
        accentBorder: "border-l-blue-500",
        badgeBg: "bg-blue-500",
        badgeTextColor: "text-white",
        isActionable: false,
        dimmed: false,
        strikethrough: false,
      };

    // ── Mía, en progreso: azul fuerte (MÁS peso visual)
    case "mine_inprogress":
      return {
        badgeFull: "Mía · En progreso",
        badgeShort: "Prog.",
        pillBg: "bg-blue-200",
        pillText: "text-blue-900",
        cardBg: "bg-blue-100",
        cardBorder: "border-blue-400",
        cardText: "text-blue-900",
        accentBorder: "border-l-blue-700",
        badgeBg: "bg-blue-700",
        badgeTextColor: "text-white",
        isActionable: false,
        dimmed: false,
        strikethrough: false,
      };

    // ── Disponible (futura): verde sólido — claramente accionable
    case "available":
      return {
        badgeFull: "Disponible",
        badgeShort: "Libre",
        pillBg: "bg-emerald-100",
        pillText: "text-emerald-900",
        cardBg: "bg-emerald-50",
        cardBorder: "border-emerald-300",
        cardText: "text-emerald-900",
        accentBorder: "border-l-emerald-500",
        badgeBg: "bg-emerald-500",
        badgeTextColor: "text-white",
        isActionable: true,
        dimmed: false,
        strikethrough: false,
      };

    // ── Disponible, atrasada: ámbar sólido
    case "available_overdue":
      return {
        badgeFull: "Disponible · Atrasada",
        badgeShort: "Atras.",
        pillBg: "bg-amber-100",
        pillText: "text-amber-900",
        cardBg: "bg-amber-50",
        cardBorder: "border-amber-300",
        cardText: "text-amber-900",
        accentBorder: "border-l-amber-500",
        badgeBg: "bg-amber-500",
        badgeTextColor: "text-white",
        isActionable: true,
        dimmed: false,
        strikethrough: false,
      };

    // ── Open pasada (dentro de ventana): igual que available_overdue
    case "open_past":
      return {
        badgeFull: "Disponible · Atrasada",
        badgeShort: "Atras.",
        pillBg: "bg-amber-100",
        pillText: "text-amber-900",
        cardBg: "bg-amber-50",
        cardBorder: "border-amber-300",
        cardText: "text-amber-900",
        accentBorder: "border-l-amber-500",
        badgeBg: "bg-amber-500",
        badgeTextColor: "text-white",
        isActionable: true,
        dimmed: false,
        strikethrough: false,
      };

    // ── Otro cleaner: gris apagado, explícitamente "ocupada, no mía"
    case "other_member":
      return {
        badgeFull: "Otro cleaner",
        badgeShort: "Otro",
        pillBg: "bg-neutral-100",
        pillText: "text-neutral-500",
        cardBg: "bg-neutral-50",
        cardBorder: "border-neutral-300",
        cardText: "text-neutral-600",
        accentBorder: "border-l-neutral-400",
        badgeBg: "bg-neutral-300",
        badgeTextColor: "text-neutral-700",
        isActionable: false,
        dimmed: true,
        strikethrough: false,
      };

    // ── Completada: verde muy suave (resuelta, sin protagonismo)
    case "completed":
      return {
        badgeFull: "Completada",
        badgeShort: "OK",
        pillBg: "bg-emerald-50",
        pillText: "text-emerald-700",
        cardBg: "bg-emerald-50",
        cardBorder: "border-emerald-200",
        cardText: "text-emerald-800",
        accentBorder: "border-l-emerald-400",
        badgeBg: "bg-emerald-100",
        badgeTextColor: "text-emerald-700",
        isActionable: false,
        dimmed: false,
        strikethrough: false,
      };

    // ── Perdida / no disponible: gris pálido tachado
    case "lost":
      return {
        badgeFull: "No disponible",
        badgeShort: "N/D",
        pillBg: "bg-neutral-50",
        pillText: "text-neutral-400",
        cardBg: "bg-neutral-50",
        cardBorder: "border-neutral-200",
        cardText: "text-neutral-400",
        accentBorder: "border-l-neutral-200",
        badgeBg: "bg-neutral-200",
        badgeTextColor: "text-neutral-500",
        isActionable: false,
        dimmed: true,
        strikethrough: true,
      };
  }
}

// ─── Host visual states ───────────────────────────────────────────────────────

export function getHostVisual(kind: HostKind): CleaningVisual {
  switch (kind) {
    // ── Sin cleaner: naranja sólido — requiere acción del Host
    case "unassigned":
      return {
        badgeFull: "Sin cleaner",
        badgeShort: "S/C",
        pillBg: "bg-orange-100",
        pillText: "text-orange-900",
        cardBg: "bg-orange-50",
        cardBorder: "border-orange-300",
        cardText: "text-orange-900",
        accentBorder: "border-l-orange-500",
        badgeBg: "bg-orange-500",
        badgeTextColor: "text-white",
        isActionable: false,
        dimmed: false,
        strikethrough: false,
      };

    // ── Asignada (pendiente): cielo azul — informativa (el nombre reemplaza "Asig." en callsite)
    case "assigned_pending":
      return {
        badgeFull: "Asignada",
        badgeShort: "Asig.",
        pillBg: "bg-sky-100",
        pillText: "text-sky-900",
        cardBg: "bg-sky-50",
        cardBorder: "border-sky-200",
        cardText: "text-sky-900",
        accentBorder: "border-l-sky-500",
        badgeBg: "bg-sky-600",
        badgeTextColor: "text-white",
        isActionable: false,
        dimmed: false,
        strikethrough: false,
      };

    // ── En progreso: azul fuerte — más peso que "asignada"
    case "in_progress":
      return {
        badgeFull: "En progreso",
        badgeShort: "Prog.",
        pillBg: "bg-blue-200",
        pillText: "text-blue-900",
        cardBg: "bg-blue-100",
        cardBorder: "border-blue-400",
        cardText: "text-blue-900",
        accentBorder: "border-l-blue-700",
        badgeBg: "bg-blue-700",
        badgeTextColor: "text-white",
        isActionable: false,
        dimmed: false,
        strikethrough: false,
      };

    // ── Completada: verde suave
    case "completed":
      return {
        badgeFull: "Completada",
        badgeShort: "OK",
        pillBg: "bg-emerald-50",
        pillText: "text-emerald-700",
        cardBg: "bg-emerald-50",
        cardBorder: "border-emerald-200",
        cardText: "text-emerald-800",
        accentBorder: "border-l-emerald-400",
        badgeBg: "bg-emerald-100",
        badgeTextColor: "text-emerald-700",
        isActionable: false,
        dimmed: false,
        strikethrough: false,
      };

    // ── Cancelada: gris tachado
    case "cancelled":
      return {
        badgeFull: "Cancelada",
        badgeShort: "✕",
        pillBg: "bg-neutral-200",
        pillText: "text-neutral-500",
        cardBg: "bg-neutral-100",
        cardBorder: "border-neutral-200",
        cardText: "text-neutral-500",
        accentBorder: "border-l-neutral-300",
        badgeBg: "bg-neutral-300",
        badgeTextColor: "text-neutral-600",
        isActionable: false,
        dimmed: true,
        strikethrough: true,
      };
  }
}

// ─── Helpers de derivación ───────────────────────────────────────────────────

export type CalendarCleanerKind = "my" | "member" | "available" | "lost" | "open";

export function calendarKindToCleanerKind(
  calendarKind: CalendarCleanerKind,
  status: string,
  isOverdue?: boolean
): CleanerKind {
  switch (calendarKind) {
    case "my":        return status === "IN_PROGRESS" ? "mine_inprogress" : "mine_pending";
    case "available": return isOverdue ? "available_overdue" : "available";
    case "open":      return "open_past";
    case "member":    return "other_member";
    case "lost":      return "lost";
    default:          return "mine_pending";
  }
}

export function hostKindFromCleaning(cleaning: {
  status: string;
  assignmentStatus?: string | null;
  assignedMemberId?: string | null;
  assignedMembershipId?: string | null;
}): HostKind {
  if (cleaning.status === "CANCELLED") return "cancelled";
  if (cleaning.status === "COMPLETED") return "completed";
  if (cleaning.status === "IN_PROGRESS") return "in_progress";
  if (
    (cleaning.assignmentStatus === "OPEN" || !cleaning.assignmentStatus) &&
    !cleaning.assignedMemberId &&
    !cleaning.assignedMembershipId
  ) return "unassigned";
  return "assigned_pending";
}

// ─── Leyenda ─────────────────────────────────────────────────────────────────

export const CLEANER_LEGEND = [
  { kind: "mine_pending" as CleanerKind,      label: "Mía (pendiente)" },
  { kind: "mine_inprogress" as CleanerKind,   label: "Mía · En progreso" },
  { kind: "available" as CleanerKind,         label: "Disponible" },
  { kind: "available_overdue" as CleanerKind, label: "Disponible · Atrasada" },
  { kind: "other_member" as CleanerKind,      label: "Otro cleaner" },
  { kind: "completed" as CleanerKind,         label: "Completada" },
  { kind: "lost" as CleanerKind,              label: "No disponible" },
] as const;

export const HOST_LEGEND = [
  { kind: "unassigned" as HostKind,       label: "Sin cleaner" },
  { kind: "assigned_pending" as HostKind, label: "Asignada (nombre del cleaner)" },
  { kind: "in_progress" as HostKind,      label: "En progreso" },
  { kind: "completed" as HostKind,        label: "Completada" },
] as const;
