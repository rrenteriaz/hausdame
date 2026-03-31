"use client";

import { useEffect, useState } from "react";
import { getInventoryLineHistoryAction } from "@/app/host/inventory/inbox/actions";
import { reportTypeLabel, reportStatusLabel, resolutionLabel } from "@/lib/inventory-i18n";

interface HistorySubModalProps {
  isOpen: boolean;
  onClose: () => void;
  lineId: string;
  tenantId: string;
  itemName: string;
}

export default function HistorySubModal({
  isOpen,
  onClose,
  lineId,
  tenantId,
  itemName,
}: HistorySubModalProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  useEffect(() => {
    if (isOpen && lineId && tenantId) {
      setIsLoading(true);
      getInventoryLineHistoryAction(lineId, tenantId)
        .then((data) => {
          setHistory(data);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, lineId, tenantId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-neutral-100 px-6 py-4 flex items-center justify-between bg-neutral-50/50">
          <div>
            <h3 className="text-lg font-bold text-neutral-900">Historial de incidencias</h3>
            <p className="text-xs text-neutral-500 truncate max-w-[300px]">{itemName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-200 rounded-full transition-colors text-neutral-400 hover:text-neutral-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="w-8 h-8 border-4 border-neutral-200 border-t-black rounded-full animate-spin"></div>
              <p className="text-sm text-neutral-500 font-medium">Cargando historial...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center">
              <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-neutral-500 font-medium">No hay registros para este item</p>
              <p className="text-xs text-neutral-400 mt-1">Este item específico no ha tenido incidencias reportadas.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-neutral-100">
              {history.map((report) => (
                <div key={report.id} className="relative">
                  {/* Timeline dot */}
                  <div className={`absolute -left-[23px] top-1.5 w-4 h-4 rounded-full border-4 border-white shadow-sm z-10 ${
                    report.status === "RESOLVED" ? "bg-green-500" : "bg-amber-500"
                  }`}></div>
                  
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                        {formatDate(report.createdAt)}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                        report.status === "RESOLVED" 
                          ? "bg-green-50 text-green-700 border-green-100" 
                          : "bg-amber-50 text-amber-700 border-amber-100"
                      }`}>
                        {reportStatusLabel(report.status)}
                      </span>
                    </div>
                    
                    <h4 className="text-sm font-bold text-neutral-900">
                      {reportTypeLabel(report.type)}
                    </h4>
                    
                    {report.description && (
                      <p className="text-xs text-neutral-600 bg-neutral-50 p-2 rounded border border-neutral-100 italic">
                        "{report.description}"
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-1">
                      {report.managerResolution && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-800 rounded-md border border-blue-100">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-[11px] font-semibold">
                            Resolución: {resolutionLabel(report.managerResolution)}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>{report.createdBy?.name || "Desconocido"}</span>
                      </div>
                    </div>

                    {report.evidence && report.evidence.length > 0 && (
                      <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                        {report.evidence.map((ev: any) => (
                          <div key={ev.id} className="relative w-12 h-12 rounded bg-neutral-100 overflow-hidden border border-neutral-200 flex-shrink-0">
                            <img 
                              src={ev.asset?.publicUrl} 
                              alt="Evidencia" 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-100 p-4 bg-neutral-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-neutral-900 text-white rounded-lg text-sm font-bold hover:bg-neutral-800 transition-all active:scale-95 shadow-sm"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
