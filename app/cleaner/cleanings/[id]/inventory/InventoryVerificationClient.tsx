"use client";

/**
 * Cliente para verificación rápida de inventario (Cleaner)
 * Mobile-first, tap-tap rápido.
 * Inventario agrupado por área con CollapsibleSection (formato oficial).
 */

import { useState, useTransition, useMemo } from "react";
import { setInventoryCheck } from "@/app/cleaner/inventory/actions";
import { InventoryReviewStatus, InventoryPriority } from "@/lib/inventory-constants";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";

// Temporal: hasta que se aplique la migración
type InventoryCheckStatus = "OK" | "MISSING" | "DAMAGED";

interface InventoryItem {
  lineId: string;
  itemName: string;
  area: string;
  attentionLevel: InventoryPriority;
  currentStatus: InventoryCheckStatus | null;
  note: string | null;
}

interface InventoryVerificationClientProps {
  cleaningId: string;
  inventoryData: InventoryItem[];
}

type AttentionFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";

export default function InventoryVerificationClient({
  cleaningId,
  inventoryData: initialInventoryData,
}: InventoryVerificationClientProps) {
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("ALL");
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([]);
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>(initialInventoryData);

  // Filtrar items según filtros
  const filteredItems = inventoryData.filter((item) => {
    // Filtro por atención
    if (attentionFilter !== "ALL") {
      if (item.attentionLevel !== attentionFilter) {
        return false;
      }
    }

    // Filtro "Solo problemas"
    if (showProblemsOnly) {
      if (item.currentStatus !== "MISSING" && item.currentStatus !== "DAMAGED") {
        return false;
      }
    }

    return true;
  });

  // Agrupar por área (formato oficial, como InventoryPreviewList)
  const { linesByArea, sortedAreas } = useMemo(() => {
    const map = new Map<string, typeof filteredItems>();
    for (const item of filteredItems) {
      const area = (item.area || "Sin área").trim();
      if (!map.has(area)) map.set(area, []);
      map.get(area)!.push(item);
    }
    const areas = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    return { linesByArea: map, sortedAreas: areas };
  }, [filteredItems]);

  const handleStatusChange = (item: InventoryItem, status: InventoryCheckStatus) => {
    startTransition(async () => {
      try {
        await setInventoryCheck(cleaningId, item.lineId, status);
        
        // Actualizar estado local (optimistic)
        setInventoryData((prev) =>
          prev.map((i) =>
            i.lineId === item.lineId ? { ...i, currentStatus: status } : i
          )
        );
        
        // Mostrar toast
        const statusLabel =
          status === "OK"
            ? "OK"
            : status === "MISSING"
            ? "Falta"
            : "Dañado";
        const toastId = Math.random().toString(36).substring(7);
        setToasts((prev) => [...prev, { id: toastId, message: `Marcado: ${statusLabel}` }]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 3000);

        setSelectedItem(null);
      } catch (error: any) {
        console.error("Error al guardar check:", error);
        alert(error?.message || "Error al guardar verificación");
      }
    });
  };

  const getAttentionEmoji = (level: InventoryPriority) => {
    switch (level) {
      case "HIGH":
        return "🟥";
      case "MEDIUM":
        return "🟨";
      case "LOW":
        return "🟩";
      default:
        return "•";
    }
  };

  const getStatusBadge = (status: InventoryCheckStatus | null) => {
    if (!status) {
      return <span className="text-xs text-neutral-400">•</span>;
    }
    switch (status) {
      case "OK":
        return <span className="text-xs text-green-600">✅ OK</span>;
      case "MISSING":
        return <span className="text-xs text-red-600">❌ Falta</span>;
      case "DAMAGED":
        return <span className="text-xs text-yellow-600">⚠️ Dañado</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast Container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 space-y-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="px-6 py-3 rounded-lg shadow-lg text-white bg-green-500 transition-all duration-300 pointer-events-auto"
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as AttentionFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setAttentionFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                attentionFilter === filter
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {filter === "ALL"
                ? "Todo"
                : filter === "HIGH"
                ? "🟥 Alta"
                : filter === "MEDIUM"
                ? "🟨 Media"
                : "🟩 Baja"}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showProblemsOnly}
            onChange={(e) => setShowProblemsOnly(e.target.checked)}
            className="w-4 h-4 rounded border-neutral-300"
          />
          <span>Solo problemas</span>
        </label>
      </div>

      {/* Lista agrupada por área con CollapsibleSection (formato oficial) */}
      <div className="space-y-3">
        {sortedAreas.length === 0 ? (
          <p className="text-center py-6 text-neutral-500 text-sm">
            No hay items que coincidan con los filtros
          </p>
        ) : (
          sortedAreas.map((area) => {
            const areaItems = linesByArea.get(area)!;
            return (
              <CollapsibleSection
              key={area}
              title={area}
              count={areaItems.length}
              defaultOpen={sortedAreas.length <= 3}
            >
              <div className="space-y-2 pt-1">
                {areaItems.map((item) => (
                  <button
                    key={item.lineId}
                    onClick={() => setSelectedItem(item)}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm" title={item.attentionLevel}>
                          {getAttentionEmoji(item.attentionLevel)}
                        </span>
                        <div className="font-medium text-neutral-900 truncate">
                          {item.itemName}
                        </div>
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">{item.area}</div>
                    </div>
                    <div className="ml-3">{getStatusBadge(item.currentStatus)}</div>
                  </button>
                ))}
              </div>
            </CollapsibleSection>
            );
          })
        )}
      </div>

      {/* Sheet de selección de estado */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSelectedItem(null)}
          />

          {/* Sheet */}
          <div className="relative bg-white w-full rounded-t-2xl p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">{selectedItem.itemName}</h3>
              <p className="text-sm text-neutral-500">{selectedItem.area}</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleStatusChange(selectedItem, "OK")}
                disabled={isPending}
                className="w-full p-4 rounded-lg border-2 border-green-500 bg-green-50 text-green-700 font-medium hover:bg-green-100 transition disabled:opacity-50"
              >
                ✅ OK
              </button>
              <button
                onClick={() => handleStatusChange(selectedItem, "MISSING")}
                disabled={isPending}
                className="w-full p-4 rounded-lg border-2 border-red-500 bg-red-50 text-red-700 font-medium hover:bg-red-100 transition disabled:opacity-50"
              >
                ❌ Falta
              </button>
              <button
                onClick={() => handleStatusChange(selectedItem, "DAMAGED")}
                disabled={isPending}
                className="w-full p-4 rounded-lg border-2 border-yellow-500 bg-yellow-50 text-yellow-700 font-medium hover:bg-yellow-100 transition disabled:opacity-50"
              >
                ⚠️ Dañado
              </button>
            </div>

            <button
              onClick={() => setSelectedItem(null)}
              className="mt-4 w-full py-2 text-neutral-500 hover:text-neutral-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

