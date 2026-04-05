"use client";

/**
 * Phase 12: Gestión de zonas — botón que abre un modal lateral.
 * Drag-and-drop con @dnd-kit para reordenar.
 */

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { inferZoneCategory } from "@/lib/zones/inferZoneCategory";

interface Zone {
  id: string;
  name: string;
  sortOrder: number | null;
  operationalCategory: PropertyZoneOperationalCategory | null;
  _count: { inventoryLines: number };
}

// ── Fila sortable ─────────────────────────────────────────────
function SortableZoneRow({
  zone,
  renamingId,
  renameValue,
  renameError,
  isPending,
  onStartRename,
  onRenameChange,
  onRenameKeyDown,
  onRenameSave,
  onRenameCancel,
  onDeactivate,
}: {
  zone: Zone;
  renamingId: string | null;
  renameValue: string;
  renameError: string | null;
  isPending: boolean;
  onStartRename: (zone: Zone) => void;
  onRenameChange: (v: string) => void;
  onRenameKeyDown: (e: React.KeyboardEvent, id: string) => void;
  onRenameSave: (id: string) => void;
  onRenameCancel: () => void;
  onDeactivate: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: zone.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isRenaming = renamingId === zone.id;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2"
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing p-1 text-neutral-300 hover:text-neutral-500 touch-none"
        title="Arrastrar para reordenar"
        tabIndex={-1}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
        </svg>
      </button>

      {/* Nombre / Rename inline */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <div className="space-y-1">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => onRenameKeyDown(e, zone.id)}
              autoFocus
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
            {renameError && <p className="text-xs text-red-600">{renameError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => onRenameSave(zone.id)} disabled={isPending}
                className="text-xs px-2 py-1 bg-neutral-900 text-white rounded disabled:opacity-50">
                Guardar
              </button>
              <button type="button" onClick={onRenameCancel}
                className="text-xs px-2 py-1 text-neutral-600 hover:bg-neutral-100 rounded">
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
      {!isRenaming && (
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => onStartRename(zone)}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded transition" title="Renombrar">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button type="button" onClick={() => onDeactivate(zone.id)}
            className="p-1.5 text-neutral-400 hover:text-red-500 rounded transition" title="Desactivar área">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </button>
        </div>
      )}
    </li>
  );
}

// ── Componente principal ──────────────────────────────────────
export default function ZonesManagementSection({
  propertyId,
  initialZones,
}: {
  propertyId: string;
  initialZones: Zone[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [zones, setZones] = useState<Zone[]>(initialZones);

  // Crear
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneCategory, setNewZoneCategory] = useState<PropertyZoneOperationalCategory | "">("");
  const [categoryManuallySet, setCategoryManuallySet] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Renombrar
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  // Desactivar
  const [deactivateConfirmId, setDeactivateConfirmId] = useState<string | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  // ── Animación del modal ───────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
    } else {
      setAnimateIn(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setMounted(false), 300);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [isOpen]);

  // Escape para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && isOpen) setIsOpen(false); };
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // Bloquear scroll del body
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Inferencia de categoría a partir del nombre
  useEffect(() => {
    if (!newZoneName.trim()) {
      setNewZoneCategory("");
      setCategoryManuallySet(false);
      return;
    }
    if (!categoryManuallySet) {
      setNewZoneCategory(inferZoneCategory(newZoneName) ?? "");
    }
  }, [newZoneName, categoryManuallySet]);

  // ── DnD ──────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = zones.findIndex((z) => z.id === active.id);
    const newIndex = zones.findIndex((z) => z.id === over.id);
    const reordered = arrayMove(zones, oldIndex, newIndex);
    setZones(reordered);
    startTransition(async () => {
      try {
        await reorderPropertyZonesAction(propertyId, reordered.map((z) => z.id));
        router.refresh();
      } catch {
        setActionError("Error al guardar el orden. Recarga la página.");
        setZones(zones);
      }
    });
  };

  // ── Crear ────────────────────────────────────────────────
  const handleCreate = () => {
    const trimmed = newZoneName.trim();
    if (!trimmed) { setCreateError("El nombre es obligatorio"); return; }
    setCreateError(null);
    startTransition(async () => {
      try {
        const zone = await createPropertyZoneAction(propertyId, trimmed, newZoneCategory || null);
        setZones((prev) => [...prev, { ...zone, _count: { inventoryLines: 0 } }]);
        setShowCreateForm(false);
        setNewZoneName("");
        setNewZoneCategory("");
        setCategoryManuallySet(false);
        router.refresh();
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Error al crear el área");
      }
    });
  };

  // ── Renombrar ────────────────────────────────────────────
  const handleRename = (zoneId: string) => {
    setRenameError(null);
    startTransition(async () => {
      try {
        const updated = await renamePropertyZoneAction(zoneId, renameValue);
        setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, name: updated.name } : z)));
        setRenamingId(null);
        router.refresh();
      } catch (err) {
        setRenameError(err instanceof Error ? err.message : "Error al renombrar");
      }
    });
  };

  // ── Desactivar ───────────────────────────────────────────
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
    <>
      {/* Botón trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99]"
      >
        Gestión de áreas
      </button>

      {/* Panel lateral (drawer) */}
      {mounted && (
        <div
          className="fixed inset-0 z-[60] flex items-stretch justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        >
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 transition-opacity"
            style={{ opacity: animateIn ? 1 : 0, transitionDuration: "300ms" }}
          />

          {/* Panel */}
          <div
            className="relative w-[420px] max-w-full h-full bg-white shadow-2xl flex flex-col rounded-tl-2xl rounded-bl-2xl transform transition-transform ease-out"
            style={{
              transform: animateIn ? "translateX(0)" : "translateX(100%)",
              transitionDuration: "300ms",
              willChange: "transform",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900">Gestión de áreas</h2>
                <p className="text-sm text-neutral-500">{zones.length} zona{zones.length !== 1 ? "s" : ""}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 -mr-2 text-neutral-500 hover:text-neutral-900 transition rounded-full hover:bg-neutral-100"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {actionError && <p className="text-sm text-red-600">{actionError}</p>}

              {/* Lista sortable */}
              {zones.length === 0 ? (
                <p className="text-sm text-neutral-500">No hay áreas configuradas para esta propiedad.</p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={zones.map((z) => z.id)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-2">
                      {zones.map((zone) => (
                        <SortableZoneRow
                          key={zone.id}
                          zone={zone}
                          renamingId={renamingId}
                          renameValue={renameValue}
                          renameError={renameError}
                          isPending={isPending}
                          onStartRename={(z) => { setRenamingId(z.id); setRenameValue(z.name); setRenameError(null); }}
                          onRenameChange={setRenameValue}
                          onRenameKeyDown={(e, id) => {
                            if (e.key === "Enter") handleRename(id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onRenameSave={handleRename}
                          onRenameCancel={() => { setRenamingId(null); setRenameError(null); }}
                          onDeactivate={(id) => { setDeactivateConfirmId(id); setDeactivateError(null); }}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
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
                  <div>
                    <select
                      value={newZoneCategory}
                      onChange={(e) => {
                        setCategoryManuallySet(true);
                        setNewZoneCategory(e.target.value as PropertyZoneOperationalCategory | "");
                      }}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">Categoría (opcional)</option>
                      {OPERATIONAL_CATEGORY_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    {!categoryManuallySet && newZoneCategory && (
                      <p className="text-xs text-neutral-400 mt-1">Sugerida según el nombre del área</p>
                    )}
                  </div>
                  {createError && <p className="text-xs text-red-600">{createError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCreate} disabled={isPending}
                      className="flex-1 py-2 text-sm font-medium bg-neutral-900 text-white rounded-lg disabled:opacity-50 transition">
                      {isPending ? "Guardando..." : "Crear área"}
                    </button>
                    <button type="button"
                      onClick={() => { setShowCreateForm(false); setNewZoneName(""); setNewZoneCategory(""); setCategoryManuallySet(false); setCreateError(null); }}
                      className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación desactivar */}
      {deactivateConfirmId && (() => {
        const zone = zones.find((z) => z.id === deactivateConfirmId);
        if (!zone) return null;
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
            onClick={() => !isPending && setDeactivateConfirmId(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-neutral-900">Desactivar área</h3>
              {zone._count.inventoryLines > 0 ? (
                <p className="text-sm text-neutral-600">
                  El área <strong>{zone.name}</strong> tiene {zone._count.inventoryLines} item
                  {zone._count.inventoryLines !== 1 ? "s" : ""} activo{zone._count.inventoryLines !== 1 ? "s" : ""}.<br />
                  Usa <em>Eliminar área</em> (icono papelera) para vaciarla y desactivarla al mismo tiempo.
                </p>
              ) : (
                <p className="text-sm text-neutral-600">
                  ¿Desactivar el área <strong>{zone.name}</strong>? No tiene items activos. Ya no aparecerá en el formulario de inventario.
                </p>
              )}
              {deactivateError && <p className="text-sm text-red-600">{deactivateError}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setDeactivateConfirmId(null); setDeactivateError(null); }}
                  disabled={isPending}
                  className="px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg disabled:opacity-50">
                  Cancelar
                </button>
                {zone._count.inventoryLines === 0 && (
                  <button type="button" onClick={() => handleDeactivate(deactivateConfirmId)}
                    disabled={isPending}
                    className="px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">
                    {isPending ? "Desactivando..." : "Desactivar"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
