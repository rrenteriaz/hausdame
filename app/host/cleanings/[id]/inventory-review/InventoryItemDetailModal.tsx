// app/host/cleanings/[id]/inventory-review/InventoryItemDetailModal.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { InventoryReportType, InventoryReportSeverity } from "@prisma/client";
import ConfirmDeleteReportModal from "./ConfirmDeleteReportModal";
import { reportTypeLabel, reportSeverityLabel, itemCategoryLabel } from "@/lib/inventory-i18n";

import { 
  InventoryReport,
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
  allLines?: Array<{
    id: string;
    area: string;
    expectedQty: number;
    variantKey: string | null;
    variantValue: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    size?: string | null;
    condition?: string | null;
    priority?: string | null;
    notes?: string | null;
  }>;
}

interface InventoryItemDetailModalProps {
  line: InventoryLine;
  currentQuantity: number;
  originalQuantity: number;
  report?: InventoryReport | null;
  onClose: () => void;
  onReportClick: () => void;
  onDeleteReport?: () => void;
  disabled?: boolean;
}

export default function InventoryItemDetailModal({
  line,
  currentQuantity,
  originalQuantity,
  report,
  onClose,
  onReportClick,
  onDeleteReport,
  disabled = false,
}: InventoryItemDetailModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  const getConditionLabel = (condition: string | null | undefined) => {
    if (!condition) return null;
    switch (condition) {
      case "NEW":
        return "Nuevo";
      case "USED_LT_1Y":
        return "Usado menos de 1 año";
      case "USED_GT_1Y":
        return "Usado más de 1 año";
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

  // Obtener todas las líneas agrupadas o usar la línea actual
  const allLines = line.allLines || [line];
  const firstLine = allLines[0] as typeof allLines[0] & { 
    brand?: string | null; 
    model?: string | null; 
    color?: string | null; 
    size?: string | null;
    condition?: string | null;
    priority?: string | null;
    notes?: string | null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-neutral-200 px-4 py-3 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-neutral-900">
            Detalle del item
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Contenido */}
        <div className="p-4 space-y-4">
          {/* Nombre y categoría */}
          <div>
              {line.item?.name || "Item no encontrado"}
            </h3>
            <p className="text-sm text-neutral-500">{itemCategoryLabel(line.item?.category || "UNSPECIFIED")}</p>
          </div>

          {/* Variante */}
          {getVariantLabel(line.variantKey, line.variantValue) && (
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-1">Variante</p>
              <p className="text-sm text-neutral-900">
                {getVariantLabel(line.variantKey, line.variantValue)}
              </p>
            </div>
          )}

          {/* Cantidad (solo lectura; para cambiar usar botón Reportar/Editar incidencia) */}
          <div>
            <p className="text-sm font-medium text-neutral-700 mb-2">Cantidad</p>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-neutral-500 mb-1">Registrada</p>
                <p className="text-lg font-semibold text-neutral-900">
                  {originalQuantity}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Verificada</p>
                <p className="text-lg font-semibold text-neutral-900">
                  {currentQuantity}
                </p>
              </div>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Para cambiar la cantidad, usa el botón &quot;Reportar incidencia&quot; o &quot;Editar incidencia&quot;.
            </p>
          </div>

          {/* Detalles adicionales de la primera línea */}
          {(firstLine.brand || firstLine.model || firstLine.color || firstLine.size) && (
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-2">Detalles</p>
              <div className="grid grid-cols-2 gap-3">
                {firstLine.brand && (
                  <div>
                    <p className="text-xs text-neutral-500">Marca</p>
                    <p className="text-sm text-neutral-900">{firstLine.brand}</p>
                  </div>
                )}
                {firstLine.model && (
                  <div>
                    <p className="text-xs text-neutral-500">Modelo</p>
                    <p className="text-sm text-neutral-900">{firstLine.model}</p>
                  </div>
                )}
                {firstLine.color && (
                  <div>
                    <p className="text-xs text-neutral-500">Color</p>
                    <p className="text-sm text-neutral-900">{firstLine.color}</p>
                  </div>
                )}
                {firstLine.size && (
                  <div>
                    <p className="text-xs text-neutral-500">Tamaño</p>
                    <p className="text-sm text-neutral-900">{firstLine.size}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Condición y Prioridad */}
          {(firstLine.condition || firstLine.priority) && (
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-2">Estado</p>
              <div className="flex gap-3">
                {firstLine.condition && (
                  <div>
                    <p className="text-xs text-neutral-500">Condición</p>
                    <p className="text-sm text-neutral-900">
                      {getConditionLabel(firstLine.condition)}
                    </p>
                  </div>
                )}
                {firstLine.priority && (
                  <div>
                    <p className="text-xs text-neutral-500">Prioridad</p>
                    <p className="text-sm text-neutral-900">
                      {getPriorityLabel(firstLine.priority)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notas */}
          {firstLine.notes && (
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-1">Notas</p>
              <p className="text-sm text-neutral-600">{firstLine.notes}</p>
            </div>
          )}

          {/* Reporte existente */}
          {report && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-red-900">Incidencia reportada</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  {report.status === "PENDING" ? "Pendiente" : report.status}
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-medium text-red-800">Tipo:</span>{" "}
                  <span className="text-red-700">
                    {reportTypeLabel(report.type as InventoryReportType)}
                  </span>
                </p>
                <p>
                  <span className="font-medium text-red-800">Severidad:</span>{" "}
                  <span className="text-red-700">
                    {reportSeverityLabel(report.severity as InventoryReportSeverity)}
                  </span>
                </p>
                {report.description && (
                  <p>
                    <span className="font-medium text-red-800">Descripción:</span>{" "}
                    <span className="text-red-700">{report.description}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Todas las líneas (si hay múltiples) */}
          {allLines.length > 1 && (
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-2">
                Ubicaciones ({allLines.length})
              </p>
              <div className="space-y-2">
                {allLines.map((l, idx) => (
                  <div
                    key={l.id || idx}
                    className="rounded-lg border border-neutral-200 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">
                          {l.area}
                        </p>
                        {getVariantLabel(l.variantKey, l.variantValue) && (
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {getVariantLabel(l.variantKey, l.variantValue)}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-medium text-neutral-900">
                        {l.expectedQty}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer con acciones */}
        <div className="border-t border-neutral-200 px-4 py-3 flex items-center justify-between sticky bottom-0 bg-white">
            {report && onDeleteReport && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={disabled}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Eliminar reporte
              </button>
            )}
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition"
            >
              Cerrar
            </button>
            <button
              onClick={onReportClick}
              disabled={disabled}
              className="px-4 py-2 rounded-lg bg-amber-600 text-sm font-medium text-white hover:bg-amber-700 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {report ? "Editar incidencia" : "Reportar incidencia"}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de confirmación de eliminación */}
      <ConfirmDeleteReportModal
        isOpen={showDeleteConfirm}
        itemName={line.item.name}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          if (onDeleteReport) {
            onDeleteReport();
          }
        }}
      />
    </div>
  );
}

