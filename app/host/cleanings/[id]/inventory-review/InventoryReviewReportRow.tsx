"use client";

import { 
  InventoryReviewItemChange, 
  InventoryReport 
} from "@/types/inventory";

interface InventoryLine {
  id: string;
  area: string;
  expectedQty: number;
  variantKey: string | null;
  variantValue: string | null;
  item: {
    id: string;
    name: string;
    category: string;
  };
  allLines?: any[];
}

interface InventoryReviewReportRowProps {
  line: InventoryLine;
  originalQuantity: number;
  verifiedQuantity: number;
  change: InventoryReviewItemChange | undefined;
  report: InventoryReport | undefined;
  onItemClick?: () => void;
}

export default function InventoryReviewReportRow({
  line,
  originalQuantity,
  verifiedQuantity,
  change,
  report,
  onItemClick,
}: InventoryReviewReportRowProps) {
  const hasQuantityChange = verifiedQuantity !== originalQuantity;
  const hasReport = !!report;

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
        {/* Info del item */}
        <div 
          className="flex-1 min-w-0 cursor-pointer"
          onClick={onItemClick}
        >
          {/* Línea 1: Título + tag/área */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 line-clamp-1 flex-1 min-w-0">{line.item.name}</h3>
            <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded shrink-0">
              {line.area}
            </span>
          </div>

          {/* Línea 2: "Registrada: X" + "Verificada: Y" + badge estado */}
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <div className="flex items-center gap-3 text-sm text-neutral-600 flex-wrap">
              <span>Registrada: {originalQuantity}</span>
              <span>Verificada: {verifiedQuantity}</span>
            </div>
            {/* Badge estado */}
            <div className="shrink-0">
              {!hasQuantityChange && !hasReport && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  OK
                </span>
              )}
              {hasQuantityChange && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                  Cambio
                </span>
              )}
              {hasReport && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                  Reporte
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

