"use client";

import { useState } from "react";
import Link from "next/link";
import { isScheduleComplete } from "@/lib/tareas-pro/domain/schedule-anchor";

export type PropertyWithCover = {
  id: string;
  name: string;
  shortName: string | null;
  coverThumbUrl: string | null;
  activeCount: number;
  draftCount: number;
};

export type TemplateItem = {
  id: string;
  name: string;
  status: string;
  propertyId: string;
  sectionCount: number;
  jobCount: number;
  schedule: {
    frequency: string;
    anchorDayOfWeek: number | null;
    anchorDayOfMonth: number | null;
  } | null;
};

export default function TareasProSplitView({
  properties,
  templates,
}: {
  properties: PropertyWithCover[];
  templates: TemplateItem[];
}) {
  const [selectedId, setSelectedId] = useState<string>(
    properties[0]?.id ?? ""
  );

  const selectedProperty = properties.find((p) => p.id === selectedId);
  const filtered = templates.filter((t) => t.propertyId === selectedId);

  return (
    <div className="flex gap-0 border border-neutral-200 rounded-2xl overflow-hidden h-[calc(100vh-320px)] min-h-[420px]">
      {/* Panel izquierdo: lista de propiedades */}
      <div className="w-56 shrink-0 border-r border-neutral-200 overflow-y-auto bg-neutral-50">
        {properties.map((p) => {
          const isSelected = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`w-full text-left flex flex-col transition-colors ${
                isSelected
                  ? "border-r-2 border-r-neutral-900 bg-white"
                  : "hover:bg-neutral-100"
              }`}
            >
              {/* Imagen */}
              <div className="w-full h-24 bg-neutral-200 shrink-0 overflow-hidden">
                {p.coverThumbUrl ? (
                  <img
                    src={p.coverThumbUrl}
                    alt={p.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-neutral-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z"
                      />
                    </svg>
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="px-3 py-2">
                <p
                  className={`text-sm font-medium leading-tight truncate ${
                    isSelected ? "text-neutral-900" : "text-neutral-700"
                  }`}
                >
                  {p.shortName ?? p.name}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {p.activeCount > 0 && (
                    <span className="text-green-600">{p.activeCount} activo{p.activeCount !== 1 ? "s" : ""}</span>
                  )}
                  {p.activeCount > 0 && p.draftCount > 0 && (
                    <span className="mx-1">·</span>
                  )}
                  {p.draftCount > 0 && (
                    <span className="text-yellow-600">{p.draftCount} borrador{p.draftCount !== 1 ? "es" : ""}</span>
                  )}
                  {p.activeCount === 0 && p.draftCount === 0 && (
                    <span>Sin checklists</span>
                  )}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Panel derecho: checklists de la propiedad seleccionada */}
      <div className="flex-1 overflow-y-auto">
        {selectedProperty && (
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">
              {selectedProperty.name}
            </p>

            {filtered.length === 0 ? (
              <p className="text-sm text-neutral-400 py-8 text-center">
                Esta propiedad aún no tiene checklists.
              </p>
            ) : (
              filtered.map((t) => {
                const isLegacyPeriodic =
                  t.schedule != null &&
                  ["DAILY", "WEEKLY", "MONTHLY"].includes(t.schedule.frequency);
                const legacyIncomplete =
                  isLegacyPeriodic &&
                  !isScheduleComplete(
                    t.schedule!.frequency,
                    t.schedule!.anchorDayOfWeek,
                    t.schedule!.anchorDayOfMonth
                  );

                return (
                  <Link
                    key={t.id}
                    href={`/host/tareas-pro/${t.id}`}
                    className="flex items-center justify-between border rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t.sectionCount} áreas · {t.jobCount} tareas
                      </p>
                      {isLegacyPeriodic && (
                        <p className="text-xs text-orange-600 mt-1">
                          Usa periodicidad legacy. Considera migrar a frecuencia por tarea.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : t.status === "DRAFT"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {t.status === "ACTIVE"
                          ? "Activo"
                          : t.status === "DRAFT"
                          ? "Borrador"
                          : "Inactivo"}
                      </span>
                      {isLegacyPeriodic && (
                        <span
                          title={
                            legacyIncomplete
                              ? "Configuración legacy incompleta — falta el ancla de día."
                              : "Usa el modelo legacy de periodicidad a nivel de template."
                          }
                          className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-help ${
                            legacyIncomplete
                              ? "bg-amber-100 text-amber-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {legacyIncomplete ? "⚠ Legacy incompleto" : "Periódico legacy"}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
