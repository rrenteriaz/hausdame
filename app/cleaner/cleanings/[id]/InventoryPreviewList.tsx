"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import InventoryItemPreviewModal from "./InventoryItemPreviewModal";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";

interface InventoryLine {
  id: string;
  area: string;
  // Fase 9: zona física como fuente de identidad para agrupación y orden
  propertyZone?: { id: string; name: string; sortOrder: number } | null;
  expectedQty: number;
  variantKey: string | null;
  variantValue: string | null;
  item: {
    id: string;
    name: string;
    category: string;
  };
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  size?: string | null;
  condition?: string | null;
  priority?: string | null;
  notes?: string | null;
  historyStats?: {
    totalCount: number;
    activeCount: number;
    resolvedCount: number;
    latestReport: {
      type: string;
      createdAt: Date;
      status: string;
      managerResolution: string | null;
    } | null;
  } | null;
}

interface InventoryPreviewListProps {
  lines: InventoryLine[];
  lineThumbs: Record<string, Array<string | null>>;
  tenantId?: string;
}

export default function InventoryPreviewList({
  lines,
  lineThumbs,
  tenantId,
}: InventoryPreviewListProps) {
  const [selectedLine, setSelectedLine] = useState<InventoryLine | null>(null);
  const getConditionLabel = (condition: string | null | undefined) => {
    if (!condition) return null;
    switch (condition) {
      case "NEW":
        return "Nuevo";
      case "USED_LT_1Y":
        return "<1 año";
      case "USED_GT_1Y":
        return ">1 año";
      default:
        return condition;
    }
  };

  const getPriorityLabel = (priority: string | null | undefined) => {
    if (!priority) return null;
    switch (priority) {
      case "HIGH":
        return "Alta";
      case "MEDIUM":
        return "Media";
      case "LOW":
        return "Baja";
      default:
        return priority;
    }
  };

  const getVariantLabel = (variantKey: string | null, variantValue: string | null) => {
    if (!variantKey || !variantValue) return null;
    const variantLabels: Record<string, Record<string, string>> = {
      bed_size: {
        twin: "Individual",
        full: "Full",
        queen: "Queen",
        king: "King",
        california_king: "California King",
      },
    };
    const label = variantLabels[variantKey]?.[variantValue] || variantValue;
    return `${variantKey === "bed_size" ? "Tamaño" : variantKey}: ${label}`;
  };

  if (lines.length === 0) {
    return (
      <div className="text-center py-6 text-neutral-500">
        <p className="text-sm">No hay items de inventario registrados</p>
      </div>
    );
  }

  // Fase 9: agrupar por propertyZone.id como clave de identidad; fallback a area para líneas legacy
  const linesByZone = useMemo(() => {
    const map = new Map<string, InventoryLine[]>();
    for (const line of lines) {
      const key = line.propertyZone?.id ?? (line.area || "Sin área").trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(line);
    }
    return map;
  }, [lines]);

  // Ordenar por sortOrder ASC; desempate alfabético por nombre de zona
  const sortedZoneKeys = useMemo(
    () => Array.from(linesByZone.keys()).sort((a, b) => {
      const aOrder = linesByZone.get(a)![0]?.propertyZone?.sortOrder ?? Infinity;
      const bOrder = linesByZone.get(b)![0]?.propertyZone?.sortOrder ?? Infinity;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aName = linesByZone.get(a)![0]?.propertyZone?.name ?? linesByZone.get(a)![0]?.area ?? a;
      const bName = linesByZone.get(b)![0]?.propertyZone?.name ?? linesByZone.get(b)![0]?.area ?? b;
      return aName.localeCompare(bName, "es", { sensitivity: "base" });
    }),
    [linesByZone]
  );

  return (
    <div className="space-y-3">
      {sortedZoneKeys.map((zoneKey) => {
        const areaLines = linesByZone.get(zoneKey)!;
        const zoneName = (areaLines[0]?.propertyZone?.name ?? areaLines[0]?.area ?? "Sin área").trim();
        return (
          <CollapsibleSection
            key={zoneKey}
            title={zoneName}
            count={areaLines.length}
            defaultOpen={sortedZoneKeys.length <= 3}
          >
            <div className="space-y-2 pt-1">
              {areaLines.map((line) => {
        const thumbs = lineThumbs[line.id] || [null, null, null];
        const firstThumb = thumbs.find((thumb) => thumb !== null);

        return (
          <div
            key={line.id}
            onClick={() => setSelectedLine(line)}
            className="flex items-center gap-3 p-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition cursor-pointer"
          >
            {/* Thumbnail */}
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-neutral-200 overflow-hidden flex items-center justify-center">
              {firstThumb ? (
                <Image
                  src={firstThumb}
                  alt={line.item.name}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg
                  className="w-6 h-6 text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {line.item.name}
                  </p>
                  {getVariantLabel(line.variantKey, line.variantValue) && (
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {getVariantLabel(line.variantKey, line.variantValue)}
                    </p>
                  )}
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {line.area} · Cantidad: {line.expectedQty}
                  </p>
                  {line.historyStats && line.historyStats.totalCount > 0 && (
                    <div className="flex gap-1 mt-1">
                      {line.historyStats.activeCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold border border-red-200">
                          {line.historyStats.activeCount} activo
                        </span>
                      )}
                      {line.historyStats.resolvedCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-white text-neutral-600 text-[10px] border border-neutral-200">
                          {line.historyStats.resolvedCount} previas
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Chips */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {line.condition && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-neutral-200 text-neutral-700">
                    {getConditionLabel(line.condition)}
                  </span>
                )}
                {line.priority && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-neutral-200 text-neutral-700">
                    {getPriorityLabel(line.priority)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
            </div>
          </CollapsibleSection>
        );
      })}

      {/* Modal de detalle */}
      <InventoryItemPreviewModal
        isOpen={selectedLine !== null}
        line={selectedLine}
        itemThumbs={selectedLine ? (lineThumbs[selectedLine.id] || [null, null, null]) : [null, null, null]}
        onClose={() => setSelectedLine(null)}
        tenantId={tenantId}
      />
    </div>
  );
}

