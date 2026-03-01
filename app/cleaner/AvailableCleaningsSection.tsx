"use client";

import { useState, useRef, useEffect } from "react";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import ListContainer from "@/lib/ui/ListContainer";
import ListThumb from "@/lib/ui/ListThumb";
import { acceptCleaning } from "./actions";

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

  // Hacer scroll automáticamente cuando se despliega la sección
  useEffect(() => {
    if (availableOpen && availableSectionRef.current) {
      // Esperar a que se renderice el contenido antes de hacer scroll
      requestAnimationFrame(() => {
        setTimeout(() => {
          availableSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          // Activar highlight temporal para indicar visualmente
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
        highlightAvailable
          ? "bg-amber-50/50 rounded-xl -mx-2 px-2 py-2"
          : ""
      }`}
    >
      <CollapsibleSection
        title="Disponibles"
        count={availableCount}
        open={availableOpen}
        onOpenChange={setAvailableOpen}
      >
        {eligibleCleanings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4 text-center text-base text-neutral-600">
            No hay limpiezas disponibles en este momento.
          </div>
        ) : (
          <ListContainer>
            {eligibleCleanings.map((cleaning, index: number) => {
              const isLast = index === eligibleCleanings.length - 1;
              const propertyName =
                cleaning.property.shortName || cleaning.property.name;

              return (
                <div
                  key={cleaning.id}
                  className={`relative ${
                    !isLast ? "border-b border-neutral-200" : ""
                  }`}
                >
                  <a
                    href={`/cleaner/cleanings/${cleaning.id}?returnTo=${encodeURIComponent(returnTo)}`}
                    aria-label={`Ver detalle de limpieza en ${propertyName}`}
                    className={`
                      flex items-center gap-3
                      py-3 px-3 sm:px-4 pr-24 min-h-[44px]
                      hover:bg-neutral-50 active:opacity-95
                      transition-colors touch-manipulation
                      block text-inherit no-underline
                    `.trim()}
                  >
                    <ListThumb
                      src={availableThumbUrls[cleaning.property.id] || null}
                      alt={propertyName}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-medium text-neutral-900 truncate">
                        {propertyName}
                      </h3>
                      <p className="text-xs text-neutral-500 truncate mt-0.5">
                        {cleaning.scheduledDate.toLocaleString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {cleaning.notes && (
                        <p className="text-xs text-neutral-500 line-clamp-2 mt-1">
                          {cleaning.notes}
                        </p>
                      )}
                    </div>
                  </a>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                    <form action={acceptCleaning}>
                      <input type="hidden" name="cleaningId" value={cleaning.id} />
                      <input type="hidden" name="memberId" value={currentMemberId} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        type="submit"
                        className="rounded-lg bg-black px-4 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
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

