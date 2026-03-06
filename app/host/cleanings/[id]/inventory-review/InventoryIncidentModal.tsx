"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  InventoryChangeReason,
  InventoryReportType,
  InventoryReportSeverity,
} from "@prisma/client";
import { changeReasonLabel, reportTypeLabel, reportSeverityLabel } from "@/lib/inventory-i18n";
import ConfirmDeleteReportModal from "./ConfirmDeleteReportModal";

interface InventoryLine {
  id: string;
  area?: string;
  item: { id: string; name: string };
}

interface InventoryReviewItemChange {
  id: string;
  quantityBefore: number;
  quantityAfter: number;
  reason: InventoryChangeReason;
  reasonOtherText: string | null;
  note: string | null;
}

interface InventoryReportEvidence {
  id: string;
  asset?: { id: string; publicUrl: string | null } | null;
}

interface InventoryReport {
  id: string;
  type: InventoryReportType;
  severity: InventoryReportSeverity;
  description: string | null;
  evidence?: InventoryReportEvidence[];
}

export interface InventoryIncidentPayload {
  quantityChange?: {
    quantityAfter: number;
    reason: InventoryChangeReason;
    reasonOtherText: string | null;
    note: string | null;
  };
  report?: {
    type: InventoryReportType;
    severity: InventoryReportSeverity;
    description: string | null;
  };
  /** true cuando el usuario deseleccionó el tipo (tenía reporte y ahora no) */
  deleteReport?: boolean;
}

interface InventoryIncidentModalProps {
  isOpen: boolean;
  line: InventoryLine;
  quantityBefore: number;
  existingChange?: InventoryReviewItemChange | null;
  existingReport?: InventoryReport | null;
  onClose: () => void;
  /** Segundo parámetro opcional: archivos de imagen para el reporte */
  onSubmit: (payload: InventoryIncidentPayload, reportImageFiles?: File[]) => void;
  onDeleteReport?: () => void;
  /** Muestra "Enviando..." y deshabilita el botón durante el submit */
  isSubmitting?: boolean;
  /** Error del último submit; se muestra dentro del modal */
  submitError?: string | null;
}

const REASON_OPTIONS: { value: InventoryChangeReason; label: string }[] = [
  { value: "ROUTINE_COUNT", label: "Conteo de rutina" },
  { value: "PREVIOUS_ERROR", label: "Error previo" },
  { value: "DAMAGED", label: "Se rompió / dañó" },
  { value: "REPLACED", label: "Se reemplazó" },
  { value: "LOST", label: "Se extravió" },
  { value: "MOVED", label: "Se movió" },
  { value: "OTHER", label: "Otro" },
];

const REPORT_TYPE_OPTIONS: { value: InventoryReportType; label: string }[] = [
  { value: "DAMAGED_WORKS", label: reportTypeLabel("DAMAGED_WORKS") },
  { value: "DAMAGED_NOT_WORKING", label: reportTypeLabel("DAMAGED_NOT_WORKING") },
  { value: "MISSING_PHYSICAL", label: reportTypeLabel("MISSING_PHYSICAL") },
  { value: "REPLACED_DIFFERENT", label: reportTypeLabel("REPLACED_DIFFERENT") },
  { value: "DETAILS_MISMATCH", label: reportTypeLabel("DETAILS_MISMATCH") },
  { value: "OTHER", label: reportTypeLabel("OTHER") },
];

const SEVERITY_OPTIONS: { value: InventoryReportSeverity; label: string }[] = [
  { value: "URGENT", label: reportSeverityLabel("URGENT") },
  { value: "IMPORTANT", label: reportSeverityLabel("IMPORTANT") },
  { value: "INFO", label: reportSeverityLabel("INFO") },
];

export default function InventoryIncidentModal({
  isOpen,
  line,
  quantityBefore,
  existingChange,
  existingReport,
  onClose,
  onSubmit,
  onDeleteReport,
  isSubmitting = false,
  submitError = null,
}: InventoryIncidentModalProps) {
  const [quantityAfter, setQuantityAfter] = useState(quantityBefore);
  const [selectedReason, setSelectedReason] = useState<InventoryChangeReason | null>(
    existingChange?.reason || null
  );
  const [reasonOtherText, setReasonOtherText] = useState(existingChange?.reasonOtherText || "");
  const [note, setNote] = useState(existingChange?.note || "");
  const [selectedType, setSelectedType] = useState<InventoryReportType | null>(
    existingReport?.type || null
  );
  const [selectedSeverity, setSelectedSeverity] = useState<InventoryReportSeverity>(
    existingReport?.severity || "INFO"
  );
  const [description, setDescription] = useState(existingReport?.description || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPhotoChoiceModal, setShowPhotoChoiceModal] = useState(false);
  const [reportImages, setReportImages] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const MAX_REPORT_IMAGES = 5;

  const existingImages =
    existingReport?.evidence?.filter((e) => e?.asset?.publicUrl).map((e) => ({
      id: e.id,
      url: e.asset!.publicUrl!,
    })) ?? [];
  const maxNewImages = Math.max(0, MAX_REPORT_IMAGES - existingImages.length);

  const addReportImage = useCallback((file: File, previewUrl: string) => {
    setReportImages((prev) => {
      if (prev.length >= maxNewImages) return prev;
      return [...prev, { file, previewUrl }];
    });
  }, [maxNewImages]);

  const removeReportImage = useCallback((index: number) => {
    setReportImages((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }, []);

  const handlePhotoFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const previewUrl = URL.createObjectURL(file);
      addReportImage(file, previewUrl);
      e.target.value = "";
    },
    [addReportImage]
  );

  const openCamera = useCallback(() => {
    setShowPhotoChoiceModal(false);
    cameraInputRef.current?.click();
  }, []);

  const openGallery = useCallback(() => {
    setShowPhotoChoiceModal(false);
    galleryInputRef.current?.click();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuantityAfter(existingChange?.quantityAfter ?? quantityBefore);
      setSelectedReason(existingChange?.reason || null);
      setReasonOtherText(existingChange?.reasonOtherText || "");
      setNote(existingChange?.note || "");
      setSelectedType(existingReport?.type || null);
      setSelectedSeverity(existingReport?.severity || "INFO");
      setDescription(existingReport?.description || "");
      setReportImages([]);
      setShowPhotoChoiceModal(false);
    }
  }, [isOpen, existingChange, existingReport, quantityBefore]);

  if (!isOpen) return null;

  const hasQuantityChange = quantityAfter !== quantityBefore;
  const needsReasonForQuantity = hasQuantityChange && !selectedReason;
  const needsReasonOther = hasQuantityChange && selectedReason === "OTHER" && !reasonOtherText.trim();
  const hasReport = !!selectedType;

  const canSubmitQuantity =
    !hasQuantityChange || (selectedReason && (selectedReason !== "OTHER" || reasonOtherText.trim()));
  const wantsToDeleteReport = !!existingReport && !selectedType;
  const canSubmit =
    canSubmitQuantity && (hasQuantityChange || hasReport || wantsToDeleteReport);

  const handleSubmit = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    if (hasQuantityChange) {
      if (!selectedReason) {
        alert("Debes seleccionar una razón para el cambio de cantidad");
        return;
      }
      if (selectedReason === "OTHER" && !reasonOtherText.trim()) {
        alert("Debes especificar la razón cuando seleccionas 'Otro'");
        return;
      }
      if (note.length > 200) {
        alert("La nota no puede tener más de 200 caracteres");
        return;
      }
    }

    if (hasReport && !selectedType) {
      alert("Debes seleccionar un tipo de incidencia");
      return;
    }

    if (!hasQuantityChange && !hasReport && !wantsToDeleteReport) {
      onClose();
      return;
    }

    const payload: InventoryIncidentPayload = {};
    if (hasQuantityChange && selectedReason) {
      payload.quantityChange = {
        quantityAfter,
        reason: selectedReason,
        reasonOtherText: selectedReason === "OTHER" ? reasonOtherText.trim() : null,
        note: note.trim() || null,
      };
    } else if (existingChange && quantityAfter === quantityBefore) {
      payload.quantityChange = {
        quantityAfter,
        reason: existingChange.reason,
        reasonOtherText: existingChange.reasonOtherText,
        note: existingChange.note,
      };
    }
    if (hasReport && selectedType) {
      payload.report = {
        type: selectedType,
        severity: selectedSeverity,
        description: description.trim() || null,
      };
    }
    if (wantsToDeleteReport) payload.deleteReport = true;

    const imageFiles = hasReport && reportImages.length > 0
      ? reportImages.map(({ file }) => file)
      : undefined;

    onSubmit(payload, imageFiles);
  };

  const modalContent = (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 pb-24 sm:pb-4"
        onClick={onClose}
      >
        <form
          id="incident-modal-form"
          className="relative bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[calc(100dvh-8rem)] sm:max-h-[90vh] flex flex-col min-h-0"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSubmit(e as unknown as React.MouseEvent);
          }}
        >
          {/* Header - fijo arriba */}
          <div className="flex-shrink-0 px-6 py-4 border-b border-neutral-200 bg-white">
            <h2 className="text-lg font-semibold text-neutral-900">
              {existingChange || existingReport ? "Ver / Editar incidencia" : "Reportar incidencia"}
            </h2>
            <p className="text-sm text-neutral-600 mt-1">{line.item.name}</p>
            {(existingChange || existingReport) && (
              <p className="text-xs text-neutral-500 mt-1">
                {line.area && `Área: ${line.area}`}
              </p>
            )}
          </div>

          {/* Content - área con scroll, footer siempre visible */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4 space-y-6">
            {/* Sección: Cambio de cantidad */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-neutral-700">Cantidad verificada</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantityAfter(Math.max(0, quantityAfter - 1))}
                  className="w-10 h-10 rounded border border-neutral-300 flex items-center justify-center hover:bg-neutral-50"
                >
                  −
                </button>
                <input
                  type="number"
                  value={quantityAfter}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 0) setQuantityAfter(val);
                  }}
                  className="w-20 text-center border border-neutral-300 rounded px-3 py-2"
                  min="0"
                />
                <button
                  type="button"
                  onClick={() => setQuantityAfter(quantityAfter + 1)}
                  className="w-10 h-10 rounded border border-neutral-300 flex items-center justify-center hover:bg-neutral-50"
                >
                  +
                </button>
                <span className="text-sm text-neutral-500">(antes: {quantityBefore})</span>
              </div>

              {quantityAfter !== quantityBefore && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Razón del cambio <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {REASON_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSelectedReason(option.value)}
                          className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                            selectedReason === option.value
                              ? "bg-neutral-900 text-white border-neutral-900"
                              : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {selectedReason === "OTHER" && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Especifica la razón <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={reasonOtherText}
                        onChange={(e) => setReasonOtherText(e.target.value)}
                        placeholder="Describe la razón del cambio..."
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Nota (opcional, máx. 200 caracteres)
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Agrega una nota adicional..."
                      maxLength={200}
                      rows={2}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg resize-none"
                    />
                    <p className="text-xs text-neutral-500 mt-1">{note.length}/200</p>
                  </div>
                </>
              )}
            </div>

            {/* Sección: Reporte de incidencia */}
            <div className="space-y-4 border-t border-neutral-200 pt-4">
              <h3 className="text-sm font-medium text-neutral-700">Incidencia (opcional)</h3>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Tipo de incidencia
                </label>
                <div className="flex flex-wrap gap-2">
                  {REPORT_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedType(selectedType === option.value ? null : option.value)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                        selectedType === option.value
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {selectedType && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Severidad
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {SEVERITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSelectedSeverity(option.value)}
                          className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                            selectedSeverity === option.value
                              ? "bg-neutral-900 text-white border-neutral-900"
                              : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Foto: destacada, antes de la descripción, indispensable para el Host */}
                  <div>
                    {(() => {
                      const totalImages = existingImages.length + reportImages.length;
                      return (
                        <>
                          <label className="block text-sm font-medium text-neutral-700 mb-2">
                            Foto o imagen {totalImages > 0 && `(${totalImages}/${MAX_REPORT_IMAGES})`}
                          </label>
                          <div className="flex flex-wrap gap-3 items-start">
                            {/* Imágenes ya guardadas (solo visualización) */}
                            {existingImages.map(({ id, url }) => (
                              <div
                                key={id}
                                className="relative w-16 h-16 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50 flex-shrink-0"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt="Evidencia guardada"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                            {/* Imágenes nuevas locales (con botón quitar) */}
                            {reportImages.map(({ previewUrl }, idx) => (
                              <div
                                key={`new-${idx}`}
                                className="relative w-16 h-16 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50 flex-shrink-0"
                              >
                                <Image
                                  src={previewUrl}
                                  alt={`Evidencia nueva ${idx + 1}`}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                                <button
                                  type="button"
                                  onClick={() => removeReportImage(idx)}
                                  className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-xs hover:bg-black/80"
                                  aria-label="Quitar foto"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {totalImages < MAX_REPORT_IMAGES && (
                        <>
                          <input
                            ref={cameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handlePhotoFileSelect}
                            className="hidden"
                            aria-hidden
                          />
                          <input
                            ref={galleryInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoFileSelect}
                            className="hidden"
                            aria-hidden
                          />
                          <button
                            type="button"
                            onClick={() => setShowPhotoChoiceModal(true)}
                            className="flex-1 min-w-[140px] sm:min-w-[200px] w-full h-24 sm:h-14 rounded-lg border-2 border-dashed border-neutral-300 flex flex-row items-center justify-center gap-3 text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50 transition-colors cursor-pointer py-4 sm:py-3 px-4"
                          >
                            <svg className="w-8 h-8 sm:w-6 sm:h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7" />
                            </svg>
                            <span className="text-sm font-medium text-left sm:text-center sm:whitespace-nowrap">Tomar foto o subir imagen</span>
                          </button>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      Indispensable para que el Host pueda evaluar el problema. Máx. {MAX_REPORT_IMAGES} imágenes.
                    </p>
                        </>
                      );
                    })()}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Descripción (opcional)
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe la incidencia..."
                      rows={3}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg resize-none"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Error del submit - visible dentro del modal */}
          {submitError && (
            <div className="flex-shrink-0 px-6 py-3 bg-red-50 border-t border-red-100">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {/* Footer - fijo abajo, siempre visible */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-neutral-200 bg-white flex items-center justify-between">
            <div>
              {existingReport && onDeleteReport && !isSubmitting && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Eliminar reporte
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!canSubmit || isSubmitting}
                className="px-4 py-2 text-sm font-medium bg-black text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation min-w-[100px]"
              >
                {isSubmitting ? "Enviando..." : (existingChange || existingReport ? "Guardar cambios" : "Enviar")}
              </button>
            </div>
          </div>
        </form>
      </div>

      <ConfirmDeleteReportModal
        isOpen={showDeleteConfirm}
        itemName={line.item.name}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          if (onDeleteReport) onDeleteReport();
          setShowDeleteConfirm(false);
        }}
      />

      {/* Modal: Tomar foto o subir imagen */}
      {showPhotoChoiceModal && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPhotoChoiceModal(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm shadow-xl animate-in slide-in-from-bottom sm:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 pb-8 sm:pb-4">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                ¿Cómo deseas agregar la imagen?
              </h3>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={openCamera}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-neutral-200 hover:bg-neutral-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-medium text-neutral-900 block">Tomar foto</span>
                    <span className="text-sm text-neutral-500">Usar la cámara del dispositivo</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={openGallery}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-neutral-200 hover:bg-neutral-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-medium text-neutral-900 block">Subir imagen</span>
                    <span className="text-sm text-neutral-500">Elegir de la galería</span>
                  </div>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowPhotoChoiceModal(false)}
                className="w-full mt-4 py-2.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : null;
}
