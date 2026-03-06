// app/host/inventory/inbox/ResolveReportModal.tsx
"use client";

import { useState } from "react";
import { InventoryReportResolution } from "@prisma/client";
import type { InboxItem } from "./InventoryInboxClient";

interface ResolveReportModalProps {
  report: InboxItem;
  onResolve: (reportId: string, resolution: InventoryReportResolution) => void;
  onClose: () => void;
}

const RESOLUTIONS: Array<{
  value: InventoryReportResolution;
  label: string;
  description?: string;
}> = [
  {
    value: InventoryReportResolution.REPAIR,
    label: "Reparar",
    description: "El item será reparado y seguirá en uso",
  },
  {
    value: InventoryReportResolution.KEEP_USING,
    label: "Seguir usando",
    description: "El item se mantiene en uso sin cambios",
  },
  {
    value: InventoryReportResolution.REPLACE_AND_DISCARD,
    label: "Reemplazar y desechar",
    description: "Se reemplazará el item y el actual se desechará",
  },
  {
    value: InventoryReportResolution.DISCARD,
    label: "Desechar",
    description: "El item será desechado y removido del inventario",
  },
  {
    value: InventoryReportResolution.STORE,
    label: "Almacenar",
    description: "El item será almacenado y removido del inventario activo",
  },
  {
    value: InventoryReportResolution.MARK_LOST,
    label: "Marcar como extraviado",
    description: "El item será marcado como extraviado",
  },
  {
    value: InventoryReportResolution.UPDATE_ITEM_TO_NEW,
    label: "Actualizar item a nuevo",
    description: "Se actualizará la condición del item a nuevo",
  },
  {
    value: InventoryReportResolution.MARK_TO_REPLACE,
    label: "Marcar para reemplazar",
    description: "El item será marcado para reemplazo futuro",
  },
];

export default function ResolveReportModal({
  report,
  onResolve,
  onClose,
}: ResolveReportModalProps) {
  const [selectedResolution, setSelectedResolution] =
    useState<InventoryReportResolution | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedResolution) return;

    setIsSubmitting(true);
    try {
      await onResolve(report.id, selectedResolution);
    } finally {
      setIsSubmitting(false);
    }
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            Resolver reporte
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
          <div>
            <p className="text-sm font-medium text-neutral-700 mb-1">Item</p>
            <p className="text-base text-neutral-900">{report.itemName}</p>
          </div>

          {report.description && (
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-1">
                Descripción
              </p>
              <p className="text-sm text-neutral-600">{report.description}</p>
            </div>
          )}
          
          {report.evidence && report.evidence.length > 0 && (
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-2">
                Evidencia ({report.evidence.length})
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x scrollbar-hide">
                {report.evidence.map((ev) => (
                  <div key={ev.id} className="relative w-32 h-32 flex-shrink-0 snap-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ev.url}
                      alt="Evidencia"
                      className="w-full h-full object-cover rounded-lg border border-neutral-200 shadow-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-neutral-700 mb-3">
              Selecciona una resolución <span className="text-red-500">*</span>
            </p>
            <div className="space-y-2">
              {RESOLUTIONS.map((resolution) => (
                <label
                  key={resolution.value}
                  className={`block rounded-lg border-2 p-3 cursor-pointer transition ${
                    selectedResolution === resolution.value
                      ? "border-black bg-neutral-50"
                      : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="resolution"
                      value={resolution.value}
                      checked={selectedResolution === resolution.value}
                      onChange={() => setSelectedResolution(resolution.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-900">
                        {resolution.label}
                      </p>
                      {resolution.description && (
                        <p className="text-xs text-neutral-600 mt-0.5">
                          {resolution.description}
                        </p>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-200 px-4 py-3 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedResolution || isSubmitting}
            className="px-4 py-2 rounded-lg bg-black text-sm font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Resolviendo..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

