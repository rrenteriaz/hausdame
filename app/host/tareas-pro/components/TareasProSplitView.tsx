"use client";

import { useState } from "react";
import Link from "next/link";
import { isScheduleComplete } from "@/lib/tareas-pro/domain/schedule-anchor";
import CreateChecklistModal from "./CreateChecklistModal";

export type PropertyWithCover = {
  id: string;
  name: string;
  shortName: string | null;
  groupName: string | null;
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

type Mode = "group-selection" | "property-focused";

// Inline keyframe — fires only when the element mounts (via key changes).
const SLIDE_STYLE = `
  @keyframes hd-slide-in {
    from { opacity: 0; transform: translateX(10px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .hd-slide-in { animation: hd-slide-in 0.2s ease-out; }
`;

export default function TareasProSplitView({
  properties,
  templates,
}: {
  properties: PropertyWithCover[];
  templates: TemplateItem[];
}) {
  // ── Derived: sorted groups ───────────────────────────────────────────────
  const groupMap = new Map<string, PropertyWithCover[]>();
  for (const p of properties) {
    const g = p.groupName || "Sin grupo";
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g)!.push(p);
  }
  const sortedGroups = Array.from(groupMap.entries()).sort(([a], [b]) => {
    if (a === "Sin grupo") return 1;
    if (b === "Sin grupo") return -1;
    return a.localeCompare(b, "es");
  });

  const firstGroupName = sortedGroups[0]?.[0] ?? "";
  const hasMultipleGroups = sortedGroups.length > 1;

  // ── State ────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("group-selection");

  // State 1: which group is highlighted in the left group list
  const [activeGroupName, setActiveGroupName] = useState<string>(firstGroupName);

  // State 2: focused group + selected property
  const [focusedGroupName, setFocusedGroupName] = useState<string>("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  // ── Derived from state ───────────────────────────────────────────────────
  // Properties shown in right panel (State 1) or left panel (State 2)
  const displayedGroupName =
    mode === "group-selection" ? activeGroupName : focusedGroupName;
  const displayedProperties = groupMap.get(displayedGroupName) ?? [];

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const filteredTemplates = templates.filter(
    (t) => t.propertyId === selectedPropertyId
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleGroupClick = (groupName: string) => {
    setActiveGroupName(groupName);
  };

  const handlePropertyClick = (propertyId: string) => {
    const gName =
      properties.find((p) => p.id === propertyId)?.groupName || "Sin grupo";
    setFocusedGroupName(gName);
    setSelectedPropertyId(propertyId);
    setMode("property-focused");
  };

  const handleBackToGroups = () => {
    setMode("group-selection");
    // Keep activeGroupName pointing at the group we came from so the right
    // panel restores context naturally.
    setActiveGroupName(focusedGroupName || firstGroupName);
    setSelectedPropertyId("");
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Scoped keyframe for slide-in — injected once per component */}
      <style>{SLIDE_STYLE}</style>

      <div className="flex gap-0 border border-neutral-200 rounded-2xl overflow-hidden h-[calc(100vh-240px)] min-h-[500px]">

        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        <div
          className="shrink-0 border-r border-neutral-200 bg-neutral-50 flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out"
          style={{ width: mode === "group-selection" ? "12rem" : "14rem" }}
        >
          {mode === "group-selection" ? (
            /* State 1 — group list */
            <div className="flex-1 overflow-y-auto">
              {sortedGroups.map(([groupName, groupProps]) => {
                const isActive = groupName === activeGroupName;
                return (
                  <button
                    key={groupName}
                    type="button"
                    onClick={() => handleGroupClick(groupName)}
                    className={`w-full text-left px-4 py-3 transition-colors border-b border-neutral-100 last:border-b-0 ${
                      isActive
                        ? "border-r-2 border-r-neutral-900 bg-white"
                        : "hover:bg-neutral-100"
                    }`}
                  >
                    <p
                      className={`text-sm font-medium truncate ${
                        isActive ? "text-neutral-900" : "text-neutral-600"
                      }`}
                    >
                      {groupName}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {groupProps.length}{" "}
                      {groupProps.length === 1 ? "propiedad" : "propiedades"}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            /* State 2 — property list of focused group */
            <div key="prop-list" className="hd-slide-in flex flex-col h-full">
              {/* Back button */}
              {hasMultipleGroups && (
                <button
                  type="button"
                  onClick={handleBackToGroups}
                  className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 border-b border-neutral-200 transition-colors shrink-0"
                >
                  <svg
                    className="w-3 h-3 shrink-0"
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
                  Todos los grupos
                </button>
              )}

              {/* Group header */}
              <div className="px-3 py-1.5 bg-neutral-100 border-b border-neutral-200 shrink-0 sticky top-0 z-10">
                <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide truncate">
                  {focusedGroupName}
                </p>
              </div>

              {/* Properties */}
              <div className="flex-1 overflow-y-auto">
                {displayedProperties.map((p) => {
                  const isSelected = p.id === selectedPropertyId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPropertyId(p.id)}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2.5 transition-colors border-b border-neutral-100 last:border-b-0 ${
                        isSelected
                          ? "border-r-2 border-r-neutral-900 bg-white"
                          : "hover:bg-neutral-100"
                      }`}
                    >
                      {/* Thumbnail 36×36 */}
                      <div className="shrink-0 w-9 h-9 rounded-md overflow-hidden bg-neutral-200 border border-neutral-200">
                        {p.coverThumbUrl ? (
                          <img
                            src={p.coverThumbUrl}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-neutral-300 flex items-center justify-center">
                              <span className="text-[9px] font-semibold text-neutral-500">
                                H
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Name + badge + counts */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <p
                            className={`text-xs font-medium leading-tight truncate ${
                              isSelected ? "text-neutral-900" : "text-neutral-700"
                            }`}
                          >
                            {p.name}
                          </p>
                          {p.shortName && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-black text-white leading-none">
                              {p.shortName}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-0.5 leading-tight">
                          {p.activeCount > 0 && (
                            <span className="text-green-600">
                              {p.activeCount} activa{p.activeCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {p.activeCount > 0 && p.draftCount > 0 && <span> · </span>}
                          {p.draftCount > 0 && (
                            <span className="text-yellow-600">
                              {p.draftCount} borrador{p.draftCount !== 1 ? "es" : ""}
                            </span>
                          )}
                          {p.activeCount === 0 && p.draftCount === 0 && (
                            <span>Sin tareas</span>
                          )}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col">
          {mode === "group-selection" ? (
            /* State 1 — property list for active group */
            <div className="flex-1 overflow-y-auto">
              {displayedProperties.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-neutral-400">
                    No hay propiedades en este grupo.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {displayedProperties.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePropertyClick(p.id)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors"
                    >
                      {/* Thumbnail 48×48 */}
                      <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200">
                        {p.coverThumbUrl ? (
                          <img
                            src={p.coverThumbUrl}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center">
                              <span className="text-xs font-semibold text-neutral-500">
                                H
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-neutral-900 truncate">
                            {p.name}
                          </span>
                          {p.shortName && (
                            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-black text-white">
                              {p.shortName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {p.activeCount > 0 && (
                            <span className="text-green-600">
                              {p.activeCount} activa{p.activeCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {p.activeCount > 0 && p.draftCount > 0 && (
                            <span className="text-neutral-300"> · </span>
                          )}
                          {p.draftCount > 0 && (
                            <span className="text-yellow-600">
                              {p.draftCount} borrador{p.draftCount !== 1 ? "es" : ""}
                            </span>
                          )}
                          {p.activeCount === 0 && p.draftCount === 0 && (
                            <span className="text-neutral-400">Sin tareas</span>
                          )}
                        </p>
                      </div>
                      {/* Chevron */}
                      <svg
                        className="w-4 h-4 text-neutral-400 shrink-0"
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
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* State 2 — tasks for selected property */
            <div key="task-panel" className="hd-slide-in flex-1 min-h-0 flex flex-col">
              {/* Header: property name + create button */}
              <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-neutral-100 bg-white">
                <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide truncate">
                  {selectedProperty?.name ?? ""}
                </p>
                <div className="shrink-0">
                  <CreateChecklistModal properties={properties} />
                </div>
              </div>

              {/* Task list */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                {!selectedProperty ? (
                  <div className="flex items-center justify-center h-full py-12">
                    <p className="text-sm text-neutral-400">
                      Selecciona una propiedad para ver sus tareas.
                    </p>
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-8 text-center">
                    Esta propiedad aún no tiene tareas.
                  </p>
                ) : (
                  filteredTemplates.map((t) => {
                    const isLegacyPeriodic =
                      t.schedule != null &&
                      ["DAILY", "WEEKLY", "MONTHLY"].includes(
                        t.schedule.frequency
                      );
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
                              Usa periodicidad legacy. Considera migrar a
                              frecuencia por tarea.
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
                              {legacyIncomplete
                                ? "⚠ Legacy incompleto"
                                : "Periódico legacy"}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
