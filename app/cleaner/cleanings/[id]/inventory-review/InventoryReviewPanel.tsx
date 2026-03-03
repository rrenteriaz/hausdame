"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
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
import InventoryReviewItemRow from "@/app/host/cleanings/[id]/inventory-review/InventoryReviewItemRow";
import InventoryReviewReportRow from "@/app/host/cleanings/[id]/inventory-review/InventoryReviewReportRow";
import InventoryIncidentModal, { InventoryIncidentPayload } from "@/app/host/cleanings/[id]/inventory-review/InventoryIncidentModal";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import InventoryItemDetailModal from "@/app/host/cleanings/[id]/inventory-review/InventoryItemDetailModal";
import InventoryItemDetailModalReport from "@/app/host/cleanings/[id]/inventory-review/InventoryItemDetailModalReport";

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

interface InventoryReviewPanelProps {
  cleaningId: string;
  propertyId: string;
  initialReview: InventoryReview | null;
  inventoryLines: InventoryLine[];
  returnTo?: string;
  mode?: "embedded" | "page" | "report";
  onSubmitted?: () => void; // Callback cuando se envía exitosamente (para modo embedded)
}

export default function InventoryReviewPanel({
  cleaningId,
  propertyId,
  initialReview,
  inventoryLines,
  returnTo,
  mode = "embedded",
  onSubmitted,
}: InventoryReviewPanelProps) {
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
  const [isIncidentSubmitting, setIsIncidentSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);

  // Inicializar cantidades desde inventoryLines
  useEffect(() => {
    const initialQuantities = new Map<string, number>();
    inventoryLines.forEach((line) => {
      initialQuantities.set(line.id, line.expectedQty);
    });
    setQuantities(initialQuantities);

    // Cargar cambios y reportes existentes: usar inventoryLineId si existe, sino fallback por itemId (legacy)
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

  const handleIncidentSubmit = useCallback(async (payload: InventoryIncidentPayload, reportImageFiles?: File[]) => {
    if (!selectedLineForIncident) return;
    setError(null);
    setIsIncidentSubmitting(true);
    const lineId = selectedLineForIncident.id;
    const itemId = selectedLineForIncident.item.id;

    try {
      let effectiveReviewId = review?.id ?? "";
      if (!review) {
        const fd = new FormData();
        fd.set("callerContext", "cleaner");
        fd.set("cleaningId", cleaningId);
        const result = await createOrUpdateInventoryReview(fd);
        effectiveReviewId = result.id;
        setReview({ id: result.id, status: result.status as InventoryReviewStatus, itemChanges: [], reports: [] });
      }

      if (payload.deleteReport) {
        const existingReport = reports.get(lineId);
        if (existingReport?.id) {
          await deleteInventoryReport(existingReport.id, { callerContext: "cleaner" });
          const newReports = new Map(reports);
          newReports.delete(lineId);
          setReports(newReports);
        }
      }

      if (payload.quantityChange) {
        const { quantityAfter, reason, reasonOtherText, note } = payload.quantityChange;
        const fd = new FormData();
        fd.set("callerContext", "cleaner");
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
            reason,
            reasonOtherText,
            note,
            status: "PENDING",
          });
          setChanges(newChanges);
        }
      }

      if (payload.report) {
        const { type, severity, description } = payload.report;
        const fd = new FormData();
        fd.set("callerContext", "cleaner");
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
            evFd.set("callerContext", "cleaner");
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
      if (mode === "embedded") router.refresh();
    } catch (err: any) {
      setError(err.message || "Error al guardar");
      console.error("[InventoryReview] Error:", err);
    } finally {
      setIsIncidentSubmitting(false);
    }
  }, [
    selectedLineForIncident,
    review,
    reports,
    quantities,
    changes,
    cleaningId,
    mode,
    router,
  ]);

  const handleDeleteReport = useCallback(async (reportId: string, lineId: string) => {
    setError(null);
    setIsIncidentSubmitting(true);
    try {
      await deleteInventoryReport(reportId, { callerContext: "cleaner" });

      const newReports = new Map(reports);
      newReports.delete(lineId);
      setReports(newReports);

      setShowIncidentModal(false);
      setSelectedLineForIncident(null);
    } catch (err: any) {
      setError(err.message || "Error al eliminar el reporte");
    } finally {
      setIsIncidentSubmitting(false);
    }
  }, [reports]);

  const handleSubmitReview = async () => {
    setError(null);
    startTransition(async () => {
      try {
        if (!review) {
          throw new Error("No se puede enviar una revisión que no existe");
        }

        const formData = new FormData();
        formData.set("callerContext", "cleaner");
        formData.set("reviewId", review.id);

        await submitInventoryReview(formData);
        
        // Actualizar estado local
        setReview({ ...review, status: InventoryReviewStatus.SUBMITTED });

        if (mode === "embedded") {
          // En modo embedded, solo refrescar y llamar callback
          router.refresh();
          onSubmitted?.();
        } else {
          // En modo page, volver siempre al detalle de la limpieza (no a Hoy/returnTo)
          router.push(`/cleaner/cleanings/${cleaningId}`);
          router.refresh();
        }
      } catch (err: any) {
        setError(err.message || "Error al enviar la revisión");
      }
    });
  };

  const handleEverythingOk = async () => {
    setError(null);
    startTransition(async () => {
      try {
        let effectiveReview = review;
        if (!review) {
          const formData = new FormData();
          formData.set("callerContext", "cleaner");
          formData.set("cleaningId", cleaningId);
          const result = await createOrUpdateInventoryReview(formData);
          effectiveReview = { id: result.id, status: result.status as InventoryReviewStatus, itemChanges: [], reports: [] };
          setReview(effectiveReview);
        }

        const formData = new FormData();
        formData.set("callerContext", "cleaner");
        formData.set("reviewId", effectiveReview!.id);
        await submitInventoryReview(formData);
        
        setReview((prev) => (prev ? { ...prev, status: InventoryReviewStatus.SUBMITTED } : prev));

        if (mode === "embedded") {
          router.refresh();
          onSubmitted?.();
        } else {
          // Volver siempre al detalle de la limpieza (no a Hoy/returnTo)
          router.push(`/cleaner/cleanings/${cleaningId}`);
          router.refresh();
        }
      } catch (err: any) {
        setError(err.message || "Error al enviar la revisión");
      }
    });
  };

  const filteredLines = inventoryLines.filter((line) => {
    if (searchTerm && !line.item.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    // En modo report, también permitir filtrar por cambios
    if (showOnlyChanges) {
      const hasChange = changes.has(line.id);
      const hasReport = reports.has(line.id);
      return hasChange || hasReport;
    }
    return true;
  });

  const hasChanges = changes.size > 0 || reports.size > 0;
  const isSubmitted = review?.status === InventoryReviewStatus.SUBMITTED;
  const isReportMode = mode === "report";

  const isEmbedded = mode === "embedded" || mode === "report";
  const containerClass = isEmbedded ? "space-y-3" : "min-h-screen bg-neutral-50";
  const headerClass = isEmbedded ? "space-y-2" : "bg-white border-b sticky top-0 z-10";
  const contentClass = isEmbedded ? "space-y-3" : "max-w-4xl mx-auto px-4 py-6";
  const paddingClass = isEmbedded ? "" : "px-4 py-4";

  return (
    <div className={containerClass}>
      {/* Header - Solo en modo page */}
      {!isEmbedded && (
        <div className={headerClass}>
          <div className={`max-w-4xl mx-auto ${paddingClass}`}>
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
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <div className={isEmbedded ? "" : contentClass}>
        <div className={isEmbedded ? "space-y-3" : ""}>
          {/* Estado enviado - Solo en modo embedded */}
          {isEmbedded && isSubmitted && (
            <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              ✓ Inventario enviado
            </div>
          )}

          {/* Filtros y búsqueda - Ocultar en modo report */}
          {!isReportMode && (
            <>
              <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 ${isEmbedded ? "mb-2" : "mb-4"}`}>
                <input
                  type="text"
                  placeholder="Buscar item..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={isSubmitted}
                  className={`flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm disabled:bg-neutral-100 disabled:cursor-not-allowed ${isEmbedded ? "text-xs" : ""}`}
                />
                <label className={`flex items-center gap-2 text-sm text-neutral-700 cursor-pointer whitespace-nowrap ${isEmbedded ? "text-xs" : ""}`}>
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

              {/* Botones principales - Ocultar si está SUBMITTED o en modo report */}
              {!isSubmitted && (
                <div className="flex gap-3">
                  {!hasChanges ? (
                    <button
                      onClick={handleEverythingOk}
                      disabled={isPending}
                      id={isEmbedded ? "submit-inventory-btn" : undefined}
                      className={`px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed ${isEmbedded ? "text-sm" : ""}`}
                    >
                      Todo en orden
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleEverythingOk}
                        disabled={isPending}
                        className={`px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed ${isEmbedded ? "text-sm" : ""}`}
                      >
                        Todo en orden
                      </button>
                      <button
                        onClick={handleSubmitReview}
                        disabled={isPending}
                        id={isEmbedded ? "submit-inventory-btn" : undefined}
                        className={`px-4 py-2 bg-neutral-900 text-white rounded-lg font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed ${isEmbedded ? "text-sm" : ""}`}
                      >
                        Enviar revisión
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <div className={`p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 ${isEmbedded ? "text-xs" : ""}`}>
              {error}
            </div>
          )}

          {!isEmbedded && isSubmitted && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              ✓ Inventario enviado. La edición está bloqueada para mantener la auditoría.
            </div>
          )}

          {/* Lista de items agrupados por área */}
          <div className={isEmbedded ? "space-y-3" : "space-y-4"}>
            {(() => {
              const linesByArea = new Map<string, InventoryLine[]>();
              for (const line of filteredLines) {
                const area = (line.area || "Sin área").trim();
                if (!linesByArea.has(area)) {
                  linesByArea.set(area, []);
                }
                linesByArea.get(area)!.push(line);
              }
              const sortedAreas = Array.from(linesByArea.keys()).sort((a, b) =>
                a.localeCompare(b, "es", { sensitivity: "base" })
              );

              return sortedAreas.map((area) => {
                const areaLines = linesByArea.get(area)!;
                return (
                  <CollapsibleSection
                    key={area}
                    title={area}
                    count={areaLines.length}
                    defaultOpen={sortedAreas.length <= 3}
                  >
                    <div className={isEmbedded ? "space-y-2 pt-1" : "space-y-2 pt-2"}>
                      {areaLines.map((line) => {
                        const lineId = line.id;
                        const currentQuantity = quantities.get(lineId) || line.expectedQty;
                        const change = changes.get(lineId);
                        const report = reports.get(lineId);

                        if (isReportMode) {
                          const verifiedQuantity = change ? change.quantityAfter : line.expectedQty;
                          return (
                            <InventoryReviewReportRow
                              key={line.id}
                              line={line}
                              originalQuantity={line.expectedQty}
                              verifiedQuantity={verifiedQuantity}
                              change={change}
                              report={report}
                              onItemClick={() => {
                                setSelectedLineForDetail(line);
                                setShowItemDetailModal(true);
                              }}
                            />
                          );
                        }

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
                              setError(null);
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
                  </CollapsibleSection>
                );
              });
            })()}
          </div>

          {filteredLines.length === 0 && (
            <div className={`text-center py-12 text-neutral-500 ${isEmbedded ? "py-6 text-sm" : ""}`}>
              {searchTerm || showOnlyChanges
                ? "No se encontraron items con los filtros aplicados"
                : "No hay items de inventario"}
            </div>
          )}
        </div>
      </div>

      {/* Modal unificado de incidencia */}
      {showIncidentModal && selectedLineForIncident && (
        <InventoryIncidentModal
          isOpen={showIncidentModal}
          line={selectedLineForIncident}
          quantityBefore={quantities.get(selectedLineForIncident.id) || selectedLineForIncident.expectedQty}
          existingChange={changes.get(selectedLineForIncident.id)}
          existingReport={reports.get(selectedLineForIncident.id)}
          onClose={() => {
            setShowIncidentModal(false);
            setSelectedLineForIncident(null);
          }}
          onSubmit={handleIncidentSubmit}
          onDeleteReport={
            reports.get(selectedLineForIncident.id)?.id
              ? () =>
                  handleDeleteReport(reports.get(selectedLineForIncident!.id)!.id, selectedLineForIncident.id)
              : undefined
          }
          isSubmitting={isIncidentSubmitting}
          submitError={error}
        />
      )}

      {showItemDetailModal && selectedLineForDetail && (() => {
        const lineReport = reports.get(selectedLineForDetail.id);
        const lineChange = changes.get(selectedLineForDetail.id);
        
        // En modo report, usar el modal de solo lectura
        if (isReportMode) {
          const verifiedQuantity = lineChange ? lineChange.quantityAfter : selectedLineForDetail.expectedQty;
          return (
            <InventoryItemDetailModalReport
              line={selectedLineForDetail}
              originalQuantity={selectedLineForDetail.expectedQty}
              verifiedQuantity={verifiedQuantity}
              change={lineChange}
              report={lineReport}
              onClose={() => {
                setShowItemDetailModal(false);
                setSelectedLineForDetail(null);
              }}
            />
          );
        }

        // Modo editable
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
              setError(null);
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

