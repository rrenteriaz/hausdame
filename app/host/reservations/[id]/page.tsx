// app/host/reservations/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import PageHeader from "@/lib/ui/PageHeader";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";
import {
  formatReservationDateLong,
  formatReservationDateRange,
} from "@/lib/ui/formatReservationDate";

function formatDateTime(date: Date): string {
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "Confirmada";
    case "CANCELLED":
      return "Cancelada";
    case "BLOCKED":
      return "Bloqueada";
    default:
      return status;
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-emerald-100 text-emerald-800";
    case "CANCELLED":
      return "bg-red-100 text-red-800";
    case "BLOCKED":
      return "bg-neutral-100 text-neutral-800";
    default:
      return "bg-neutral-100 text-neutral-800";
  }
}

function formatCleaningStatus(status: string): string {
  switch (status) {
    case "PENDING":
      return "Pendiente";
    case "IN_PROGRESS":
      return "En progreso";
    case "COMPLETED":
      return "Completada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

function getCleaningStatusBadgeClass(status: string): string {
  switch (status) {
    case "PENDING":
      return "bg-amber-100 text-amber-800";
    case "IN_PROGRESS":
      return "bg-blue-100 text-blue-800";
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-800";
    case "CANCELLED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-neutral-100 text-neutral-800";
  }
}

function formatSource(source: string): string {
  switch (source) {
    case "ICAL":
      return "iCal";
    case "MANUAL":
      return "Manual";
    default:
      return source;
  }
}

export default async function ReservationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  // Obtener reserva con property y cleanings
  const reservation = await prisma.reservation.findFirst({
    where: {
      id: resolvedParams.id,
      tenantId,
    },
    include: {
      property: {
        select: {
          id: true,
          name: true,
          shortName: true,
        },
      },
      cleanings: {
        select: {
          id: true,
          status: true,
          scheduledDate: true,
          scheduledAtPlanned: true,
          assignedMembershipId: true,
          teamId: true,
          propertyId: true,
          needsAttention: true,
          attentionReason: true,
          assignedMember: {
            select: {
              id: true,
              name: true,
              team: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          scheduledAtPlanned: "desc",
        },
      },
    },
  });

  if (!reservation) notFound();

  // Usar helper común para validar returnTo
  const returnTo = safeReturnTo(resolvedSearchParams?.returnTo, "/host/reservations");
  const propertyName = reservation.property.shortName || reservation.property.name;

  // Timeline básico (derivado de datos existentes)
  const timelineEvents: Array<{ text: string; date?: Date }> = [];

  if (reservation.source === "ICAL") {
    timelineEvents.push({
      text: "Creada por iCal",
      date: reservation.createdAt,
    });
  }

  if (reservation.status === "CANCELLED") {
    timelineEvents.push({
      text: "Cancelada",
      date: reservation.updatedAt,
    });
  }

  const hasScheduleOverride = reservation.cleanings.some(
    (c) => (c as any).isScheduleOverridden
  );
  if (hasScheduleOverride) {
    timelineEvents.push({
      text: "Limpieza reprogramada manualmente",
    });
  }

  return (
    <HostWebContainer>
      <div className="space-y-4">
        <PageHeader
          showBack
          backHref={returnTo}
          title="Detalle de reserva"
          subtitle={`${propertyName} · ${formatReservationDateRange(reservation.startDate, reservation.endDate)}`}
          variant="compact"
        />

        {/* Info básica */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
        <div>
          <p className="text-xs text-neutral-500">Propiedad</p>
          <p className="text-base font-semibold text-neutral-900">
            {reservation.property.name}
            {reservation.property.shortName && (
              <span className="text-neutral-600 ml-2">({reservation.property.shortName})</span>
            )}
          </p>
        </div>

        <div>
          <p className="text-xs text-neutral-500">Fechas</p>
          <p className="text-base text-neutral-900">
            {formatReservationDateLong(reservation.startDate)} — {formatReservationDateLong(reservation.endDate)}
          </p>
        </div>

        {reservation.reservationCodeCalendar && (
          <div>
            <p className="text-xs text-neutral-500">Clave de reservación</p>
            <p className="text-base text-neutral-900 font-mono">
              {reservation.reservationCodeCalendar}
            </p>
          </div>
        )}

        <div>
          <p className="text-xs text-neutral-500">Estado</p>
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(
              reservation.status
            )}`}
          >
            {formatStatus(reservation.status)}
          </span>
        </div>

        {reservation.source && (
          <div>
            <p className="text-xs text-neutral-500">Origen</p>
            <p className="text-base text-neutral-900">{formatSource(reservation.source)}</p>
          </div>
        )}

        {reservation.guestPhoneLast4 && (
          <div>
            <p className="text-xs text-neutral-500">Teléfono (últimos 4 dígitos)</p>
            <p className="text-base text-neutral-900">•••• {reservation.guestPhoneLast4}</p>
          </div>
        )}

        {reservation.calendarUid && (
          <div>
            <p className="text-xs text-neutral-500">Calendar UID</p>
            <p className="text-xs text-neutral-500 font-mono break-all">{reservation.calendarUid}</p>
          </div>
        )}
      </section>

        {/* Limpiezas asociadas */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
        <div>
          <p className="text-base font-semibold text-neutral-900 mb-3">Limpiezas asociadas</p>
          {reservation.cleanings.length === 0 ? (
            <p className="text-base text-neutral-500">No hay limpiezas asociadas a esta reserva.</p>
          ) : (
            <ul className="space-y-3">
              {reservation.cleanings.map((cleaning) => {
                const scheduledAt = (cleaning as any).scheduledAtPlanned || cleaning.scheduledDate;
                const assignedMember = (cleaning as any).assignedMember;
                // Regla canónica: asignado ↔ assignedMembershipId != null
                const isAssigned = cleaning.assignedMembershipId != null || assignedMember != null;
                const needsAttention = (cleaning as any).needsAttention &&
                  !cleaning.assignedMembershipId;

                return (
                  <li key={cleaning.id}>
                    <Link
                      href={`/host/cleanings/${cleaning.id}?returnTo=${encodeURIComponent(returnTo)}`}
                      className="block rounded-xl border border-neutral-200 bg-neutral-50 p-3 hover:border-neutral-300 hover:bg-white transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCleaningStatusBadgeClass(
                                cleaning.status
                              )}`}
                            >
                              {formatCleaningStatus(cleaning.status)}
                            </span>
                            {needsAttention && (
                              <span className="text-xs text-amber-600 font-medium">
                                ⚠️ Atención requerida
                              </span>
                            )}
                          </div>

                          <p className="text-base text-neutral-900">
                            {formatDateTime(scheduledAt)}
                          </p>

                          {assignedMember && (
                            <p className="text-xs text-neutral-600">
                              Asignada a {assignedMember.name}
                            </p>
                          )}

                          {!assignedMember && cleaning.assignedMembershipId && cleaning.status !== "COMPLETED" && (
                            <p className="text-xs text-neutral-600">Asignada</p>
                          )}

                          {!isAssigned && cleaning.status !== "COMPLETED" && (
                            <p className="text-xs text-neutral-500">Sin asignar</p>
                          )}
                        </div>

                        <div className="shrink-0 text-neutral-400">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Timeline básico */}
      {timelineEvents.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
          <p className="text-base font-semibold text-neutral-900">Historial</p>
          <ul className="space-y-2">
            {timelineEvents.map((event, index) => (
              <li key={index} className="text-base text-neutral-700">
                <span className="text-neutral-500">•</span>{" "}
                {event.text}
                {event.date && (
                  <span className="text-xs text-neutral-500 ml-2">
                    {formatDateTime(event.date)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </HostWebContainer>
  );
}


