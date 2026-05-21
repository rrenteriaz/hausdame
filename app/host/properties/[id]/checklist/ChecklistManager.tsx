"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  createChecklistItem,
  updateChecklistItem,
  toggleChecklistItemActive,
  deleteChecklistItem,
  copyChecklistToProperties,
  deleteChecklistArea,
  createBaseChecklistTemplate,
} from "../../checklist-actions";
import { ChecklistArea } from "@/lib/types/cleaning-enums";
import AreaEditModal from "./AreaEditModal";
import TaskPhotosModal from "./TaskPhotosModal";
import Image from "next/image";

interface ChecklistItem {
  id: string;
  area: ChecklistArea;
  title: string;
  sortOrder: number;
  isActive: boolean;
  requiresValue: boolean;
  valueLabel?: string | null;
}

interface ChecklistManagerProps {
  propertyId: string;
  items: ChecklistItem[];
  allProperties: Array<{ id: string; name: string; shortName?: string | null }>;
  itemThumbsEntries?: [string, Array<string | null>][];
}

const AREA_LABELS: Record<ChecklistArea, string> = {
  SALA: "Sala",
  COMEDOR: "Comedor",
  COCINA: "Cocina",
  HABITACIONES: "Habitaciones",
  BANOS: "Baños",
  PATIO: "Patio",
  JARDIN: "Jardín",
  COCHERA: "Cochera",
  OTROS: "Otros",
};

const AREA_OPTIONS: ChecklistArea[] = [
  "SALA",
  "COMEDOR",
  "COCINA",
  "HABITACIONES",
  "BANOS",
  "PATIO",
  "JARDIN",
  "COCHERA",
  "OTROS",
];

export default function ChecklistManager({
  propertyId,
  items,
  allProperties,
  itemThumbsEntries = [],
}: ChecklistManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [itemsState, setItemsState] = useState<ChecklistItem[]>(() => items);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const initializedFor = useRef<string | null>(null);

  // Inicialización segura: solo re-hidratar cuando cambia propertyId (no por props items)
  useEffect(() => {
    if (initializedFor.current !== propertyId) {
      setItemsState(items);
      initializedFor.current = propertyId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [isAreaEditModalOpen, setIsAreaEditModalOpen] = useState(false);
  const [isSelectAreaModalOpen, setIsSelectAreaModalOpen] = useState(false);
  const [shouldAutoFocusNewItem, setShouldAutoFocusNewItem] = useState(false);
  const [editingArea, setEditingArea] = useState<ChecklistArea | null>(null);
  const [deletingArea, setDeletingArea] = useState<ChecklistArea | null>(null);
  const [selectedProperties, setSelectedProperties] = useState<Set<string>>(new Set());
  const [copyResult, setCopyResult] = useState<{ copied: number; errors: string[] } | null>(null);
  const [seedResult, setSeedResult] = useState<{ created: number; message: string } | null>(null);
  const [isPhotosModalOpen, setIsPhotosModalOpen] = useState(false);
  const [photosItemId, setPhotosItemId] = useState<string | null>(null);
  const [photosItemTitle, setPhotosItemTitle] = useState<string | null>(null);
  const [itemThumbsMap, setItemThumbsMap] = useState<Map<string, Array<string | null>>>(
    () => new Map(itemThumbsEntries)
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Handler para cerrar preview con Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && previewUrl) {
        setPreviewUrl(null);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [previewUrl]);

  // Formulario para agregar item
  const [newItemArea, setNewItemArea] = useState<ChecklistArea>("SALA");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemRequiresValue, setNewItemRequiresValue] = useState(false);
  const [newItemValueLabel, setNewItemValueLabel] = useState("");

  // Formulario para editar item
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [editItemArea, setEditItemArea] = useState<ChecklistArea>("SALA");
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemRequiresValue, setEditItemRequiresValue] = useState(false);
  const [editItemValueLabel, setEditItemValueLabel] = useState("");

  // Agrupar items por área (solo áreas con items activos)
  const itemsByArea = itemsState
    .filter((item) => item.isActive)
    .reduce((acc, item) => {
      if (!acc[item.area]) {
        acc[item.area] = [];
      }
      acc[item.area].push(item);
      return acc;
    }, {} as Record<ChecklistArea, ChecklistItem[]>);

  // Ordenar items dentro de cada área por sortOrder
  Object.keys(itemsByArea).forEach((area) => {
    itemsByArea[area as ChecklistArea].sort((a, b) => a.sortOrder - b.sortOrder);
  });

  const activeAreas = Object.keys(itemsByArea) as ChecklistArea[];

  const addOptimisticItem = async (args: {
    area: ChecklistArea;
    title: string;
    requiresValue?: boolean;
    valueLabel?: string | null;
  }) => {
    const title = args.title.trim();
    if (!title) return;
    setCreateError(null);

    const tempId = `temp_${Date.now()}`;
    const nextSortOrder =
      itemsState.length > 0
        ? Math.max(...itemsState.map((i) => i.sortOrder)) + 1
        : 0;

    const optimisticItem: ChecklistItem = {
      id: tempId,
      area: args.area,
      title,
      sortOrder: nextSortOrder,
      isActive: true,
      requiresValue: !!args.requiresValue,
      valueLabel: args.requiresValue ? args.valueLabel || null : null,
    };

    // Optimistic UI: insertar inmediatamente
    setItemsState((prev) => [...prev, optimisticItem]);

    const formData = new FormData();
    formData.append("propertyId", propertyId);
    formData.append("area", args.area);
    formData.append("title", title);
    formData.append("requiresValue", String(!!args.requiresValue));
    if (args.requiresValue && args.valueLabel?.trim()) {
      formData.append("valueLabel", args.valueLabel.trim());
    }

    // Importante: NO redirect, NO router.refresh, NO useTransition para alta.
    try {
      setIsCreating(true);
      const created = await createChecklistItem(formData);
      setItemsState((prev) =>
        prev.map((i) =>
          i.id === tempId
            ? {
                id: created.id,
                area: created.area,
                title: created.title,
                sortOrder: created.sortOrder,
                isActive: created.isActive,
                requiresValue: created.requiresValue,
                valueLabel: created.valueLabel,
              }
            : i
        )
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar el item.";
      setItemsState((prev) => prev.filter((i) => i.id !== tempId));
      setCreateError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleAdd = async () => {
    if (!newItemTitle.trim()) return;
    setIsAddModalOpen(false);
    setNewItemTitle("");
    setNewItemArea("SALA");
    setNewItemRequiresValue(false);
    setNewItemValueLabel("");

    await addOptimisticItem({
      area: newItemArea,
      title: newItemTitle,
      requiresValue: newItemRequiresValue,
      valueLabel: newItemValueLabel.trim() || null,
    });
  };

  const handleToggleActive = (id: string, currentActive: boolean) => {
    setCreateError(null);
    const prev = itemsState;
    // Optimista: reflejar inmediatamente
    setItemsState((cur) =>
      cur.map((i) => (i.id === id ? { ...i, isActive: !currentActive } : i))
    );

    const formData = new FormData();
    formData.append("id", id);
    formData.append("propertyId", propertyId);
    formData.append("isActive", String(currentActive));

    toggleChecklistItemActive(formData).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : "No se pudo actualizar el item.";
      setItemsState(prev);
      setCreateError(msg);
    });
  };

  const handleEdit = (item: ChecklistItem) => {
    setEditingItem(item);
    setEditItemArea(item.area);
    setEditItemTitle(item.title);
    setEditItemRequiresValue(item.requiresValue);
    setEditItemValueLabel(item.valueLabel || "");
    setIsEditModalOpen(true);
  };

  const handleUpdate = () => {
    if (!editingItem || !editItemTitle.trim()) return;

    setCreateError(null);
    const prev = itemsState;

    // Optimistic update + cerrar modal antes del await
    const updatedLocal: ChecklistItem = {
      ...editingItem,
      area: editItemArea,
      title: editItemTitle.trim(),
      requiresValue: editItemRequiresValue,
      valueLabel: editItemRequiresValue ? (editItemValueLabel.trim() || null) : null,
    };

    setIsEditModalOpen(false);
    setEditingItem(null);
    setEditItemTitle("");
    setEditItemArea("SALA");
    setEditItemRequiresValue(false);
    setEditItemValueLabel("");

    setItemsState((cur) =>
      cur.map((i) => (i.id === updatedLocal.id ? updatedLocal : i))
    );

    const formData = new FormData();
    formData.append("id", updatedLocal.id);
    formData.append("propertyId", propertyId);
    formData.append("area", editItemArea);
    formData.append("title", updatedLocal.title);
    formData.append("requiresValue", String(editItemRequiresValue));
    if (editItemRequiresValue && editItemValueLabel.trim()) {
      formData.append("valueLabel", editItemValueLabel.trim());
    }

    updateChecklistItem(formData)
      .then((serverItem) => {
        setItemsState((cur) =>
          cur.map((i) => (i.id === updatedLocal.id ? { ...i, ...serverItem } : i))
        );
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "No se pudo guardar el item.";
        setItemsState(prev);
        setCreateError(msg);
      });
  };

  const handleDelete = (id: string) => {
    if (!confirm("¿Eliminar este item del checklist?")) return;

    setCreateError(null);
    const prev = itemsState;
    setItemsState((cur) => cur.filter((i) => i.id !== id));

    const formData = new FormData();
    formData.append("id", id);
    formData.append("propertyId", propertyId);

    deleteChecklistItem(formData).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : "No se pudo eliminar el item.";
      setItemsState(prev);
      setCreateError(msg);
    });
  };

  // ===== Callbacks para AreaEditModal (single source of truth: itemsState) =====
  const onDeleteItem = (itemId: string) => {
    setCreateError(null);
    const prev = itemsState;
    setItemsState((cur) => cur.filter((i) => i.id !== itemId));

    const formData = new FormData();
    formData.append("id", itemId);
    formData.append("propertyId", propertyId);

    deleteChecklistItem(formData).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : "No se pudo eliminar el item.";
      setItemsState(prev);
      setCreateError(msg);
    });
  };

  const onAddItem = (area: ChecklistArea, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreateError(null);

    const tempId = `temp_${Date.now()}`;
    const nextSortOrder =
      itemsState.length > 0 ? Math.max(...itemsState.map((i) => i.sortOrder)) + 1 : 0;

    const optimisticItem: ChecklistItem = {
      id: tempId,
      area,
      title: trimmed,
      sortOrder: nextSortOrder,
      isActive: true,
      requiresValue: false,
      valueLabel: null,
    };

    // INSERT inmediato (antes de cualquier await)
    setItemsState((prev) => [...prev, optimisticItem]);

    const formData = new FormData();
    formData.append("propertyId", propertyId);
    formData.append("area", area);
    formData.append("title", trimmed);
    formData.append("requiresValue", "false");

    createChecklistItem(formData)
      .then((created) => {
        setItemsState((prev) =>
          prev.map((i) => (i.id === tempId ? { ...i, ...created } : i))
        );
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "No se pudo guardar el item.";
        setItemsState((prev) => prev.filter((i) => i.id !== tempId));
        setCreateError(msg);
      });
  };

  const onUpdateItemTitle = (itemId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const current = itemsState.find((i) => i.id === itemId);
    if (!current) return;
    if (current.title === trimmed) return;

    setCreateError(null);
    const prev = itemsState;

    // Optimistic update
    setItemsState((cur) => cur.map((i) => (i.id === itemId ? { ...i, title: trimmed } : i)));

    const formData = new FormData();
    formData.append("id", itemId);
    formData.append("propertyId", propertyId);
    formData.append("area", current.area);
    formData.append("title", trimmed);
    formData.append("requiresValue", String(current.requiresValue));
    if (current.requiresValue && current.valueLabel) {
      formData.append("valueLabel", current.valueLabel);
    }

    updateChecklistItem(formData)
      .then((updated) => {
        setItemsState((cur) => cur.map((i) => (i.id === itemId ? { ...i, ...updated } : i)));
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "No se pudo guardar el item.";
        setItemsState(prev);
        setCreateError(msg);
      });
  };

  const handleCopy = () => {
    if (selectedProperties.size === 0) {
      alert("Selecciona al menos una propiedad");
      return;
    }

    startTransition(async () => {
      const result = await copyChecklistToProperties(propertyId, Array.from(selectedProperties));
      setCopyResult(result);
      if (result.errors.length === 0) {
        setTimeout(() => {
          setIsCopyModalOpen(false);
          setSelectedProperties(new Set());
          setCopyResult(null);
        }, 2000);
      }
    });
  };

  const handleCreateBaseTemplate = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("propertyId", propertyId);
      formData.append("returnTo", `/host/properties/${propertyId}/checklist`);
      const res = await createBaseChecklistTemplate(formData);
      setSeedResult(res);
      if (res.items && res.items.length > 0) {
        setItemsState((prev) => [...prev, ...res.items!]);
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedProperties.size === allProperties.length) {
      setSelectedProperties(new Set());
    } else {
      setSelectedProperties(new Set(allProperties.map((p) => p.id)));
    }
  };

  return (
    <div className="space-y-4">
      {createError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{createError}</p>
        </div>
      )}
      {/* Botones de acción */}
      {activeAreas.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSelectAreaModalOpen(true)}
            className="flex-1 lg:w-1/4 rounded-lg border border-black bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99]"
          >
            Agregar item
          </button>
          <button
            type="button"
            onClick={() => setIsCopyModalOpen(true)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99]"
          >
            Copiar a otra propiedad
          </button>
        </div>
      )}

      {/* Lista de áreas con items */}
      {activeAreas.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
          <p className="text-base text-neutral-700 font-medium">
            Aún no has creado tareas para esta propiedad. Agrega tu primer item o crea una plantilla base para empezar rápido.
          </p>

          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setIsSelectAreaModalOpen(true)}
              className="rounded-lg border border-black bg-black px-4 py-2 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99]"
            >
              Agregar item
            </button>
            <button
              type="button"
              onClick={handleCreateBaseTemplate}
              disabled={isPending}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Crear plantilla base
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {activeAreas.map((area) => (
            <div key={area} className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-neutral-800">{AREA_LABELS[area]}</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingArea(area);
                      setIsAreaEditModalOpen(true);
                    }}
                    className="p-1.5 text-neutral-600 hover:text-neutral-900 transition rounded-lg hover:bg-neutral-100"
                    aria-label="Editar área"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingArea(area)}
                    className="p-1.5 text-red-600 hover:text-red-800 transition rounded-lg hover:bg-red-50"
                    aria-label="Eliminar área"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              <ul className="space-y-2">
                {itemsByArea[area].map((item) => {
                  const thumbs = itemThumbsMap.get(item.id) || [null, null, null];
                  const photosCount = thumbs.filter(thumb => thumb !== null).length;
                  
                  return (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-2 p-2 rounded-lg hover:bg-neutral-50"
                    >
                      <div className="flex-1 min-w-0 flex items-start gap-2">
                        {/* Slot fijo para miniatura (mantiene alineación de viñetas) */}
                        <div className="w-8 h-8 flex-shrink-0">
                          {thumbs[0] && (
                            <div
                              className="relative w-8 h-8 rounded-md overflow-hidden border border-neutral-200 bg-neutral-50 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewUrl(thumbs[0]);
                              }}
                            >
                              <Image
                                src={thumbs[0]}
                                alt="Vista previa"
                                fill
                                className="object-cover"
                                sizes="32px"
                              />
                            </div>
                          )}
                        </div>
                        <span className="text-neutral-400 text-base leading-none select-none mt-0.5">•</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-neutral-700">{item.title}</p>
                          {item.requiresValue && (
                            <p className="text-xs text-neutral-500 mt-0.5">
                              Requiere cantidad{item.valueLabel ? `: ${item.valueLabel}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPhotosItemId(item.id);
                          setPhotosItemTitle(item.title);
                          setIsPhotosModalOpen(true);
                        }}
                        className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors rounded relative"
                        aria-label={photosCount > 0 ? "Gestionar fotos" : "Agregar fotos"}
                        title={photosCount > 0 ? "Gestionar fotos" : "Agregar fotos"}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {photosCount > 0 && (
                          <span className="absolute -top-1 -right-1 text-[10px] font-medium text-white bg-black rounded-full w-4 h-4 flex items-center justify-center">
                            {photosCount}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Modal para editar item */}
      {isEditModalOpen && editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          onClick={() => {
            setIsEditModalOpen(false);
            setEditingItem(null);
          }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Editar item</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-800 mb-2">
                  Área *
                </label>
                <select
                  value={editItemArea}
                  onChange={(e) => setEditItemArea(e.target.value as ChecklistArea)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                >
                  {AREA_OPTIONS.map((area) => (
                    <option key={area} value={area}>
                      {AREA_LABELS[area]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-800 mb-2">
                  Título *
                </label>
                <input
                  type="text"
                  value={editItemTitle}
                  onChange={(e) => setEditItemTitle(e.target.value)}
                  placeholder="Ej: Limpiar pisos"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editRequiresValue"
                  checked={editItemRequiresValue}
                  onChange={(e) => setEditItemRequiresValue(e.target.checked)}
                  className="rounded border-neutral-300 text-black focus:ring-black/5"
                />
                <label htmlFor="editRequiresValue" className="text-xs text-neutral-700 cursor-pointer">
                  Pedir cantidad al completar
                </label>
              </div>

              {editItemRequiresValue && (
                <div>
                  <label className="block text-xs font-medium text-neutral-800 mb-2">
                    Etiqueta de cantidad (opcional)
                  </label>
                  <input
                    type="text"
                    value={editItemValueLabel}
                    onChange={(e) => setEditItemValueLabel(e.target.value)}
                    placeholder="Ej: Toallas, Rollos"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Si no especificas, se mostrará &quot;Cantidad&quot;
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={isPending || !editItemTitle.trim()}
                  className="flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingItem(null);
                    setEditItemTitle("");
                    setEditItemArea("SALA");
                    setEditItemRequiresValue(false);
                    setEditItemValueLabel("");
                  }}
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para agregar item */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Agregar item</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-800 mb-2">
                  Área *
                </label>
                <select
                  value={newItemArea}
                  onChange={(e) => setNewItemArea(e.target.value as ChecklistArea)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                >
                  {AREA_OPTIONS.map((area) => (
                    <option key={area} value={area}>
                      {AREA_LABELS[area]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-800 mb-2">
                  Título *
                </label>
                <input
                  type="text"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  placeholder="Ej: Limpiar pisos"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="requiresValue"
                  checked={newItemRequiresValue}
                  onChange={(e) => setNewItemRequiresValue(e.target.checked)}
                  className="rounded border-neutral-300 text-black focus:ring-black/5"
                />
                <label htmlFor="requiresValue" className="text-xs text-neutral-700 cursor-pointer">
                  Pedir cantidad al completar
                </label>
              </div>

              {newItemRequiresValue && (
                <div>
                  <label className="block text-xs font-medium text-neutral-800 mb-2">
                    Etiqueta de cantidad (opcional)
                  </label>
                  <input
                    type="text"
                    value={newItemValueLabel}
                    onChange={(e) => setNewItemValueLabel(e.target.value)}
                    placeholder="Ej: Toallas, Rollos"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Si no especificas, se mostrará &quot;Cantidad&quot;
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={isPending || !newItemTitle.trim()}
                  className="flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Agregando..." : "Agregar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setNewItemTitle("");
                    setNewItemArea("SALA");
                    setNewItemRequiresValue(false);
                    setNewItemValueLabel("");
                  }}
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para copiar */}
      {isCopyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setIsCopyModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
              Copiar checklist a otras propiedades
            </h3>
            <p className="text-xs text-neutral-600 mb-4">
              Selecciona las propiedades a las que quieres copiar este checklist. Se reemplazarán
              los items existentes.
            </p>

            {copyResult && (
              <div
                className={`mb-4 rounded-lg p-3 ${
                  copyResult.errors.length > 0
                    ? "bg-red-50 border border-red-200"
                    : "bg-green-50 border border-green-200"
                }`}
              >
                {copyResult.errors.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {copyResult.errors.map((error, idx) => (
                      <p key={idx} className="text-xs text-red-600">
                        • {error}
                      </p>
                    ))}
                  </div>
                )}
                <p
                  className={`text-xs font-medium ${
                    copyResult.errors.length > 0 ? "text-red-900" : "text-green-900"
                  }`}
                >
                  Copiado a {copyResult.copied} propiedad(es)
                </p>
              </div>
            )}

            <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="w-full text-left text-xs font-medium text-neutral-700 hover:text-neutral-900 underline underline-offset-2"
              >
                {selectedProperties.size === allProperties.length
                  ? "Deseleccionar todas"
                  : "Seleccionar todas"}
              </button>
              {allProperties.map((prop) => (
                <label
                  key={prop.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedProperties.has(prop.id)}
                    onChange={(e) => {
                      const newSet = new Set(selectedProperties);
                      if (e.target.checked) {
                        newSet.add(prop.id);
                      } else {
                        newSet.delete(prop.id);
                      }
                      setSelectedProperties(newSet);
                    }}
                    className="rounded border-neutral-300 text-black focus:ring-black/5"
                  />
                  <span className="text-xs text-neutral-700">
                    {prop.shortName || prop.name}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={handleCopy}
                disabled={isPending || selectedProperties.size === 0}
                className="flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Copiando..." : "Copiar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCopyModalOpen(false);
                  setSelectedProperties(new Set());
                  setCopyResult(null);
                }}
                className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de selección de área para agregar item */}
      {isSelectAreaModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setIsSelectAreaModalOpen(false);
            setShouldAutoFocusNewItem(false);
          }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
              Seleccionar área
            </h3>
            <p className="text-xs text-neutral-600 mb-4">
              Elige el área donde quieres agregar el nuevo item
            </p>
            {(() => {
              // Filtrar solo las áreas que NO tienen items activos
              const unusedAreas = AREA_OPTIONS.filter(
                (areaOption) => !activeAreas.includes(areaOption)
              );

              if (unusedAreas.length === 0) {
                return (
                  <div className="text-center py-8">
                    <p className="text-base text-neutral-500">
                      Todas las áreas ya tienen items. Puedes agregar más items haciendo clic en &quot;Editar&quot; en cada área.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {unusedAreas.map((areaOption) => (
                    <button
                      key={areaOption}
                      type="button"
                      onClick={() => {
                        setEditingArea(areaOption);
                        setShouldAutoFocusNewItem(true);
                        setIsSelectAreaModalOpen(false);
                        setIsAreaEditModalOpen(true);
                      }}
                      className="w-full text-left p-3 rounded-lg hover:bg-neutral-50 transition-colors border border-neutral-200"
                    >
                      <span className="text-base font-medium text-neutral-900">
                        {AREA_LABELS[areaOption]}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
            <div className="mt-4 pt-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => {
                  setIsSelectAreaModalOpen(false);
                  setShouldAutoFocusNewItem(false);
                }}
                className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para eliminar área */}
      {deletingArea && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setDeletingArea(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">
              Eliminar área
            </h3>
            <p className="text-base text-neutral-700 mb-4">
              ¿Estás seguro de que quieres eliminar el área <strong>&quot;{AREA_LABELS[deletingArea]}&quot;</strong> y todas sus actividades?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-800 font-medium">
                ⚠️ Advertencia: Esta acción no se puede deshacer. Se eliminarán permanentemente todas las actividades de esta área.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  const prev = itemsState;
                  // Optimista: remover items del área inmediatamente
                  setItemsState((cur) => cur.filter((i) => i.area !== deletingArea));
                  setDeletingArea(null);

                  deleteChecklistArea(propertyId, deletingArea).catch((e: unknown) => {
                    const msg = e instanceof Error ? e.message : "No se pudo eliminar el área.";
                    setItemsState(prev);
                    setCreateError(msg);
                  });
                }}
                disabled={isPending}
                className="flex-1 rounded-lg border border-red-300 bg-red-600 px-4 py-2.5 text-base font-medium text-white hover:bg-red-700 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Eliminando..." : "Eliminar área"}
              </button>
              <button
                type="button"
                onClick={() => setDeletingArea(null)}
                disabled={isPending}
                className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edición de área estilo Google Keep */}
      {isAreaEditModalOpen && editingArea && (
        <AreaEditModal
          area={editingArea}
          areaLabel={AREA_LABELS[editingArea]}
          items={itemsByArea[editingArea] || []}
          isOpen={isAreaEditModalOpen}
          autoFocusNewItem={shouldAutoFocusNewItem}
          onDeleteItem={onDeleteItem}
          onAddItem={onAddItem}
          onUpdateItemTitle={onUpdateItemTitle}
          itemThumbsMap={itemThumbsMap}
          onClose={() => {
            setIsAreaEditModalOpen(false);
            setEditingArea(null);
            setShouldAutoFocusNewItem(false);
          }}
        />
      )}

      {/* Modal de fotos de tarea */}
      {isPhotosModalOpen && photosItemId && (
        <TaskPhotosModal
          isOpen={isPhotosModalOpen}
          checklistItemId={photosItemId}
          taskTitle={photosItemTitle || undefined}
          onClose={() => {
            setIsPhotosModalOpen(false);
            setPhotosItemId(null);
            setPhotosItemTitle(null);
          }}
          onThumbsChange={(newThumbs) => {
            setItemThumbsMap((prev) => {
              const updated = new Map(prev);
              updated.set(photosItemId, newThumbs);
              return updated;
            });
          }}
        />
      )}

      {/* Modal de preview de imagen (solo visualización) */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={previewUrl}
              alt="Vista previa"
              width={1200}
              height={800}
              className="object-contain rounded-lg"
            />
            <button
              type="button"
              onClick={() => setPreviewUrl(null)}
              className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-2 hover:bg-black/90 transition-colors"
              aria-label="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
