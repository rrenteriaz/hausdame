"use client";

import { InventoryReportType, InventoryReportSeverity } from "@prisma/client";
import { reportTypeLabel, reportSeverityLabel } from "@/lib/inventory-i18n";

interface ReportForModal {
  id: string;
  type: string;
  severity: string;
  description: string | null;
  status: string;
  createdAt: Date;
  createdBy: { name: string | null; email: string } | null;
}

interface ViewInventoryReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ReportForModal | null;
  itemName: string;
}

export default function ViewInventoryReportModal({
  isOpen,
  onClose,
  report,
  itemName,
}: ViewInventoryReportModalProps) {
  if (!isOpen) return null;

  const formatDate = (date: Date) =>
    new Date(date).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="border-b border-neutral-200 px-4 py-3 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-neutral-900">Reporte de incidencia</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-neutral-600">
            <span className="font-medium">Item:</span> {itemName}
          </p>
          {report && (
            <>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Tipo</p>
                <p className="text-sm font-medium">
                  {reportTypeLabel(report.type as InventoryReportType)}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Severidad</p>
                <p className="text-sm font-medium">
                  {reportSeverityLabel(report.severity as InventoryReportSeverity)}
                </p>
              </div>
              {report.description && (
                <div>
                  <p className="text-xs text-neutral-500 mb-1">Descripción</p>
                  <p className="text-sm text-neutral-700">{report.description}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-neutral-500 mb-1">Estado</p>
                <p className="text-sm">
                  {report.status === "PENDING"
                    ? "Pendiente"
                    : report.status === "RESOLVED"
                    ? "Resuelto"
                    : report.status}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Reportado por</p>
                <p className="text-sm">
                  {report.createdBy?.name || report.createdBy?.email || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Fecha</p>
                <p className="text-sm">{formatDate(report.createdAt)}</p>
              </div>
            </>
          )}
        </div>
        <div className="border-t border-neutral-200 px-4 py-3">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
