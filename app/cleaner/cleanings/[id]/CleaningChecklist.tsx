"use client";

import { useState, useMemo, useCallback, memo, useEffect } from "react";
import { updateChecklistItemCompletion } from "../../checklist-actions";
import { ChecklistArea, NotCompletedReasonCode } from "@/lib/types/cleaning-enums";
import Image from "next/image";
import { normalizeKey, buildMatchKey } from "@/lib/media/checklistItemThumbsKeys";

interface CleaningChecklistItem {
  id: string;
  area: ChecklistArea;
  title: string;
  sortOrder: number;
  isCompleted: boolean;
  requiresValue: boolean;
  valueLabel?: string | null;
  valueNumber?: number | null;
  notCompletedReasonCode?: NotCompletedReasonCode | null;
  notCompletedReasonNote?: string | null;
}

interface CleaningChecklistProps {
  cleaningId: string;
  items: CleaningChecklistItem[];
  canEdit: boolean; // Solo si está asignada y en progreso
  checklistThumbsMap?: Record<string, Array<string | null>>; // Record serializable con clave "area|title|sortOrder" -> thumbs
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

const REASON_LABELS: Record<NotCompletedReasonCode, string> = {
  NO_HABIA_INSUMOS: "No había insumos",
  NO_TUVE_ACCESO: "No tuve acceso",
  SE_ROMPIO_O_FALLO: "Se rompió o falló",
  NO_HUBO_TIEMPO: "No hubo tiempo",
  OTRO: "Otro",
};

// Componente memoizado para cada item del checklist
const ChecklistItemRow = memo(function ChecklistItemRow({
  item,
  canEdit,
  onToggle,
  thumbs,
  onPreviewClick,
}: {
  item: CleaningChecklistItem;
  canEdit: boolean;
  onToggle: () => void;
  thumbs: Array<string | null> | null;
  onPreviewClick: (url: string) => void;
}) {
  return (
    <li
      className={`flex items-start gap-2 p-2 rounded-lg ${
        item.isCompleted ? "bg-green-50" : "bg-neutral-50"
      }`}
    >
      <input
        type="checkbox"
        checked={item.isCompleted}
        onChange={onToggle}
        disabled={!canEdit}
        className="mt-0.5 rounded border-neutral-300 text-black focus:ring-black/5 cursor-pointer"
      />
      {/* Slot fijo para miniatura (mantiene alineación de viñetas) */}
      <div className="w-8 h-8 flex-shrink-0">
        {thumbs && thumbs[0] && (
          <div
            className="relative w-8 h-8 rounded-md overflow-hidden border border-neutral-200 bg-neutral-50 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onPreviewClick(thumbs[0]!);
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
        <span
          className={`text-xs ${
            item.isCompleted
              ? "text-neutral-500 line-through"
              : "text-neutral-700"
          }`}
        >
          {item.title}
          {item.isCompleted && item.requiresValue && item.valueNumber !== null && (
            <span className="ml-1 text-neutral-600">
              · {item.valueNumber} {item.valueLabel || ""}
            </span>
          )}
        </span>
        {!item.isCompleted && item.notCompletedReasonCode && (
          <p className="text-xs text-amber-600 mt-1">
            Razón: {REASON_LABELS[item.notCompletedReasonCode]}
            {item.notCompletedReasonNote && ` - ${item.notCompletedReasonNote}`}
          </p>
        )}
      </div>
    </li>
  );
});

export default function CleaningChecklist({
  cleaningId,
  items,
  canEdit,
  checklistThumbsMap = {},
}: CleaningChecklistProps) {
  // Estado local optimista para cada item (Map<itemId, isCompleted>)
  const [optimisticState, setOptimisticState] = useState<Map<string, boolean>>(new Map());
  const [valueModal, setValueModal] = useState<{
    itemId: string;
    itemTitle: string;
    valueLabel: string;
  } | null>(null);
  const [valueInput, setValueInput] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Memoizar items con estado optimista aplicado
  const itemsWithOptimistic = useMemo(() => {
    return items.map(item => {
      const optimisticValue = optimisticState.get(item.id);
      return optimisticValue !== undefined
        ? { ...item, isCompleted: optimisticValue }
        : item;
    });
  }, [items, optimisticState]);

  // Memoizar agrupación por área
  const itemsByArea = useMemo(() => {
    const grouped = itemsWithOptimistic.reduce((acc, item) => {
      if (!acc[item.area]) {
        acc[item.area] = [];
      }
      acc[item.area].push(item);
      return acc;
    }, {} as Record<ChecklistArea, CleaningChecklistItem[]>);

    // Ordenar items dentro de cada área
    Object.keys(grouped).forEach((area) => {
      grouped[area as ChecklistArea].sort((a, b) => a.sortOrder - b.sortOrder);
    });

    return grouped;
  }, [itemsWithOptimistic]);

  const activeAreas = useMemo(() => Object.keys(itemsByArea) as ChecklistArea[], [itemsByArea]);

  // Handler memoizado para toggle de cada item
  // CRÍTICO: NO usar useTransition aquí - debe ser instantáneo
  const handleToggle = useCallback((itemId: string, currentCompleted: boolean, item: CleaningChecklistItem) => {
    if (!canEdit) return;

    // Si se está marcando como completado Y requiere valor
    if (!currentCompleted && item.requiresValue) {
      // Abrir modal para capturar cantidad
      setValueModal({
        itemId,
        itemTitle: item.title,
        valueLabel: item.valueLabel || "Cantidad",
      });
      setValueInput("");
      return;
    }

    const newValue = !currentCompleted;

    // OPTIMISTIC UPDATE: Actualizar UI inmediatamente (< 16ms)
    setOptimisticState(prev => {
      const next = new Map(prev);
      next.set(itemId, newValue);
      return next;
    });

    // Guardar en background de forma async directa (sin useTransition)
    // Esto no bloquea la UI y no causa commits adicionales
    (async () => {
      try {
        await updateChecklistItemCompletion(cleaningId, itemId, newValue);
        // Si es exitoso, el estado optimista se mantiene
        // NO hacer router.refresh() - esto causaría re-render del Server Component
      } catch (error) {
        // REVERTIR si hay excepción
        setOptimisticState(prev => {
          const next = new Map(prev);
          next.delete(itemId);
          return next;
        });
        console.error("Error al actualizar item:", error);
      }
    })();
  }, [cleaningId, canEdit]);

  const handleValueSubmit = useCallback(() => {
    if (!valueModal) return;

    const value = parseInt(valueInput, 10);
    if (isNaN(value) || value < 0) {
      alert("Por favor ingresa un número válido (0 o mayor)");
      return;
    }

    // OPTIMISTIC UPDATE: Actualizar UI inmediatamente
    setOptimisticState(prev => {
      const next = new Map(prev);
      next.set(valueModal.itemId, true);
      return next;
    });

    // Cerrar modal inmediatamente
    setValueModal(null);
    setValueInput("");

    // Guardar en background de forma async directa (sin useTransition)
    (async () => {
      try {
        await updateChecklistItemCompletion(cleaningId, valueModal.itemId, true, value);
        // Si es exitoso, el estado optimista se mantiene
      } catch (error) {
        // REVERTIR si hay excepción
        setOptimisticState(prev => {
          const next = new Map(prev);
          next.delete(valueModal.itemId);
          return next;
        });
        console.error("Error al actualizar item con valor:", error);
        // Reabrir modal si falla
        setValueModal({
          itemId: valueModal.itemId,
          itemTitle: valueModal.itemTitle,
          valueLabel: valueModal.valueLabel,
        });
        setValueInput(value.toString());
      }
    })();
  }, [valueModal, valueInput, cleaningId]);

  const handleValueCancel = () => {
    setValueModal(null);
    setValueInput("");
  };

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

  if (activeAreas.length === 0) {
    return null; // No mostrar sección si no hay items
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {activeAreas.map((area) => (
          <div key={area} className="rounded-xl border border-neutral-200 bg-white p-3 space-y-2">
            <h3 className="text-xs font-semibold text-neutral-800">{AREA_LABELS[area]}</h3>
            <ul className="space-y-2">
              {itemsByArea[area].map((item) => {
                // Hacer match con thumbs usando clave compuesta normalizada (area, title, sortOrder)
                const matchKey = buildMatchKey(item.area, item.title, item.sortOrder);
                const thumbs = checklistThumbsMap?.[matchKey] ?? null;
                
                return (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    canEdit={canEdit}
                    onToggle={() => handleToggle(item.id, item.isCompleted, item)}
                    thumbs={thumbs}
                    onPreviewClick={(url) => setPreviewUrl(url)}
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Modal para capturar cantidad */}
      {valueModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={handleValueCancel}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">
              {valueModal.itemTitle}
            </h3>
            <p className="text-xs text-neutral-600 mb-4">
              ¿Cuántas {valueModal.valueLabel.toLowerCase()} dejaste?
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-800 mb-2">
                  {valueModal.valueLabel} *
                </label>
                <input
                  type="number"
                  min="0"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleValueSubmit();
                    if (e.key === "Escape") handleValueCancel();
                  }}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleValueSubmit}
                  disabled={!valueInput || parseInt(valueInput, 10) < 0}
                  className="flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={handleValueCancel}
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
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

