"use client";

import { useState } from "react";
import Link from "next/link";
import CleanerCleaningLink from "@/lib/ui/CleanerCleaningLink";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import ListContainer from "@/lib/ui/ListContainer";
import ListThumb from "@/lib/ui/ListThumb";
import { getCleanerVisual } from "@/lib/ui/cleaning-visual-state";
import { isPastDateOnly } from "@/lib/datetime/isPastDateOnly";
import { formatDateOnly } from "@/lib/ui/formatDateOnly";

interface Cleaning {
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
}

interface MyCleaningsSectionProps {
  myCleanings: Cleaning[];
  myThumbUrls: Record<string, string | null>;
  currentMemberId: string;
  myFilter: string;
  memberIdParam?: string;
  returnTo: string;
}

export default function MyCleaningsSection({
  myCleanings,
  myThumbUrls,
  currentMemberId,
  myFilter: initialMyFilter,
  memberIdParam,
  returnTo,
}: MyCleaningsSectionProps) {
  const [localMyFilter, setLocalMyFilter] = useState<"pending" | "in_progress">(
    (initialMyFilter === "in_progress" ? "in_progress" : "pending") as "pending" | "in_progress"
  );

  const filteredMyCleanings = myCleanings.filter((c) =>
    localMyFilter === "pending" ? c.status === "PENDING" : c.status === "IN_PROGRESS"
  );

  const [myOpen, setMyOpen] = useState(false);

  return (
    <div className="transition-all duration-300">
      <CollapsibleSection
        count={filteredMyCleanings.length}
        open={myOpen}
        onOpenChange={setMyOpen}
      >
        {/* Filtro tabs */}
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setLocalMyFilter("pending")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              localMyFilter === "pending"
                ? "bg-blue-600 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            Pendientes
          </button>
          <button
            type="button"
            onClick={() => setLocalMyFilter("in_progress")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              localMyFilter === "in_progress"
                ? "bg-blue-600 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            En progreso
          </button>
        </div>

        {filteredMyCleanings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4 text-center text-sm text-neutral-600">
            No hay limpiezas en esta categoría.
          </div>
        ) : (
          <ListContainer>
            {filteredMyCleanings.map((cleaning, index) => {
              const isLast = index === filteredMyCleanings.length - 1;
              const propertyName = cleaning.property.shortName || cleaning.property.name;
              const detailsHref = `/cleaner/cleanings/${cleaning.id}?memberId=${encodeURIComponent(currentMemberId)}&returnTo=${encodeURIComponent(returnTo)}`;
              const isInProgress = cleaning.status === "IN_PROGRESS";
              const isOverdue = !isInProgress && isPastDateOnly(new Date(cleaning.scheduledDate));
              const visual = getCleanerVisual(isInProgress ? "mine_inprogress" : "mine_pending");

              return (
                <CleanerCleaningLink
                  key={cleaning.id}
                  href={detailsHref}
                  aria-label={`Ver detalles de limpieza ${propertyName}`}
                  className={`
                    flex items-center gap-3 py-3 px-3 sm:px-4 min-h-[44px]
                    hover:brightness-95 active:opacity-95 transition-all touch-manipulation
                    border-l-4 ${visual.accentBorder} ${visual.cardBg}
                    ${!isLast ? "border-b border-neutral-200" : ""}
                  `.trim()}
                >
                  <ListThumb
                    src={myThumbUrls[cleaning.property.id] || null}
                    alt={propertyName}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`text-base font-medium truncate ${visual.cardText}`}>
                        {propertyName}
                      </h3>
                      {/* Badge de estado */}
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${visual.badgeBg} ${visual.badgeTextColor}`}>
                        {visual.badgeFull}
                      </span>
                      {/* Badge de atraso */}
                      {isOverdue && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 shrink-0">
                          Atrasada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {formatDateOnly(new Date(cleaning.scheduledDate))}
                    </p>
                    {cleaning.notes && (
                      <p className="text-xs text-neutral-400 line-clamp-2 mt-1">
                        {cleaning.notes}
                      </p>
                    )}
                  </div>
                </CleanerCleaningLink>
              );
            })}
          </ListContainer>
        )}

        {/* CTA */}
        <div className="mt-4 pt-4 border-t border-neutral-200">
          <Link
            href={
              memberIdParam
                ? `/cleaner/cleanings/all?scope=all&memberId=${encodeURIComponent(memberIdParam)}`
                : "/cleaner/cleanings/all?scope=all"
            }
            className="flex items-center justify-between group py-2 hover:opacity-80 transition-opacity"
          >
            <span className="text-sm font-medium text-neutral-900">Mis limpiezas</span>
            <svg className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </CollapsibleSection>
    </div>
  );
}
