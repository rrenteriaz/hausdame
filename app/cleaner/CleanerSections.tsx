"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { acceptCleaning } from "./actions";
import { formatCleaningStatus } from "@/lib/cleaning-ui";

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

interface CleanerSectionsProps {
  availableCount: number;
  eligibleCleanings: Cleaning[];
  availableThumbUrls: Record<string, string | null>;
  myCleanings: Cleaning[];
  myThumbUrls: Record<string, string | null>;
  currentMemberId: string;
  myFilter: string;
  memberIdParam?: string;
  view?: string;
  dateParam?: string;
  monthParam?: string;
  returnTo: string;
}

export default function CleanerSections({
  availableCount,
  eligibleCleanings,
  availableThumbUrls,
  myCleanings,
  myThumbUrls,
  currentMemberId,
  myFilter: initialMyFilter,
  memberIdParam,
  view,
  dateParam,
  monthParam,
  returnTo,
}: CleanerSectionsProps) {
  // Estado local para el filtro (sin recargar página)
  const [localMyFilter, setLocalMyFilter] = useState<"pending" | "in_progress">(
    (initialMyFilter === "in_progress" ? "in_progress" : "pending") as "pending" | "in_progress"
  );

  // Filtrar limpiezas según el filtro local
  const filteredMyCleanings = myCleanings.filter((c) => {
    if (localMyFilter === "pending") {
      return c.status === "PENDING";
    }
    if (localMyFilter === "in_progress") {
      return c.status === "IN_PROGRESS";
    }
    return false;
  });

  const [availableOpen, setAvailableOpen] = useState(false);
  const [myOpen, setMyOpen] = useState(false);
  const [highlightAvailable, setHighlightAvailable] = useState(false);
  const [highlightMy, setHighlightMy] = useState(false);

  const availableSectionRef = useRef<HTMLDivElement>(null);
  const mySectionRef = useRef<HTMLDivElement>(null);

  // Función para expandir y hacer scroll a una sección
   
  const focusSection = useCallback((section: "available" | "my") => {
    if (section === "available") {
      setAvailableOpen(true);
      setMyOpen(false); // Cerrar la otra sección
      // Esperar a que se renderice antes de hacer scroll
      requestAnimationFrame(() => {
        setTimeout(() => {
          availableSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          // Activar highlight temporal
          setHighlightAvailable(true);
          setTimeout(() => setHighlightAvailable(false), 400);
        }, 100);
      });
    } else {
      setMyOpen(true);
      setAvailableOpen(false); // Cerrar la otra sección
      requestAnimationFrame(() => {
        setTimeout(() => {
          mySectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          // Activar highlight temporal
          setHighlightMy(true);
          setTimeout(() => setHighlightMy(false), 400);
        }, 100);
      });
    }
  }, []);

  // Exponer la función para que el componente padre pueda llamarla
  useEffect(() => {
    // @ts-expect-error - Exponer función globalmente para acceso desde SummaryCards
    window.focusCleanerSection = focusSection;
    return () => {
      delete (window as any).focusCleanerSection;
    };
  }, [focusSection]);

  return (
    <section className="space-y-4">
      {/* Mis limpiezas */}
      <div
        ref={mySectionRef}
        className={`transition-all duration-300 ${
          highlightMy ? "bg-amber-50/50 rounded-xl -mx-2 px-2 py-2" : ""
        }`}
      >
        <CollapsibleSection
          title="Mis limpiezas"
          count={filteredMyCleanings.length}
          open={myOpen}
          onOpenChange={setMyOpen}
        >
          {/* Chips: Pendientes / En progreso */}
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setLocalMyFilter("pending")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                localMyFilter === "pending"
                  ? "bg-black text-white"
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
                  ? "bg-black text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              En progreso
            </button>
          </div>

          {filteredMyCleanings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4 text-center text-base text-neutral-600">
              No hay limpiezas en esta categoría.
            </div>
          ) : (
            <ListContainer>
              {filteredMyCleanings.map((cleaning, index: number) => {
                const isLast = index === filteredMyCleanings.length - 1;
                const propertyName =
                  cleaning.property.shortName || cleaning.property.name;
                const detailsHref = `/cleaner/cleanings/${cleaning.id}?memberId=${encodeURIComponent(currentMemberId)}&returnTo=${encodeURIComponent(returnTo)}`;

                return (
                  <ListRow
                    key={cleaning.id}
                    href={detailsHref}
                    isLast={isLast}
                    ariaLabel={`Ver detalles de limpieza ${propertyName}`}
                  >
                    <ListThumb
                      src={myThumbUrls[cleaning.property.id] || null}
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
                      <p className="text-xs text-neutral-500 mt-1">
                        Estado: {formatCleaningStatus(cleaning.status)}
                      </p>
                      {cleaning.notes && (
                        <p className="text-xs text-neutral-500 line-clamp-2 mt-1">
                          {cleaning.notes}
                        </p>
                      )}
                    </div>
                  </ListRow>
                );
              })}
            </ListContainer>
          )}

          {/* CTA Mis limpiezas */}
          <div className="mt-4 pt-4 border-t border-neutral-200">
            <a
              href={`/cleaner/cleanings/all?scope=all&memberId=${encodeURIComponent(currentMemberId)}`}
              className="flex items-center justify-between group py-2 hover:opacity-80 transition-opacity"
            >
              <span className="text-base font-medium text-neutral-900">
                Mis limpiezas
              </span>
              <svg
                className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 transition-colors"
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
            </a>
          </div>
        </CollapsibleSection>
      </div>

      {/* Disponibles */}
      <div
        ref={availableSectionRef}
        className={`pt-6 transition-all duration-300 ${
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
                    <div
                      className={`
                        flex items-center gap-3
                        py-3 px-3 sm:px-4 pr-24
                        hover:bg-neutral-50
                        transition-colors
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
                    </div>
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
    </section>
  );
}

