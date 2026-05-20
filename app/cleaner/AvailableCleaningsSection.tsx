"use client";

import { useState, useRef, useEffect } from "react";
import CleanerCleaningLink from "@/lib/ui/CleanerCleaningLink";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import ListContainer from "@/lib/ui/ListContainer";
import ListThumb from "@/lib/ui/ListThumb";
import { getCleanerVisual } from "@/lib/ui/cleaning-visual-state";
import { acceptCleaning } from "./actions";
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

interface AvailableCleaningsSectionProps {
  availableCount: number;
  eligibleCleanings: Cleaning[];
  availableThumbUrls: Record<string, string | null>;
  currentMemberId: string;
  returnTo: string;
}

export default function AvailableCleaningsSection({
  availableCount,
  eligibleCleanings,
  availableThumbUrls,
  currentMemberId,
  returnTo,
}: AvailableCleaningsSectionProps) {
  const [availableOpen, setAvailableOpen] = useState(false);
  const [highlightAvailable, setHighlightAvailable] = useState(false);
  const availableSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (availableOpen && availableSectionRef.current) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          availableSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          setHighlightAvailable(true);
          setTimeout(() => setHighlightAvailable(false), 400);
        }, 100);
      });
    }
  }, [availableOpen]);

  return (
    <div
      ref={availableSectionRef}
      className={`pt-6 pb-12 transition-all duration-300 ${
        highlightAvailable ? "bg-emerald-50/50 rounded-xl -mx-2 px-2 py-2" : ""
      }`}
    >
      <CollapsibleSection
        count={availableCount}
        open={availableOpen}
        onOpenChange={setAvailableOpen}
      >
        {eligibleCleanings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4 text-center text-sm text-neutral-600">
            No hay limpiezas disponibles por ahora. Cuando el Host publique limpiezas abiertas para tus propiedades, aparecerán aquí.
          </div>
        ) : (
          <ListContainer>
            {eligibleCleanings.map((cleaning, index) => {
              const isLast = index === eligibleCleanings.length - 1;
              const propertyName = cleaning.property.shortName || cleaning.property.name;
              const isOverdue = isPastDateOnly(new Date(cleaning.scheduledDate));
              const visual = getCleanerVisual(isOverdue ? "available_overdue" : "available");

              return (
                <div
                  key={cleaning.id}
                  className={`relative ${!isLast ? "border-b border-neutral-200" : ""}`}
                >
                  <CleanerCleaningLink
                    href={`/cleaner/cleanings/${cleaning.id}?returnTo=${encodeURIComponent(returnTo)}`}
                    aria-label={`Ver detalle de limpieza en ${propertyName}`}
                    className={`
                      flex items-center gap-3
                      py-3 px-3 sm:px-4 pr-24 min-h-[44px]
                      hover:brightness-95 active:opacity-95
                      transition-all touch-manipulation
                      border-l-4 ${visual.accentBorder} ${visual.cardBg}
                    `.trim()}
                  >
                    <ListThumb
                      src={availableThumbUrls[cleaning.property.id] || null}
                      alt={propertyName}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`text-base font-medium truncate ${visual.cardText}`}>
                          {propertyName}
                        </h3>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${visual.badgeBg} ${visual.badgeTextColor}`}>
                          {visual.badgeFull}
                        </span>
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

                  {/* Botón Aceptar */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                    <form action={acceptCleaning}>
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
      </CollapsibleSection>
    </div>
  );
}
