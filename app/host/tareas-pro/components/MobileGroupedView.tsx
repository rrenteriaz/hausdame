"use client";

import { useState } from "react";
import CreateChecklistModal from "./CreateChecklistModal";
import SortableTemplateList from "./SortableTemplateList";

type PropertyItem = {
  id: string;
  name: string;
  shortName: string | null;
  groupName: string | null;
  coverThumbUrl: string | null;
  activeCount: number;
  draftCount: number;
};

type TemplateItem = {
  id: string;
  name: string;
  status: string;
  propertyId: string;
  property: { name: string; shortName: string | null };
  sectionCount: number;
  stepCount: number;
  schedule: {
    frequency: string;
    anchorDayOfWeek: number | null;
    anchorDayOfMonth: number | null;
  } | null;
};

function HouseIcon() {
  return (
    <svg
      className="w-5 h-5 text-neutral-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function PropertyCard({
  property,
  onSelect,
}: {
  property: PropertyItem;
  onSelect: (id: string) => void;
}) {
  const total = property.activeCount + property.draftCount;

  return (
    <button
      type="button"
      onClick={() => onSelect(property.id)}
      className="w-full flex items-center gap-3 p-4 bg-white rounded-xl border border-neutral-200 hover:border-neutral-300 active:scale-[0.99] transition-all text-left"
    >
      {/* Thumbnail o icono */}
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-100 shrink-0 flex items-center justify-center">
        {property.coverThumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.coverThumbUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <HouseIcon />
        )}
      </div>

      {/* Nombre y contador */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-neutral-900 truncate">
          {property.shortName ?? property.name}
        </p>
        <p className="text-xs text-neutral-400 mt-0.5">
          {total === 0
            ? "Sin tareas configuradas"
            : total === 1
            ? "1 tarea"
            : `${total} tareas`}
        </p>
      </div>

      {/* Chevron */}
      <svg
        className="w-4 h-4 text-neutral-300 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </button>
  );
}

export default function MobileGroupedView({
  properties,
  allTemplates,
  initialPropertyId,
}: {
  properties: PropertyItem[];
  allTemplates: TemplateItem[];
  initialPropertyId?: string;
}) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    initialPropertyId ?? null
  );

  const selectedProperty = selectedPropertyId
    ? (properties.find((p) => p.id === selectedPropertyId) ?? null)
    : null;

  const selectedTemplates = selectedPropertyId
    ? allTemplates.filter((t) => t.propertyId === selectedPropertyId)
    : [];

  // Solo mostrar botón de volver si hay más de una propiedad
  const showBack = properties.length > 1;

  return (
    <div className="overflow-hidden w-full">
      {/* Contenedor deslizante: 200% de ancho, cada panel ocupa el 50% (= 100% del viewport) */}
      <div
        className="flex"
        style={{
          width: "200%",
          transform: selectedPropertyId ? "translateX(-50%)" : "translateX(0%)",
          transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          willChange: "transform",
        }}
      >
        {/* PANEL 1: lista de propiedades */}
        <div className="min-w-0 space-y-2" style={{ width: "50%" }}>
          {properties.length === 0 ? (
            <p className="text-sm text-neutral-400 py-6 text-center">
              No hay propiedades activas.
            </p>
          ) : (
            properties.map((p) => (
              <PropertyCard key={p.id} property={p} onSelect={setSelectedPropertyId} />
            ))
          )}
        </div>

        {/* PANEL 2: lista de tareas de la propiedad seleccionada */}
        <div className="min-w-0" style={{ width: "50%" }}>
          {selectedProperty && (
            <div className="space-y-4">
              {/* Cabecera con botón de retroceso */}
              <div className="flex items-center gap-1">
                {showBack && (
                  <button
                    type="button"
                    onClick={() => setSelectedPropertyId(null)}
                    className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-neutral-100 active:bg-neutral-200 transition-colors text-neutral-600 shrink-0"
                    aria-label="Volver a propiedades"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                )}
                <h2 className="font-semibold text-sm text-neutral-900 truncate flex-1">
                  {selectedProperty.shortName ?? selectedProperty.name}
                </h2>
              </div>

              {/* Botón crear (solo cuando ya hay tareas) */}
              {selectedTemplates.length > 0 && (
                <CreateChecklistModal
                  properties={properties}
                  defaultPropertyId={selectedPropertyId ?? undefined}
                />
              )}

              {/* Lista de tareas o empty state */}
              {selectedTemplates.length === 0 ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
                  <p className="mb-4 text-sm font-medium text-neutral-500">
                    Aún no has creado tareas para esta propiedad
                  </p>
                  <CreateChecklistModal
                    properties={properties}
                    defaultPropertyId={selectedPropertyId ?? undefined}
                  />
                </div>
              ) : (
                <SortableTemplateList templates={selectedTemplates} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
