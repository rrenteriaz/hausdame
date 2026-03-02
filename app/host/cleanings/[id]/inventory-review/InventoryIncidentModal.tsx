"use client";

import { useState, useEffect } from "react";
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

interface InventoryReport {
  id: string;
  type: InventoryReportType;
  severity: InventoryReportSeverity;
  description: string | null;
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
  onSubmit: (payload: InventoryIncidentPayload) => void;
  onDeleteReport?: () => void;
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

  useEffect(() => {
    if (isOpen) {
      setQuantityAfter(existingChange?.quantityAfter ?? quantityBefore);
      setSelectedReason(existingChange?.reason || null);
      setReasonOtherText(existingChange?.reasonOtherText || "");
      setNote(existingChange?.note || "");
      setSelectedType(existingReport?.type || null);
      setSelectedSeverity(existingReport?.severity || "INFO");
      setDescription(existingReport?.description || "");
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

    onSubmit(payload);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <div
          className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-200 sticky top-0 bg-white">
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

          {/* Content */}
          <div className="px-6 py-4 space-y-6">
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

          {/* Footer */}
          <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
            <div>
              {existingReport && onDeleteReport && (
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
                className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={(e) => handleSubmit(e)}
                disabled={!canSubmit}
                className="px-4 py-2 text-sm font-medium bg-black text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {existingChange || existingReport ? "Guardar cambios" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
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
    </>
  );
}
