// app/host/inventory/inbox/ResolveReportModal.tsx
"use client";

import { useState, useEffect } from "react";
import {
  InventoryReportResolution,
  InventoryReportStatus,
} from "@/lib/inventory-constants";
import { InboxItem } from "./types";
import HistorySubModal from "@/lib/ui/inventory/HistorySubModal";
import { reportTypeLabel, resolutionLabel } from "@/lib/inventory-i18n";

interface ResolveReportModalProps {
  report: InboxItem;
  onResolve: (reportId: string, resolution: InventoryReportResolution) => void;
  onUpdateReport: (reportId: string, data: any, imageFiles?: File[], removedIds?: string[]) => Promise<void>;
  onClose: () => void;
  tenantId?: string;
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
    value: InventoryReportResolution.DEEP_CLEAN,
    label: "Limpieza profunda",
    description: "El item requiere limpieza profunda antes de volver a usarse",
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
  onUpdateReport,
  onClose,
  tenantId,
}: ResolveReportModalProps) {
  const isAlreadyResolved = report.status === "RESOLVED" || !!report.managerResolution;
  const [isEditingResolution, setIsEditingResolution] = useState(!isAlreadyResolved);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [selectedResolution, setSelectedResolution] =
    useState<InventoryReportResolution | null>(report.managerResolution || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Estados para edición de reporte
  const [description, setDescription] = useState(report.description || "");
  const [severity, setSeverity] = useState(report.severity || "INFO");
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [removedEvidenceIds, setRemovedEvidenceIds] = useState<string[]>([]);

  // Sincronizar estado cuando el reporte cambie (ej: tras una actualización exitosa desde el padre)
  useEffect(() => {
    if (report) {
      setDescription(report.description || "");
      setSeverity(report.severity || "INFO");
      // Reseteamos archivos locales y eliminaciones pendientes tras éxito
      setReportFiles([]);
      setRemovedEvidenceIds([]);
    }
  }, [report]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(date));
  };

  const handleSubmitResolution = async () => {
    if (!selectedResolution) return;

    setIsSubmitting(true);
    try {
      await onResolve(report.id, selectedResolution);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateReport = async () => {
    setIsSubmitting(true);
    try {
      await onUpdateReport(
        report.id, 
        { description, severity },
        reportFiles,
        removedEvidenceIds
      );
      setIsEditingReport(false);
      setReportFiles([]);
      setRemovedEvidenceIds([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
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

            {isEditingReport ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-neutral-700">Edición del reporte</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descripción del incidente..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm resize-none"
                  rows={3}
                />
              </div>
            ) : report.description && (
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
                  {report.evidence.map((ev) => {
                    const isRemoved = removedEvidenceIds.includes(ev.id);
                    if (isRemoved && !isEditingReport) return null;
                    
                    return (
                      <div 
                        key={ev.id} 
                        className={`relative w-32 h-32 flex-shrink-0 snap-start transition-opacity ${isRemoved ? "opacity-30" : "cursor-zoom-in active:scale-[0.98]"}`}
                        onClick={() => !isRemoved && setLightboxImage(ev.url)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ev.url}
                          alt="Evidencia"
                          className="w-full h-full object-cover rounded-lg border border-neutral-200 shadow-sm"
                        />
                        {isEditingReport && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isRemoved) {
                                setRemovedEvidenceIds(removedEvidenceIds.filter(id => id !== ev.id));
                              } else {
                                setRemovedEvidenceIds([...removedEvidenceIds, ev.id]);
                              }
                            }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-xs hover:bg-black/80"
                          >
                            {isRemoved ? "+" : "×"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  
                  {isEditingReport && (
                    <div className="flex flex-col gap-2">
                      {reportFiles.map((file, idx) => (
                        <div key={idx} className="relative w-32 h-32 flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={URL.createObjectURL(file)}
                            alt="Nueva"
                            className="w-full h-full object-cover rounded-lg border border-neutral-200 border-dashed"
                          />
                          <button
                            type="button"
                            onClick={() => setReportFiles(reportFiles.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-xs"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <label className="w-32 h-32 flex-shrink-0 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:text-neutral-500 cursor-pointer transition-colors">
                        <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-[10px] font-medium">Subir</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files) {
                              setReportFiles([...reportFiles, ...Array.from(e.target.files)]);
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {isEditingReport && (!report.evidence || report.evidence.length === 0) && (
               <div>
                 <p className="text-sm font-medium text-neutral-700 mb-2">Evidencia</p>
                 <label className="w-full h-20 rounded-lg border-2 border-dashed border-neutral-200 flex items-center justify-center gap-2 text-neutral-500 hover:border-neutral-300 cursor-pointer">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm">Añadir fotos</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          setReportFiles([...reportFiles, ...Array.from(e.target.files)]);
                        }
                      }}
                    />
                 </label>
                 <div className="flex gap-2 mt-2 overflow-x-auto">
                    {reportFiles.map((file, idx) => (
                      <div key={idx} className="relative w-20 h-20 flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={URL.createObjectURL(file)} alt="Nueva" className="w-full h-full object-cover rounded-lg" />
                        <button onClick={() => setReportFiles(reportFiles.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black text-white text-[10px]">×</button>
                      </div>
                    ))}
                 </div>
               </div>
            )}

            <div>
              <p className="text-sm font-medium text-neutral-700 mb-3">
                {isEditingResolution ? "Selecciona una resolución" : "Resolución aplicada"}
                {isEditingResolution && <span className="text-red-500"> *</span>}
              </p>
              
              {!isEditingResolution ? (
                <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-4">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <p className="text-base font-semibold text-neutral-900">
                      {RESOLUTIONS.find(r => r.value === report.managerResolution)?.label || report.managerResolution}
                    </p>
                    <button 
                      onClick={() => setIsEditingResolution(true)}
                      className="text-sm font-medium text-neutral-600 hover:text-black transition flex items-center gap-1 shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Editar resolución
                    </button>
                  </div>
                  {report.resolvedAt && (
                    <p className="text-xs text-neutral-500">
                      Resuelto el {new Date(report.resolvedAt).toLocaleDateString()}
                      {report.resolvedBy && ` por ${report.resolvedBy}`}
                    </p>
                  )}
                </div>
              ) : (
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
              )}
            </div>

            {/* Resumen de Historial */}
            {report.historyStats && report.historyStats.totalCount > 0 && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden shadow-sm">
                <div className="bg-neutral-100/50 px-4 py-2 border-b border-neutral-200 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Historial del item</span>
                  <span className="text-[10px] font-bold bg-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded">
                    {report.historyStats.totalCount} {report.historyStats.totalCount === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  {report.historyStats.latestReport && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-neutral-900">Última incidencia:</p>
                        <span className="text-[10px] text-neutral-400 font-medium">
                          {formatDate(report.historyStats.latestReport.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-700">
                        {reportTypeLabel(report.historyStats.latestReport.type as any)}
                      </p>
                      {report.historyStats.latestReport.managerResolution && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-[11px] font-bold border border-green-100">
                          Resolución: {resolutionLabel(report.historyStats.latestReport.managerResolution as any)}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => setShowHistoryModal(true)}
                    className="w-full py-2 text-xs font-bold text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors shadow-sm active:scale-[0.98]"
                  >
                    Ver historial completo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-200 px-4 py-3 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition"
            >
              Cerrar
            </button>
            {!isEditingResolution && report.status === "PENDING" && !isEditingReport && (
              <button
                onClick={() => setIsEditingReport(true)}
                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-black transition"
              >
                Editar incidencia
              </button>
            )}
            {isEditingReport ? (
              <button
                onClick={handleUpdateReport}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-black text-sm font-medium text-white hover:bg-neutral-800 transition disabled:opacity-50"
              >
                {isSubmitting ? "Guardando..." : "Guardar cambios"}
              </button>
            ) : isEditingResolution && (
              <button
                onClick={handleSubmitResolution}
                disabled={!selectedResolution || isSubmitting}
                className="px-4 py-2 rounded-lg bg-black text-sm font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Guardando..." : (isAlreadyResolved ? "Guardar cambios" : "Confirmar")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
            onClick={() => setLightboxImage(null)}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative w-full h-full max-w-4xl max-h-[80vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={lightboxImage} 
              alt="Ampliada" 
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Modal de historial completo */}
      {tenantId && report.inventoryLineId && (
        <HistorySubModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          lineId={report.inventoryLineId}
          tenantId={tenantId}
          itemName={report.itemName}
        />
      )}
    </>
  );
}

