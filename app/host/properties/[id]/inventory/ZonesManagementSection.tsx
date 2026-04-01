"use client";

/**
 * Phase 12: Gestión manual de zonas (PropertyZone) para Host.
 * Permite crear, renombrar, reordenar y desactivar zonas OPERATIONAL.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPropertyZoneAction,
  renamePropertyZoneAction,
  reorderPropertyZonesAction,
  deactivatePropertyZoneAction,
} from "@/app/host/inventory/actions";
import {
  OPERATIONAL_CATEGORY_LABELS,
  OPERATIONAL_CATEGORY_OPTIONS,
} from "@/lib/inventory-zone-labels";
import type { PropertyZoneOperationalCategory } from "@prisma/client";

interface Zone {
  id: string;
  name: string;
  sortOrder: number | null;
  operationalCategory: PropertyZoneOperationalCategory | null;
  _count: { inventoryLines: number };
}

interface ZonesManagementSectionProps {
  propertyId: string;
  initialZones: Zone[];
}

export default function ZonesManagementSection({
  propertyId,
  initialZones,
}: ZonesManagementSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [isExpanded, setIsExpanded] = useState(false);

  // Crear nueva zona
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneCategory, setNewZoneCategory] = useState<PropertyZoneOperationalCategory | "">("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Renombrar
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  // Desactivar
  const [deactivateConfirmId, setDeactivateConfirmId] = useState<string | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  // ── Crear zona ──────────────────────────────────────────────
  const handleCreate = () => {
    const trimmed = newZoneName.trim();
    if (!trimmed) { setCreateError("El nombre es obligatorio"); return; }
    setCreateError(null);

    startTransition(async () => {
      try {
        const zone = await createPropertyZoneAction(
          propertyId,
          trimmed,
          newZoneCategory || null
        );
        const newZone: Zone = { ...zone, _count: { inventoryLines: 0 } };
        setZones((prev) => [...prev, newZone]);
        setShowCreateForm(false);
        setNewZoneName("");
        setNewZoneCategory("");
        router.refresh();
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Error al crear el área");
      }
    });
  };

  // ── Renombrar zona ──────────────────────────────────────────
  const startRename = (zone: Zone) => {
    setRenamingId(zone.id);
    setRenameValue(zone.name);
    setRenameError(null);
  };

  const handleRename = (zoneId: string) => {
    setRenameError(null);
    startTransition(async () => {
      try {
        const updated = await renamePropertyZoneAction(zoneId, renameValue);
        setZones((prev) =>
          prev.map((z) => (z.id === zoneId ? { ...z, name: updated.name } : z))
        );
        setRenamingId(null);
        router.refresh();
      } catch (err) {
        setRenameError(err instanceof Error ? err.message : "Error al renombrar");
      }
    });
  };

  // ── Reordenar zona ──────────────────────────────────────────
  const moveZone = (index: number, direction: "up" | "down") => {
    const newZones = [...zones];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newZones.length) return;

    [newZones[index], newZones[swapIndex]] = [newZones[swapIndex], newZones[index]];
    setZones(newZones);

    startTransition(async () => {
      try {
        await reorderPropertyZonesAction(
          propertyId,
          newZones.map((z) => z.id)
        );
        router.refresh();
      } catch {
        setActionError("Error al reordenar. Recarga la página.");
      }
    });
  };

  // ── Desactivar zona ─────────────────────────────────────────
  const handleDeactivate = (zoneId: string) => {
    setDeactivateError(null);
    startTransition(async () => {
      try {
        await deactivatePropertyZoneAction(zoneId);
        setZones((prev) => prev.filter((z) => z.id !== zoneId));
        setDeactivateConfirmId(null);
        router.refresh();
      } catch (err) {
        setDeactivateError(err instanceof Error ? err.message : "Error al desactivar");
      }
    });
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      {/* Header colapsable */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-neutral-50 transition"
      >
        <div>
          <span className="text-base font-semibold text-neutral-900">Gestión de áreas</span>
          <span className="ml-2 text-sm text-neutral-500">({zones.length} zonas)</span>
        </div>
        <svg
          className={`w-5 h-5 text-neutral-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="border-t border-neutral-200 px-5 py-4 space-y-4">
          {actionError && (
            <p className="text-sm text-red-600">{actionError}</p>
          )}

          {/* Lista de zonas */}
          {zones.length === 0 ? (
            <p className="text-sm text-neutral-500">No hay áreas configuradas para esta propiedad.</p>
          ) : (
            <ul className="space-y-2">
              {zones.map((zone, idx) => (
                <li
                  key={zone.id}
                  className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2"
                >
                  {/* Reorder */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0 || isPending}
                      onClick={() => moveZone(idx, "up")}
                      className="p-0.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      title="Mover arriba"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={idx === zones.length - 1 || isPending}
                      onClick={() => moveZone(idx, "down")}
                      className="p-0.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      title="Mover abajo"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Nombre / Rename inline */}
                  <div className="flex-1 min-w-0">
                    {renamingId === zone.id ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(zone.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          autoFocus
                          className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                        />
                        {renameError && (
                          <p className="text-xs text-red-600">{renameError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleRename(zone.id)}
                            disabled={isPending}
                            className="text-xs px-2 py-1 bg-neutral-900 text-white rounded disabled:opacity-50"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRenamingId(null); setRenameError(null); }}
                            className="text-xs px-2 py-1 text-neutral-600 hover:bg-neutral-100 rounded"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-sm font-medium text-neutral-800 truncate">{zone.name}</span>
                        {zone.operationalCategory && (
                          <span className="ml-2 text-xs text-neutral-500">
                            {OPERATIONAL_CATEGORY_LABELS[zone.operationalCategory]}
                          </span>
                        )}
                        <span className="ml-2 text-xs text-neutral-400">
                          {zone._count.inventoryLines} item{zone._count.inventoryLines !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  {renamingId !== zone.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startRename(zone)}
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded transition"
                        title="Renombrar"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDeactivateConfirmId(zone.id); setDeactivateError(null); }}
                        className="p-1.5 text-neutral-400 hover:text-red-500 rounded transition"
                        title="Desactivar área"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Crear nueva zona */}
          {!showCreateForm ? (
            <button
              type="button"
              onClick={() => { setShowCreateForm(true); setCreateError(null); }}
              className="w-full rounded-lg border-2 border-dashed border-neutral-300 py-2.5 text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition"
            >
              + Nueva área
            </button>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-neutral-800">Nueva área</p>
              <input
                type="text"
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreateForm(false); }}
                placeholder="Ej. Baño principal"
                autoFocus
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
              <select
                value={newZoneCategory}
                onChange={(e) => setNewZoneCategory(e.target.value as PropertyZoneOperationalCategory | "")}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">Categoría (opcional)</option>
                {OPERATIONAL_CATEGORY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {createError && <p className="text-xs text-red-600">{createError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isPending}
                  className="flex-1 py-2 text-sm font-medium bg-neutral-900 text-white rounded-lg disabled:opacity-50 transition"
                >
                  {isPending ? "Guardando..." : "Crear área"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreateForm(false); setNewZoneName(""); setNewZoneCategory(""); setCreateError(null); }}
                  className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmación para desactivar */}
      {deactivateConfirmId && (() => {
        const zone = zones.find((z) => z.id === deactivateConfirmId);
        if (!zone) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => !isPending && setDeactivateConfirmId(null)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-neutral-900">Desactivar área</h3>
              {zone._count.inventoryLines > 0 ? (
                <p className="text-sm text-neutral-600">
                  El área <strong>{zone.name}</strong> tiene {zone._count.inventoryLines} item{zone._count.inventoryLines !== 1 ? "s" : ""} activo{zone._count.inventoryLines !== 1 ? "s" : ""}.<br />
                  Usa <em>Eliminar área</em> (icono papelera) para vaciarla y desactivarla al mismo tiempo.
                </p>
              ) : (
                <p className="text-sm text-neutral-600">
                  ¿Desactivar el área <strong>{zone.name}</strong>? No tiene items activos. Podrás seguir viendo el historial pero ya no aparecerá en el formulario de inventario.
                </p>
              )}
              {deactivateError && (
                <p className="text-sm text-red-600">{deactivateError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setDeactivateConfirmId(null); setDeactivateError(null); }}
                  disabled={isPending}
                  className="px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg disabled:opacity-50"
                >
                  Cancelar
                </button>
                {zone._count.inventoryLines === 0 && (
                  <button
                    type="button"
                    onClick={() => handleDeactivate(deactivateConfirmId)}
                    disabled={isPending}
                    className="px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                  >
                    {isPending ? "Desactivando..." : "Desactivar"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
