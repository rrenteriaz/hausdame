"use client";

import { useState, useTransition, useMemo, useCallback, memo } from "react";
import { ChecklistArea, NotCompletedReasonCode } from "@/lib/types/cleaning-enums";
import { useRouter } from "next/navigation";
import AreaEditModal from "./AreaEditModal";
import { deleteCleaningChecklistArea, toggleCleaningChecklistItem } from "./checklist-actions";

interface ChecklistItem {
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

interface ChecklistViewProps {
  items: ChecklistItem[];
  cleaningId: string;
  cleaningStatus?: string; // Status de la limpieza para determinar si se puede editar
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
}: {
  item: ChecklistItem;
  canEdit: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={`flex items-start gap-2 p-2 rounded-lg ${
        item.isCompleted ? "bg-green-50" : "bg-amber-50"
      }`}
    >
      <div className="flex-1 min-w-0 flex items-start gap-2">
        {canEdit ? (
          <button
            type="button"
            onClick={onToggle}
            className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 border-neutral-300 flex items-center justify-center transition-colors hover:border-neutral-400 cursor-pointer"
          >
            {item.isCompleted && (
              <svg
                className="w-3 h-3 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </button>
        ) : (
          <span className="text-neutral-400 text-base leading-none select-none mt-0.5">•</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {!canEdit && (
              <>
                {item.isCompleted ? (
                  <span className="text-green-600">✓</span>
                ) : (
                  <span className="text-amber-600">✗</span>
                )}
              </>
            )}
            <span
              className={`text-xs ${
                item.isCompleted ? "text-neutral-700" : "text-neutral-700"
              }`}
            >
              {item.title}
              {item.isCompleted &&
                item.requiresValue &&
                item.valueNumber !== null && (
                  <span className="ml-1 text-neutral-600 font-medium">
                    · {item.valueNumber} {item.valueLabel || ""}
                  </span>
                )}
            </span>
          </div>
          {!item.isCompleted && item.notCompletedReasonCode && (
            <p className="text-xs text-amber-600 mt-1 ml-5">
              Razón: {REASON_LABELS[item.notCompletedReasonCode]}
              {item.notCompletedReasonNote && ` - ${item.notCompletedReasonNote}`}
            </p>
          )}
        </div>
      </div>
    </li>
  );
});

export default function ChecklistView({ items, cleaningId, cleaningStatus = "PENDING" }: ChecklistViewProps) {
  const router = useRouter();
  // useTransition SOLO para acciones pesadas (eliminar área)
  const [isDeletingArea, startDeleteTransition] = useTransition();
  const [editingArea, setEditingArea] = useState<ChecklistArea | null>(null);
  const [deletingArea, setDeletingArea] = useState<ChecklistArea | null>(null);
  
  // Estado local optimista para cada item (Map<itemId, isCompleted>)
  const [optimisticState, setOptimisticState] = useState<Map<string, boolean>>(new Map());
  
  // Permitir edición solo si la limpieza está en IN_PROGRESS o PENDING
  const canEdit = cleaningStatus === "IN_PROGRESS" || cleaningStatus === "PENDING";

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
    }, {} as Record<ChecklistArea, ChecklistItem[]>);

    // Ordenar items dentro de cada área
    Object.keys(grouped).forEach((area) => {
      grouped[area as ChecklistArea].sort((a, b) => a.sortOrder - b.sortOrder);
    });

    return grouped;
  }, [itemsWithOptimistic]);

  const activeAreas = useMemo(() => Object.keys(itemsByArea) as ChecklistArea[], [itemsByArea]);

  const handleEditArea = useCallback((area: ChecklistArea) => {
    setEditingArea(area);
  }, []);

  const handleCloseModal = useCallback(() => {
    setEditingArea(null);
  }, []);

  const handleDeleteArea = useCallback(async (area: ChecklistArea) => {
    // useTransition para acciones pesadas que requieren refresh
    startDeleteTransition(async () => {
      const result = await deleteCleaningChecklistArea(cleaningId, area);
      if (result.success) {
        setDeletingArea(null);
        router.refresh();
      } else {
        alert("Error al eliminar el área. Por favor, intenta de nuevo.");
      }
    });
  }, [cleaningId, router, startDeleteTransition]);

  // Handler memoizado para toggle de cada item
  // CRÍTICO: NO usar useTransition aquí - debe ser instantáneo
  const handleToggleItem = useCallback((itemId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    
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
        const result = await toggleCleaningChecklistItem(
          cleaningId,
          itemId,
          newValue
        );
        
        if (!result.success) {
          // REVERTIR si falla
          setOptimisticState(prev => {
            const next = new Map(prev);
            next.delete(itemId);
            return next;
          });
          console.error("Error al actualizar item:", result.error);
        }
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
  }, [cleaningId]);

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-4">
          {activeAreas.map((area) => (
            <div key={area} className="rounded-xl border border-neutral-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-neutral-800">{AREA_LABELS[area]}</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleEditArea(area)}
                    className="text-xs text-neutral-600 hover:text-neutral-900 underline underline-offset-2"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setDeletingArea(area)}
                    className="text-xs text-red-600 hover:text-red-800 underline underline-offset-2"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              <ul className="space-y-2">
                {itemsByArea[area].map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    canEdit={canEdit}
                    onToggle={() => handleToggleItem(item.id, item.isCompleted)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de edición de área */}
      {editingArea && (
        <AreaEditModal
          area={editingArea}
          areaLabel={AREA_LABELS[editingArea]}
          items={itemsByArea[editingArea] || []}
          cleaningId={cleaningId}
          isOpen={true}
          onClose={handleCloseModal}
          cleaningStatus={cleaningStatus}
        />
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
                onClick={() => handleDeleteArea(deletingArea)}
                disabled={isDeletingArea}
                className="flex-1 rounded-lg border border-red-300 bg-red-600 px-4 py-2.5 text-base font-medium text-white hover:bg-red-700 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingArea ? "Eliminando..." : "Eliminar área"}
              </button>
              <button
                type="button"
                onClick={() => setDeletingArea(null)}
                disabled={isDeletingArea}
                className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

