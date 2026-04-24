// lib/reservation-attention-reasons.ts
import { getCleaningAttentionReasons, CleaningAttentionReason, CleaningAttentionReasonCode } from "./cleaning-attention-reasons";
import { formatDateOnly } from "@/lib/ui/formatDateOnly";

export type ReservationAttentionReasonCode = CleaningAttentionReasonCode | "NO_CLEANING_FOR_CHECKOUT" | "MULTIPLE_CLEANINGS";

export interface AttentionReason {
  code: ReservationAttentionReasonCode;
  title: string;
  detail?: string;
  relatedCleaningId?: string;
  relatedCleaningDate?: Date;
  severity: "CRITICAL" | "WARNING";
}

/**
 * Calcula los motivos de "Atención requerida" para una reserva basándose en sus limpiezas asociadas.
 * 
 * Agrega los motivos por cada limpieza asociada usando getCleaningAttentionReasons,
 * e incluye referencia a cuál limpieza corresponde (fecha/hora).
 */
export async function getReservationAttentionReasons(
  tenantId: string,
  reservation: {
    id: string;
    status: string;
    endDate: Date;
    cleanings: Array<{
      id: string;
      status: string;
      scheduledDate: Date;
      scheduledAtPlanned?: Date | null;
      assignedMembershipId?: string | null;
      teamId?: string | null;
      assignedMember?: {
        id: string;
        name: string;
        team?: {
          id: string;
          name: string;
        } | null;
      } | null;
      propertyId: string;
      needsAttention: boolean;
      attentionReason: string | null;
    }>;
  }
): Promise<AttentionReason[]> {
  const reasons: AttentionReason[] = [];
  const now = new Date();

  // Si la reserva está cancelada, no hay motivos de atención
  if (reservation.status === "CANCELLED") {
    return reasons;
  }

  // Si no hay limpiezas asociadas y la reserva está confirmada, podría ser un motivo
  if (reservation.cleanings.length === 0 && reservation.status === "CONFIRMED") {
    // Verificar si debería tener limpieza (checkout ya pasó o está próximo)
    if (reservation.endDate <= now) {
      reasons.push({
        code: "NO_CLEANING_FOR_CHECKOUT",
        title: "No se encontró limpieza asociada para la salida.",
        severity: "CRITICAL",
        detail: `La reserva finalizó el ${formatDateOnly(reservation.endDate)} y no hay limpieza registrada.`,
      });
    }
  }

  // Analizar cada limpieza asociada
  for (const cleaning of reservation.cleanings) {
    const scheduledAt = cleaning.scheduledAtPlanned || cleaning.scheduledDate;

    // Obtener motivos de esta limpieza usando la función principal
    const cleaningReasons = await getCleaningAttentionReasons(
      tenantId,
      {
        id: cleaning.id,
        status: cleaning.status,
        scheduledDate: cleaning.scheduledDate,
        scheduledAtPlanned: cleaning.scheduledAtPlanned || null,
        assignedMembershipId: cleaning.assignedMembershipId || null,
        teamId: cleaning.teamId || null,
        assignedMember: cleaning.assignedMember || null,
        propertyId: cleaning.propertyId,
        needsAttention: cleaning.needsAttention,
        attentionReason: cleaning.attentionReason,
      }
    );

    // Agregar cada motivo con referencia a la limpieza
    for (const reason of cleaningReasons) {
      reasons.push({
        ...reason,
        relatedCleaningId: cleaning.id,
        relatedCleaningDate: scheduledAt,
      });
    }
  }

  // E) Más de una limpieza activa para la misma reserva (duplicada)
  const activeCleanings = reservation.cleanings.filter(
    (c) => c.status !== "CANCELLED" && c.status !== "COMPLETED"
  );
  if (activeCleanings.length > 1) {
    reasons.push({
      code: "MULTIPLE_CLEANINGS",
      title: "Hay más de una limpieza activa asociada a esta reserva.",
      severity: "CRITICAL",
      detail: `Se encontraron ${activeCleanings.length} limpiezas activas para esta reserva.`,
    });
  }

  return reasons;
}

