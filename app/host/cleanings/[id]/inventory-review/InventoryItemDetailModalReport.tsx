"use client";

import { useState } from "react";
import Image from "next/image";
import HistorySubModal from "@/lib/ui/inventory/HistorySubModal";

import {
  InventoryEvidenceView
} from "@/types/inventory";
import { itemCategoryLabel, changeReasonLabel, reportTypeLabel, reportSeverityLabel, resolutionLabel } from "@/lib/inventory-i18n";

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
};

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

interface InventoryReport {
  id: string;
  itemId: string;
  type: string;
  severity: string;
  description: string | null;
  evidence?: InventoryEvidenceView[];
}

interface InventoryReviewItemChange {
  id: string;
  itemId: string;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  reasonOtherText: string | null;
  note: string | null;
}

interface InventoryItemDetailModalReportProps {
  line: InventoryLine;
  originalQuantity: number;
  verifiedQuantity: number;
  change: InventoryReviewItemChange | undefined;
  report: InventoryReport | undefined;
  onClose: () => void;
  tenantId?: string;
}

export default function InventoryItemDetailModalReport({
  line,
  originalQuantity,
  verifiedQuantity,
  change,
  report,
  onClose,
  tenantId,
}: InventoryItemDetailModalReportProps) {
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Detalle del item</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition"
          >
            <svg
              className="w-6 h-6"
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

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Nombre y categoría */}
          <div>
            <h3 className="text-base font-semibold text-neutral-900 mb-1">
              {line.item.name}
            </h3>
            <p className="text-sm text-neutral-600">
              {itemCategoryLabel(line.item.category)} · {line.area}
            </p>
          </div>

          {/* Cantidades */}
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Registrada:</span>
              <span className="text-base font-medium text-neutral-900">{originalQuantity}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Verificada:</span>
              <span className="text-base font-medium text-neutral-900">{verifiedQuantity}</span>
            </div>
          </div>

          {/* Cambio (si existe) */}
          {change && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <p className="text-sm font-medium text-amber-900">Cambio registrado</p>
              <div className="text-xs text-amber-800 space-y-1">
                <p>
                  <span className="font-medium">Razón:</span> {changeReasonLabel(change.reason as any)}
                  {change.reasonOtherText && ` - ${change.reasonOtherText}`}
                </p>
                {change.note && (
                  <p>
                    <span className="font-medium">Nota:</span> {change.note}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Reporte (si existe) */}
          {report && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
              <p className="text-sm font-medium text-red-900">Reporte registrado</p>
              <div className="text-xs text-red-800 space-y-1">
                <p>
                  <span className="font-medium">Tipo:</span> {reportTypeLabel(report.type as any)}
                </p>
                <p>
                  <span className="font-medium">Severidad:</span> {reportSeverityLabel(report.severity as any)}
                </p>
                {report.description && (
                  <p>
                    <span className="font-medium text-red-800">Descripción:</span> {report.description}
                  </p>
                )}
                
                {/* Galería de evidencias */}
                {report.evidence && report.evidence.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[10px] font-bold text-red-800 mb-2 uppercase tracking-wider">Evidencia visual</p>
                    <div className="flex gap-2 overflow-x-auto pb-1 snap-x scrollbar-hide">
                      {report.evidence.map((ev) => (
                        <div 
                          key={ev.id} 
                          className="relative w-20 h-20 flex-shrink-0 snap-start cursor-zoom-in active:scale-[0.98] transition-transform"
                          onClick={() => setLightboxImage(ev.url)}
                        >
                          <Image
                            src={ev.url}
                            alt="Evidencia"
                            fill
                            className="object-cover rounded-md border border-red-200 shadow-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resumen de Historial */}
          {line.historyStats && line.historyStats.totalCount > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden shadow-sm">
              <div className="bg-neutral-100/50 px-4 py-2 border-b border-neutral-200 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Historial del item</span>
                <span className="text-[10px] font-bold bg-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded">
                  {line.historyStats.totalCount} {line.historyStats.totalCount === 1 ? 'evento' : 'eventos'}
                </span>
              </div>
              <div className="p-4 space-y-3">
                {line.historyStats.latestReport && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-neutral-900">Última incidencia:</p>
                      <span className="text-[10px] text-neutral-400 font-medium">
                        {formatDate(line.historyStats.latestReport.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700">
                      {reportTypeLabel(line.historyStats.latestReport.type as any)}
                    </p>
                    {line.historyStats.latestReport.managerResolution && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-[11px] font-bold border border-green-100">
                        Resolución: {resolutionLabel(line.historyStats.latestReport.managerResolution as any)}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setShowHistoryModal(true);
                  }}
                  className="w-full py-2 text-xs font-bold text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors shadow-sm active:scale-[0.98]"
                >
                  Ver historial completo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg bg-black text-base font-medium text-white hover:bg-neutral-800 transition"
          >
            Cerrar
          </button>
        </div>

        {/* Modal de historial completo */}
        {tenantId && (
          <HistorySubModal
            isOpen={showHistoryModal}
            onClose={() => setShowHistoryModal(false)}
            lineId={line.id}
            tenantId={tenantId}
            itemName={line.item.name}
          />
        )}

        {/* Lightbox */}
        {lightboxImage && (
          <div 
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 transition-opacity duration-300"
            onClick={() => setLightboxImage(null)}
          >
            <button 
              className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors p-2"
              onClick={() => setLightboxImage(null)}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="relative w-full h-full max-w-5xl max-h-[85vh] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={lightboxImage} 
                alt="Evidencia ampliada" 
                className="max-w-full max-h-full object-contain rounded shadow-2xl animate-in zoom-in-95 duration-200"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

