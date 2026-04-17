"use client";

import { useState } from "react";
import Link from "next/link";
import { getPropertyColor } from "@/lib/cleaning-ui";
import { getHostVisual, hostKindFromCleaning, firstNameOf } from "@/lib/ui/cleaning-visual-state";
import { startCleaning, completeCleaning } from "./actions";
import CancelCleaningModal from "./CancelCleaningModal";

type Cleaning = {
  id: string;
  propertyId: string;
  scheduledDate: Date;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  notes: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  needsAttention?: boolean;
  attentionReason?: string | null;
  property: {
    id: string;
    name: string;
    shortName: string | null;
  };
};

type Property = {
  id: string;
  name: string;
};

interface DailyCleaningsViewWithModalProps {
  cleanings: Cleaning[];
  properties: Property[];
  referenceDate: Date;
  view: string;
  monthParamForLinks: string;
  dateParamForLinks: string;
}

function formatDuration(startedAt: Date | null, completedAt: Date | null): string | null {
  if (!startedAt) return null;
  const end = completedAt || new Date();
  const diffMins = Math.floor((end.getTime() - startedAt.getTime()) / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

const colorToHex: Record<string, string> = {
  "bg-emerald-500": "#10b981",
  "bg-sky-500": "#0ea5e9",
  "bg-amber-500": "#f59e0b",
  "bg-fuchsia-500": "#d946ef",
  "bg-rose-500": "#f43f5e",
  "bg-slate-500": "#64748b",
};

export default function DailyCleaningsViewWithModal({
  cleanings,
  properties,
  referenceDate,
  view,
  monthParamForLinks,
  dateParamForLinks,
}: DailyCleaningsViewWithModalProps) {
  const [y, m, d] = (dateParamForLinks || "").split("-").map(Number);
  const localRefDate =
    y && m && d
      ? new Date(y, m - 1, d)
      : referenceDate instanceof Date
        ? referenceDate
        : new Date(referenceDate);

  const dayKey = `${localRefDate.getFullYear()}-${localRefDate.getMonth()}-${localRefDate.getDate()}`;

  const dayCleanings = cleanings
    .filter((c) => {
      const dd = c.scheduledDate;
      return `${dd.getFullYear()}-${dd.getMonth()}-${dd.getDate()}` === dayKey;
    })
    .sort((a, b) => {
      const aAttn = (a as any).needsAttention && !(a as any).assignedMembershipId && a.status === "PENDING" ? 1 : 0;
      const bAttn = (b as any).needsAttention && !(b as any).assignedMembershipId && b.status === "PENDING" ? 1 : 0;
      if (aAttn !== bAttn) return bAttn - aAttn;
      return a.scheduledDate.getTime() - b.scheduledDate.getTime();
    });

  const dayLabel = localRefDate.toLocaleString("es-MX", { weekday: "long", day: "2-digit", month: "short" });
  const isToday = localRefDate.toDateString() === new Date().toDateString();

  // Mapa de colores de propiedad (para dot de identidad)
  const propertyColorMap = new Map<string, string>();
  const propertyColorHexMap = new Map<string, string>();
  properties.forEach((p, index) => {
    const color = getPropertyColor(index);
    if (p.id) {
      propertyColorMap.set(p.id, color);
      propertyColorHexMap.set(p.id, colorToHex[color] || "#64748b");
    }
  });

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);

  const buildReturnTo = () => {
    const p = new URLSearchParams();
    p.set("view", view);
    if (dateParamForLinks) p.set("date", dateParamForLinks);
    if (monthParamForLinks) p.set("month", monthParamForLinks);
    return `/host/cleanings?${p.toString()}`;
  };
  const returnTo = buildReturnTo();

  return (
    <>
      {selectedCleaning && (
        <CancelCleaningModal
          cleaningId={selectedCleaning.id}
          propertyName={selectedCleaning.property.shortName || selectedCleaning.property.name}
          scheduledDate={selectedCleaning.scheduledDate}
          isOpen={cancelModalOpen}
          onClose={() => { setCancelModalOpen(false); setSelectedCleaning(null); }}
          returnTo={returnTo}
        />
      )}

      <div className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-600">
            {isToday ? "Hoy · " : ""}{dayLabel}
          </p>
          <p className="text-xs text-neutral-500">
            Vista diaria{isToday ? " (hoy)" : ""}
          </p>
        </div>

        {dayCleanings.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {isToday ? "Hoy no hay limpiezas programadas." : "No hay limpiezas programadas para este día."}
          </p>
        ) : (
          <ul className="space-y-3">
            {dayCleanings.map((c) => {
              const colorHex = propertyColorHexMap.get(c.propertyId) ?? "#64748b";
              const kind = hostKindFromCleaning({
                status: c.status,
                assignmentStatus: (c as any).assignmentStatus,
                assignedMembershipId: (c as any).assignedMembershipId,
                scheduledDate: c.scheduledDate,
              });
              const visual = getHostVisual(kind);
              const detailsHref = `/host/cleanings/${c.id}?returnTo=${encodeURIComponent(returnTo)}`;
              const needsAttention = (c as any).needsAttention;
              const assignedMember = (c as any).assignedMember;
              const assignedMembership = (c as any).TeamMembership;

              // Nombre del cleaner asignado (legacy o WGE)
              const assigneeName: string | null =
                assignedMember?.name ?? assignedMembership?.User?.name ?? null;

              return (
                <li
                  key={c.id}
                  className={`rounded-2xl border ${visual.cardBorder} ${visual.cardBg} p-3 flex flex-col gap-2 border-l-4 ${visual.accentBorder}`}
                >
                  {/* Fila principal */}
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={detailsHref}
                      className="min-w-0 flex-1 block rounded-lg -m-1 p-1 hover:bg-black/5 active:bg-black/10 transition"
                      aria-label={`Ver detalles ${c.property.shortName || c.property.name}`}
                    >
                      {/* Nombre de propiedad + badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: colorHex }}
                        />
                        <p className={`text-base font-semibold ${visual.cardText}`}>
                          {c.property.shortName || c.property.name}
                        </p>
                        {/* Badge de estado — muestra nombre del cleaner cuando aplica */}
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${visual.badgeBg} ${visual.badgeTextColor}`}>
                          {kind === "assigned_pending" && assigneeName
                            ? `👤 ${firstNameOf(assigneeName) ?? assigneeName}`
                            : visual.badgeFull}
                        </span>
                        {/* Badge de atención — solo para PENDING; IN_PROGRESS, COMPLETED y OVERDUE tienen prioridad visual */}
                        {needsAttention && kind !== "overdue" && c.status !== "IN_PROGRESS" && c.status !== "COMPLETED" && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700">
                            ⚠ Atención
                          </span>
                        )}
                      </div>

                      {/* Hora + duración */}
                      <p className="text-xs text-neutral-600 mt-1">
                        {c.scheduledDate.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                        {c.startedAt && (() => {
                          const dur = formatDuration(c.startedAt, c.completedAt ?? null);
                          return dur ? ` · ${dur}` : " · En progreso...";
                        })()}
                      </p>

                      {/* Cleaner sin asignar — refuerzo textual */}
                      {kind === "unassigned" && (
                        <p className="text-xs text-orange-700 mt-0.5 font-medium">
                          Sin cleaner asignado
                        </p>
                      )}

                      {c.notes && (
                        <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{c.notes}</p>
                      )}
                    </Link>
                  </div>

                  {/* Acciones */}
                  <div>
                    {c.status === "PENDING" && (
                      <div className="flex items-center gap-3">
                        <form action={startCleaning} className="flex-1">
                          <input type="hidden" name="cleaningId" value={c.id} />
                          <input type="hidden" name="view" value={view} />
                          <input type="hidden" name="date" value={dateParamForLinks} />
                          <input type="hidden" name="month" value={monthParamForLinks} />
                          <button
                            type="submit"
                            className="w-full rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800 active:scale-[0.99] transition"
                          >
                            ▶ Iniciar
                          </button>
                        </form>
                        <button
                          type="button"
                          onClick={() => { setSelectedCleaning(c); setCancelModalOpen(true); }}
                          className="text-xs text-neutral-500 underline underline-offset-2"
                        >
                          ⨯ Cancelar
                        </button>
                      </div>
                    )}
                    {c.status === "IN_PROGRESS" && (
                      <div className="flex items-center gap-3">
                        <form action={completeCleaning} className="flex-1">
                          <input type="hidden" name="cleaningId" value={c.id} />
                          <input type="hidden" name="view" value={view} />
                          <input type="hidden" name="date" value={dateParamForLinks} />
                          <input type="hidden" name="month" value={monthParamForLinks} />
                          <button
                            type="submit"
                            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.99] transition"
                          >
                            ✔ Completar
                          </button>
                        </form>
                        <button
                          type="button"
                          onClick={() => { setSelectedCleaning(c); setCancelModalOpen(true); }}
                          className="text-xs text-neutral-500 underline underline-offset-2"
                        >
                          ⨯ Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
