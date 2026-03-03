"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createOrUpdateInventoryReview,
  submitInventoryReview,
  createOrUpdateInventoryChange,
  createInventoryReport,
  deleteInventoryReport,
  uploadInventoryReportEvidence,
} from "@/app/host/inventory-review/actions";
import { InventoryReviewStatus, InventoryChangeReason, InventoryReportType, InventoryReportSeverity } from "@prisma/client";
import InventoryReviewItemRow from "./InventoryReviewItemRow";
import InventoryIncidentModal, { InventoryIncidentPayload } from "./InventoryIncidentModal";
import InventoryItemDetailModal from "./InventoryItemDetailModal";

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
  allLines?: any[]; // Todas las líneas agrupadas para el detalle
}

interface InventoryReviewItemChange {
  id: string;
  itemId: string;
  inventoryLineId?: string | null;
  quantityBefore: number;
  quantityAfter: number;
  reason: InventoryChangeReason;
  reasonOtherText: string | null;
  note: string | null;
  status: string;
}

interface InventoryReport {
  id: string;
  itemId: string;
  inventoryLineId?: string | null;
  type: InventoryReportType;
  severity: InventoryReportSeverity;
  description: string | null;
  status: string;
}

interface InventoryReview {
  id: string;
  status: InventoryReviewStatus;
  itemChanges: InventoryReviewItemChange[];
  reports: InventoryReport[];
}

interface InventoryReviewScreenProps {
  cleaningId: string;
  propertyId: string;
  initialReview: InventoryReview | null;
  inventoryLines: InventoryLine[];
  returnTo?: string;
}

export default function InventoryReviewScreen({
  cleaningId,
  propertyId,
  initialReview,
  inventoryLines,
  returnTo,
}: InventoryReviewScreenProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [review, setReview] = useState<InventoryReview | null>(initialReview);
  const [changes, setChanges] = useState<Map<string, InventoryReviewItemChange>>(new Map());
  const [reports, setReports] = useState<Map<string, InventoryReport>>(new Map());
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showItemDetailModal, setShowItemDetailModal] = useState(false);
  const [selectedLineForIncident, setSelectedLineForIncident] = useState<InventoryLine | null>(null);
  const [selectedLineForDetail, setSelectedLineForDetail] = useState<InventoryLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);

  // Inicializar cantidades desde inventoryLines
  // Usar line.id como clave única (no item.id) porque cada línea es independiente
  useEffect(() => {
    const initialQuantities = new Map<string, number>();
    inventoryLines.forEach((line) => {
      initialQuantities.set(line.id, line.expectedQty);
    });
    setQuantities(initialQuantities);

    // Cargar cambios y reportes existentes de la revisión
    if (review) {
      const changesMap = new Map<string, InventoryReviewItemChange>();
      review.itemChanges.forEach((change) => {
        const lineId =
          change.inventoryLineId && inventoryLines.some((l) => l.id === change.inventoryLineId)
            ? change.inventoryLineId
            : inventoryLines.find((l) => l.item.id === change.itemId)?.id;
        if (lineId) {
          changesMap.set(lineId, change);
          initialQuantities.set(lineId, change.quantityAfter);
        }
      });
      setChanges(changesMap);

      const reportsMap = new Map<string, InventoryReport>();
      review.reports.forEach((report) => {
        const lineId =
          report.inventoryLineId && inventoryLines.some((l) => l.id === report.inventoryLineId)
            ? report.inventoryLineId
            : inventoryLines.find((l) => l.item.id === report.itemId)?.id;
        if (lineId) {
          reportsMap.set(lineId, report);
        }
      });
      setReports(reportsMap);
    }
  }, [review, inventoryLines]);

  const handleIncidentSubmit = async (payload: InventoryIncidentPayload, reportImageFiles?: File[]) => {
    if (!selectedLineForIncident) return;
    setError(null);
    const lineId = selectedLineForIncident.id;
    const itemId = selectedLineForIncident.item.id;

    startTransition(async () => {
      try {
        let effectiveReviewId = review?.id ?? "";
        if (!review) {
          const fd = new FormData();
          fd.set("cleaningId", cleaningId);
          const result = await createOrUpdateInventoryReview(fd);
          effectiveReviewId = result.id;
          setReview({ id: result.id, status: result.status as InventoryReviewStatus, itemChanges: [], reports: [] });
        }

        if (payload.deleteReport) {
          const existingReport = reports.get(lineId);
          if (existingReport?.id) {
            await deleteInventoryReport(existingReport.id);
            const newReports = new Map(reports);
            newReports.delete(lineId);
            setReports(newReports);
          }
        }

        if (payload.quantityChange) {
          const { quantityAfter, reason, reasonOtherText, note } = payload.quantityChange;
          const fd = new FormData();
          fd.set("reviewId", effectiveReviewId);
          fd.set("itemId", itemId);
          fd.set("inventoryLineId", lineId);
          fd.set("quantityAfter", quantityAfter.toString());
          fd.set("reason", reason);
          if (reasonOtherText) fd.set("reasonOtherText", reasonOtherText);
          if (note) fd.set("note", note);
          const changeResult = await createOrUpdateInventoryChange(fd);
          const newQuantities = new Map(quantities);
          newQuantities.set(lineId, quantityAfter);
          setQuantities(newQuantities);
          if ("deleted" in changeResult && changeResult.deleted) {
            const newChanges = new Map(changes);
            newChanges.delete(lineId);
            setChanges(newChanges);
          } else if ("id" in changeResult && changeResult.id) {
            const newChanges = new Map(changes);
            newChanges.set(lineId, {
              id: changeResult.id,
              itemId,
              inventoryLineId: lineId,
              quantityBefore: changeResult.quantityBefore,
              quantityAfter: changeResult.quantityAfter,
              reason: payload.quantityChange.reason,
              reasonOtherText: payload.quantityChange.reasonOtherText,
              note: payload.quantityChange.note,
              status: "PENDING",
            });
            setChanges(newChanges);
          }
        }

        if (payload.report) {
          const { type, severity, description } = payload.report;
          const fd = new FormData();
          fd.set("reviewId", effectiveReviewId);
          fd.set("cleaningId", cleaningId);
          fd.set("itemId", itemId);
          fd.set("inventoryLineId", lineId);
          fd.set("type", type);
          fd.set("severity", severity);
          if (description) fd.set("description", description);
          const existingReport = reports.get(lineId);
          if (existingReport?.id) fd.set("reportId", existingReport.id);
          const reportResult = await createInventoryReport(fd);
          if (reportImageFiles?.length) {
            for (const file of reportImageFiles) {
              const evFd = new FormData();
              evFd.set("reportId", reportResult.id);
              evFd.set("file", file);
              await uploadInventoryReportEvidence(evFd);
            }
          }
          const newReports = new Map(reports);
          newReports.set(lineId, {
            id: reportResult.id,
            itemId,
            inventoryLineId: lineId,
            type,
            severity,
            description: payload.report.description,
            status: reportResult.status,
          });
          setReports(newReports);
        }

        setShowIncidentModal(false);
        setSelectedLineForIncident(null);
      } catch (err: any) {
        setError(err.message || "Error al guardar");
        console.error("[InventoryReview] Error:", err);
      }
    });
  };

  const handleDeleteReport = async (reportId: string, lineId: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await deleteInventoryReport(reportId);

        const newReports = new Map(reports);
        newReports.delete(lineId);
        setReports(newReports);

        setShowIncidentModal(false);
        setSelectedLineForIncident(null);
      } catch (err: any) {
        setError(err.message || "Error al eliminar el reporte");
      }
    });
  };

  const handleSubmitReview = async () => {
    setError(null);
    startTransition(async () => {
      try {
        if (!review) {
          throw new Error("No se puede enviar una revisión que no existe");
        }

        const formData = new FormData();
        formData.set("reviewId", review.id);

        await submitInventoryReview(formData);

        // Redirigir a la página de detalle de limpieza o a returnTo si está definido
        const redirectPath = returnTo || `/host/cleanings/${cleaningId}`;
        router.push(redirectPath);
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Error al enviar la revisión");
      }
    });
  };

  const handleEverythingOk = async () => {
    setError(null);
    startTransition(async () => {
      try {
        // Crear revisión si no existe
        if (!review) {
          const formData = new FormData();
          formData.set("cleaningId", cleaningId);
          const result = await createOrUpdateInventoryReview(formData);
          setReview({ id: result.id, status: result.status as InventoryReviewStatus, itemChanges: [], reports: [] });
        }

        // Enviar directamente
        const formData = new FormData();
        formData.set("reviewId", review?.id || "");
        await submitInventoryReview(formData);

        // Redirigir a la página de detalle de limpieza o a returnTo si está definido
        const redirectPath = returnTo || `/host/cleanings/${cleaningId}`;
        router.push(redirectPath);
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Error al enviar la revisión");
      }
    });
  };

  // Filtrar items según búsqueda y filtros
  const filteredLines = inventoryLines.filter((line) => {
    if (searchTerm && !line.item.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (showOnlyChanges) {
      const hasChange = changes.has(line.id);
      const hasReport = reports.has(line.id);
      return hasChange || hasReport;
    }
    return true;
  });

  const hasChanges = changes.size > 0 || reports.size > 0;
  const isSubmitted = review?.status === InventoryReviewStatus.SUBMITTED;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">Revisión de inventario</h1>
            <button
              onClick={() => router.back()}
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Volver
            </button>
          </div>
          <p className="text-sm text-neutral-600 mb-4">
            {isSubmitted
              ? "El inventario ha sido enviado. Esta vista es de solo lectura."
              : "Si todo está correcto, presiona \"Todo en orden\". Si detectas cambios, ajusta cantidades o reporta."}
          </p>

          {/* Filtros y búsqueda */}
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              placeholder="Buscar item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isSubmitted}
              className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm disabled:bg-neutral-100 disabled:cursor-not-allowed"
            />
            <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyChanges}
                onChange={(e) => setShowOnlyChanges(e.target.checked)}
                disabled={isSubmitted}
                className="rounded disabled:cursor-not-allowed"
              />
              Solo cambios
            </label>
          </div>

          {/* Botón principal */}
          <div className="flex gap-3">
            <button
              onClick={handleEverythingOk}
              disabled={isPending || isSubmitted}
              className="px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Todo en orden
            </button>
            {hasChanges && !isSubmitted && (
              <button
                onClick={handleSubmitReview}
                disabled={isPending}
                className="px-4 py-2 bg-neutral-900 text-white rounded-lg font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Enviar revisión
              </button>
            )}
          </div>

          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {isSubmitted && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              ✓ Inventario enviado. La edición está bloqueada para mantener la auditoría.
            </div>
          )}
        </div>
      </div>

      {/* Lista de items */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="space-y-3">
          {filteredLines.map((line) => {
            const lineId = line.id;
            const currentQuantity = quantities.get(lineId) || line.expectedQty;
            const change = changes.get(lineId);
            const report = reports.get(lineId);

            return (
              <InventoryReviewItemRow
                key={line.id}
                line={line}
                currentQuantity={currentQuantity}
                originalQuantity={line.expectedQty}
                change={change}
                report={report}
                onReportClick={() => {
                  if (isSubmitted) return;
                  setSelectedLineForIncident(line);
                  setShowIncidentModal(true);
                }}
                onItemClick={() => {
                  setSelectedLineForDetail(line);
                  setShowItemDetailModal(true);
                }}
                disabled={isSubmitted}
              />
            );
          })}
        </div>

        {filteredLines.length === 0 && (
          <div className="text-center py-12 text-neutral-500">
            {searchTerm || showOnlyChanges
              ? "No se encontraron items con los filtros aplicados"
              : "No hay items de inventario"}
          </div>
        )}
      </div>

      {/* Modales */}
      {showIncidentModal && selectedLineForIncident && (
        <InventoryIncidentModal
          isOpen={showIncidentModal}
          line={selectedLineForIncident}
          quantityBefore={quantities.get(selectedLineForIncident.id) ?? selectedLineForIncident.expectedQty}
          existingChange={changes.get(selectedLineForIncident.id)}
          existingReport={reports.get(selectedLineForIncident.id)}
          onClose={() => {
            setShowIncidentModal(false);
            setSelectedLineForIncident(null);
          }}
          onSubmit={handleIncidentSubmit}
          onDeleteReport={
            reports.get(selectedLineForIncident.id)?.id
              ? () => handleDeleteReport(reports.get(selectedLineForIncident.id!)!.id!, selectedLineForIncident.id)
              : undefined
          }
          isSubmitting={isPending}
          submitError={error}
        />
      )}

      {showItemDetailModal && selectedLineForDetail && (() => {
        const lineReport = reports.get(selectedLineForDetail.id);
        return (
          <InventoryItemDetailModal
            line={selectedLineForDetail}
            currentQuantity={quantities.get(selectedLineForDetail.id) || selectedLineForDetail.expectedQty}
            originalQuantity={selectedLineForDetail.expectedQty}
            report={lineReport}
            onClose={() => {
              setShowItemDetailModal(false);
              setSelectedLineForDetail(null);
            }}
            onReportClick={() => {
              setShowItemDetailModal(false);
              setSelectedLineForIncident(selectedLineForDetail);
              setShowIncidentModal(true);
              setSelectedLineForDetail(null);
            }}
            onDeleteReport={lineReport?.id ? () => {
              handleDeleteReport(lineReport.id, selectedLineForDetail.id);
              setShowItemDetailModal(false);
              setSelectedLineForDetail(null);
            } : undefined}
            disabled={isSubmitted}
          />
        );
      })()}
    </div>
  );
}

