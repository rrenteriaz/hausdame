"use client";

import { InventoryChangeReason, InventoryReportType, InventoryReportSeverity } from "@prisma/client";
import { changeReasonLabel } from "@/lib/inventory-i18n";

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

interface InventoryReviewItemRowProps {
  line: InventoryLine;
  currentQuantity: number;
  originalQuantity: number;
  change: InventoryReviewItemChange | undefined;
  report: InventoryReport | undefined;
  onReportClick: () => void;
  onItemClick?: () => void;
  disabled?: boolean;
}

export default function InventoryReviewItemRow({
  line,
  currentQuantity,
  originalQuantity,
  change,
  report,
  onReportClick,
  onItemClick,
  disabled = false,
}: InventoryReviewItemRowProps) {
  const hasQuantityChange = currentQuantity !== originalQuantity;
  const hasReport = !!report;


  const getVariantLabel = () => {
    if (!line.variantKey || !line.variantValue) return null;
    // Mapear valores comunes de variantes
    const variantLabels: Record<string, Record<string, string>> = {
      bed_size: {
        twin: "Individual",
        full: "Full",
        queen: "Queen",
        king: "King",
        california_king: "California King",
      },
    };
    const label = variantLabels[line.variantKey]?.[line.variantValue] || line.variantValue;
    return `${line.variantKey === "bed_size" ? "Tamaño" : line.variantKey}: ${label}`;
  };

  const variantLabel = getVariantLabel();

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-2 sm:p-4">
      {/* Layout responsive: móvil máx 3 filas, desktop horizontal */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
        {/* Info del item */}
        <div 
          className="flex-1 min-w-0 cursor-pointer"
          onClick={onItemClick}
        >
          {/* Fila 1: Título + área (móvil) | solo título (desktop, área va en columna derecha) */}
          <div className="flex items-center justify-between gap-2 mb-0.5 sm:mb-1">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 line-clamp-1 flex-1 min-w-0">{line.item?.name || "Item no encontrado"}</h3>
            <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded shrink-0 sm:hidden">
              {line.area}
            </span>
          </div>

          {/* Fila 2: Registrada + variante (móvil inline) + badges */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mb-1">
            <p className="text-sm text-neutral-600 shrink-0">
              Registrada: {originalQuantity}
              {hasQuantityChange && (
                <span className="ml-1 sm:ml-2">
                  <span className="sm:hidden">· Verif: </span>
                  <span className="hidden sm:inline">Verificada: </span>
                  {currentQuantity}
                </span>
              )}
            </p>
            {variantLabel && (
              <span className="text-xs text-neutral-500 truncate max-w-[120px] sm:max-w-none sm:hidden">
                {variantLabel}
              </span>
            )}
            {hasQuantityChange && (
              <div className="shrink-0">
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 sm:px-2 py-0.5 rounded">
                  Cambio
                </span>
              </div>
            )}
          </div>

          {/* Fila 3 (móvil): solo botón Reportar incidencia */}
          <div className="sm:hidden flex justify-end">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReportClick();
              }}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition shrink-0 ${
                hasQuantityChange || hasReport
                  ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              } disabled:opacity-50 disabled:cursor-not-allowed active:scale-95`}
              title={hasQuantityChange || hasReport ? "Editar incidencia" : "Reportar incidencia"}
            >
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {hasQuantityChange || hasReport ? "Editar incidencia" : "Reportar incidencia"}
            </button>
          </div>

          {/* Desktop: variante en línea aparte si existe */}
          {variantLabel && (
            <p className="text-xs text-neutral-600 line-clamp-1 mb-1 hidden sm:block">
              {variantLabel}
            </p>
          )}

          {/* Info del cambio - solo en desktop */}
          {change && (
            <div className="text-xs text-neutral-600 mt-1 hidden sm:block">
              <span className="font-medium">Razón:</span> {changeReasonLabel(change.reason)}
              {change.reasonOtherText && ` - ${change.reasonOtherText}`}
              {change.note && (
                <div className="mt-1 text-neutral-500">
                  <span className="font-medium">Nota:</span> {change.note}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controles desktop: área encima del botón Reportar/Editar incidencia */}
        <div className="hidden sm:flex flex-col items-end flex-shrink-0 gap-1">
          <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
            {line.area}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReportClick();
            }}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              hasQuantityChange || hasReport
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
            } disabled:opacity-50 disabled:cursor-not-allowed active:scale-95`}
            title={hasQuantityChange || hasReport ? "Editar incidencia" : "Reportar incidencia"}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {hasQuantityChange || hasReport ? "Editar incidencia" : "Reportar incidencia"}
          </button>
        </div>
      </div>
    </div>
  );
}

