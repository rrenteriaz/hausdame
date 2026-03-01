"use client";

import { useState } from "react";
import Link from "next/link";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import ListContainer from "@/lib/ui/ListContainer";
import ListThumb from "@/lib/ui/ListThumb";
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

  const [myOpen, setMyOpen] = useState(false);

  return (
    <div className="transition-all duration-300">
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
                <a
                  key={cleaning.id}
                  href={detailsHref}
                  aria-label={`Ver detalles de limpieza ${propertyName}`}
                  className={`
                    flex items-center gap-3 py-3 px-3 sm:px-4 min-h-[44px]
                    hover:bg-neutral-50 active:opacity-95 transition-colors touch-manipulation
                    block text-inherit no-underline
                    ${!isLast ? "border-b border-neutral-200" : ""}
                  `.trim()}
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
                </a>
              );
            })}
          </ListContainer>
        )}

        {/* CTA Todas las limpiezas */}
        <div className="mt-4 pt-4 border-t border-neutral-200">
          <Link
            href={
              memberIdParam
                ? `/cleaner/cleanings/all?scope=all&memberId=${encodeURIComponent(memberIdParam)}`
                : "/cleaner/cleanings/all?scope=all"
            }
            className="flex items-center justify-between group py-2 hover:opacity-80 transition-opacity"
          >
            <span className="text-base font-medium text-neutral-900">
              Todas las limpiezas
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
          </Link>
        </div>
      </CollapsibleSection>
    </div>
  );
}

