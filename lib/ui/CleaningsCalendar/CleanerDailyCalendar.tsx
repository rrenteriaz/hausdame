// lib/ui/CleaningsCalendar/CleanerDailyCalendar.tsx
"use client";

import { useMemo } from "react";
import CleanerCleaningLink from "@/lib/ui/CleanerCleaningLink";
import { acceptCleaning } from "@/app/cleaner/actions";
import ListContainer from "@/lib/ui/ListContainer";
import ListThumb from "@/lib/ui/ListThumb";
import { getCleanerVisual } from "@/lib/ui/cleaning-visual-state";
import { isPastDateOnly } from "@/lib/datetime/isPastDateOnly";
import { formatDateOnlyShort } from "@/lib/ui/formatDateOnly";

type CleaningForCalendar = {
  id: string;
  scheduledDate: Date;
  property: {
    id: string;
    name: string;
    shortName?: string | null;
    coverAssetGroupId?: string | null;
  };
  status: string;
  notes?: string | null;
};

interface CleanerDailyCalendarProps {
  myCleanings: CleaningForCalendar[];
  memberCleanings?: CleaningForCalendar[];
  lostCleanings?: CleaningForCalendar[];
  availableCleanings: CleaningForCalendar[];
  referenceDate: Date;
  dateParam?: string;
  basePath: string;
  currentMemberId: string;
  returnTo: string;
  myThumbUrlEntries: [string, string | null][];
  availableThumbUrlEntries: [string, string | null][];
}

function StatusBadge({ bg, text, label }: { bg: string; text: string; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${bg} ${text}`}>
      {label}
    </span>
  );
}

export default function CleanerDailyCalendar({
  myCleanings,
  memberCleanings = [],
  lostCleanings = [],
  availableCleanings,
  referenceDate,
  dateParam,
  basePath,
  currentMemberId,
  returnTo,
  myThumbUrlEntries,
  availableThumbUrlEntries,
}: CleanerDailyCalendarProps) {
  const myThumbUrls = useMemo(
    () => new Map(myThumbUrlEntries),
    [myThumbUrlEntries]
  );
  const availableThumbUrls = useMemo(
    () => new Map(availableThumbUrlEntries),
    [availableThumbUrlEntries]
  );

  const [y, m, d] = (dateParam || "").split("-").map(Number);
  const localRefDate =
    y && m && d
      ? new Date(y, m - 1, d)
      : referenceDate instanceof Date
        ? referenceDate
        : new Date(referenceDate);

  const dayLabel = localRefDate.toLocaleString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
  const isToday = localRefDate.toDateString() === new Date().toDateString();

  // scheduledDate comes from @db.Date → Prisma returns UTC midnight (e.g. 2026-04-19T00:00:00Z).
  // Always compare in UTC so the daily view aligns with the monthly view (server-rendered, TZ=UTC).
  const dayKey = `${localRefDate.getUTCFullYear()}-${localRefDate.getUTCMonth()}-${localRefDate.getUTCDate()}`;

  const filterByDay = (list: CleaningForCalendar[]) =>
    list.filter((c) => {
      const dd = c.scheduledDate;
      return `${dd.getUTCFullYear()}-${dd.getUTCMonth()}-${dd.getUTCDate()}` === dayKey;
    });

  const dayMyCleanings       = filterByDay(myCleanings);
  const dayAvailableCleanings = filterByDay(availableCleanings);
  const dayMemberCleanings    = filterByDay(memberCleanings);
  const dayLostCleanings      = filterByDay(lostCleanings);

  const now = new Date();

  const linkBase = "flex w-full items-center gap-3 py-3 px-3 sm:px-4 hover:bg-neutral-50 active:opacity-95 transition-colors touch-manipulation cursor-pointer";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4 space-y-5 relative z-[1]">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-600">
          {isToday ? "Hoy · " : ""}{dayLabel}
        </p>
        <p className="text-xs text-neutral-500">Vista diaria{isToday ? " (hoy)" : ""}</p>
      </div>

      {/* ── MIS LIMPIEZAS ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-800">
            {isToday ? "Mías hoy" : "Mías"} ({dayMyCleanings.length})
          </h3>
          {dayMyCleanings.some((c) => c.status === "IN_PROGRESS") && (
            <StatusBadge bg="bg-blue-600" text="text-white" label="En progreso" />
          )}
        </div>

        {dayMyCleanings.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {isToday ? "No tienes limpiezas hoy." : "No tienes limpiezas en este día."}
          </p>
        ) : (
          <ListContainer>
            {dayMyCleanings.map((cleaning, index) => {
              const isLast = index === dayMyCleanings.length - 1;
              const propertyName = cleaning.property.shortName || cleaning.property.name;
              const detailsHref = `${basePath}/cleanings/${cleaning.id}?memberId=${encodeURIComponent(currentMemberId)}&returnTo=${encodeURIComponent(returnTo)}`;
              const isInProgress = cleaning.status === "IN_PROGRESS";
              const isOverdue = !isInProgress && cleaning.status !== "COMPLETED" && isPastDateOnly(new Date(cleaning.scheduledDate));
              const myKind = isInProgress ? "mine_inprogress" : isOverdue ? "mine_overdue" : "mine_pending";
              const visual = getCleanerVisual(myKind);

              return (
                <CleanerCleaningLink
                  key={cleaning.id}
                  href={detailsHref}
                  aria-label={`Ver detalles ${propertyName}`}
                  className={`
                    ${linkBase} min-h-[44px]
                    border-l-4 ${visual.accentBorder}
                    ${visual.cardBg}
                    ${!isLast ? "border-b border-neutral-200" : ""}
                  `.trim()}
                >
                  <ListThumb src={myThumbUrls.get(cleaning.property.id) || null} alt={propertyName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isInProgress && (
                        <span className="inline-flex h-2 w-2 rounded-full bg-green-500 shrink-0" />
                      )}
                      {isOverdue && (
                        <span className="inline-flex h-2 w-2 rounded-full bg-red-500 shrink-0" />
                      )}
                      <h4 className={`text-base truncate ${isInProgress ? "font-semibold" : "font-medium"} ${visual.cardText}`}>
                        {propertyName}
                      </h4>
                    </div>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {formatDateOnlyShort(new Date(cleaning.scheduledDate))}
                    </p>
                    {cleaning.notes && (
                      <p className="text-xs text-neutral-500 line-clamp-1 mt-1">{cleaning.notes}</p>
                    )}
                  </div>
                </CleanerCleaningLink>
              );
            })}
          </ListContainer>
        )}
      </section>

      {/* ── DISPONIBLES ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-800">
            {isToday ? "Disponibles hoy" : "Disponibles"} ({dayAvailableCleanings.length})
          </h3>
          {dayAvailableCleanings.length > 0 && (
            <StatusBadge bg="bg-emerald-100" text="text-emerald-700" label="Reclamables" />
          )}
        </div>

        {dayAvailableCleanings.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {isToday ? "No hay limpiezas disponibles hoy." : "No hay limpiezas disponibles en este día."}
          </p>
        ) : (
          <ListContainer>
            {dayAvailableCleanings.map((cleaning, index) => {
              const isLast = index === dayAvailableCleanings.length - 1;
              const propertyName = cleaning.property.shortName || cleaning.property.name;
              const detailsHref = `${basePath}/cleanings/${cleaning.id}?memberId=${encodeURIComponent(currentMemberId)}&returnTo=${encodeURIComponent(returnTo)}`;
              const isOverdue = isPastDateOnly(new Date(cleaning.scheduledDate));
              const visual = getCleanerVisual(isOverdue ? "available_overdue" : "available");

              return (
                <div key={cleaning.id} className={`relative ${!isLast ? "border-b border-neutral-200" : ""}`}>
                  <CleanerCleaningLink
                    href={detailsHref}
                    aria-label={`Ver detalles ${propertyName}`}
                    className={`
                      ${linkBase} pr-24 min-h-[44px]
                      border-l-4 ${visual.accentBorder}
                      ${visual.cardBg}
                    `.trim()}
                  >
                    <ListThumb src={availableThumbUrls.get(cleaning.property.id) || null} alt={propertyName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`text-base font-medium truncate ${visual.cardText}`}>
                          {propertyName}
                        </h4>
                        <StatusBadge bg={visual.badgeBg} text={visual.badgeTextColor} label={visual.badgeFull} />
                      </div>
                      <p className="text-xs text-neutral-500 truncate mt-0.5">
                        {formatDateOnlyShort(new Date(cleaning.scheduledDate))}
                      </p>
                      {cleaning.notes && (
                        <p className="text-xs text-neutral-500 line-clamp-1 mt-1">{cleaning.notes}</p>
                      )}
                    </div>
                  </CleanerCleaningLink>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                    <form action={acceptCleaning} className="pointer-events-auto">
                      <input type="hidden" name="cleaningId" value={cleaning.id} />
                      <input type="hidden" name="memberId" value={currentMemberId} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.99] transition"
                      >
                        Aceptar
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </ListContainer>
        )}
      </section>

      {/* ── NO DISPONIBLES (perdidas) ── */}
      {dayLostCleanings.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-500">
              No disponibles ({dayLostCleanings.length})
            </h3>
            <StatusBadge bg="bg-neutral-100" text="text-neutral-400" label="Fuera de rango" />
          </div>
          <p className="text-xs text-neutral-400">
            Estas limpiezas ya no son reclamables.
          </p>
          <ListContainer>
            {dayLostCleanings.map((cleaning, index) => {
              const isLast = index === dayLostCleanings.length - 1;
              const propertyName = cleaning.property.shortName || cleaning.property.name;
              const detailsHref = `${basePath}/cleanings/${cleaning.id}?memberId=${encodeURIComponent(currentMemberId)}&returnTo=${encodeURIComponent(returnTo)}`;
              const visual = getCleanerVisual("lost");

              return (
                <CleanerCleaningLink
                  key={cleaning.id}
                  href={detailsHref}
                  aria-label={`Ver detalles ${propertyName}`}
                  className={`
                    ${linkBase} min-h-[44px] opacity-60
                    border-l-4 ${visual.accentBorder}
                    ${!isLast ? "border-b border-neutral-200" : ""}
                  `.trim()}
                >
                  <ListThumb src={availableThumbUrls.get(cleaning.property.id) || null} alt={propertyName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-medium text-neutral-400 truncate line-through">
                        {propertyName}
                      </h4>
                      <StatusBadge bg={visual.badgeBg} text={visual.badgeTextColor} label={visual.badgeFull} />
                    </div>
                    <p className="text-xs text-neutral-400 truncate mt-0.5">
                      {formatDateOnlyShort(new Date(cleaning.scheduledDate))}
                    </p>
                  </div>
                </CleanerCleaningLink>
              );
            })}
          </ListContainer>
        </section>
      )}

      {/* ── EQUIPO (otros cleaners) ── */}
      {dayMemberCleanings.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-600">
              Del equipo ({dayMemberCleanings.length})
            </h3>
            <StatusBadge bg="bg-neutral-200" text="text-neutral-500" label="Otro cleaner" />
          </div>
          <ListContainer>
            {dayMemberCleanings.map((cleaning, index) => {
              const isLast = index === dayMemberCleanings.length - 1;
              const propertyName = cleaning.property.shortName || cleaning.property.name;
              const detailsHref = `${basePath}/cleanings/${cleaning.id}?memberId=${encodeURIComponent(currentMemberId)}&returnTo=${encodeURIComponent(returnTo)}`;
              const visual = getCleanerVisual("other_member");

              return (
                <CleanerCleaningLink
                  key={cleaning.id}
                  href={detailsHref}
                  aria-label={`Ver detalles ${propertyName}`}
                  className={`
                    ${linkBase} min-h-[44px] opacity-75
                    border-l-4 ${visual.accentBorder}
                    ${visual.cardBg}
                    ${!isLast ? "border-b border-neutral-200" : ""}
                  `.trim()}
                >
                  <ListThumb src={myThumbUrls.get(cleaning.property.id) || null} alt={propertyName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-medium text-neutral-600 truncate">
                        {propertyName}
                      </h4>
                      <StatusBadge bg={visual.badgeBg} text={visual.badgeTextColor} label={visual.badgeFull} />
                    </div>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {formatDateOnlyShort(new Date(cleaning.scheduledDate))}
                      {" · "}
                      {cleaning.status === "IN_PROGRESS" ? "En progreso" : "Pendiente"}
                    </p>
                    {cleaning.notes && (
                      <p className="text-xs text-neutral-400 line-clamp-1 mt-1">{cleaning.notes}</p>
                    )}
                  </div>
                </CleanerCleaningLink>
              );
            })}
          </ListContainer>
        </section>
      )}
    </div>
  );
}
