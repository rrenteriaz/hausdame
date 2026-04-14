"use client";

import { useState, useTransition, useRef } from "react";
import { completeCleaningWithReasons } from "../../checklist-actions";
import { NotCompletedReasonCode } from "@/lib/types/cleaning-enums";
import { useRouter } from "next/navigation";
import InventoryRequiredModal from "./InventoryRequiredModal";
import { InventoryCardRef } from "./InventoryCard";

interface CleaningChecklistItem {
  id: string;
  title: string;
  isCompleted: boolean;
}

interface CompleteCleaningButtonProps {
  cleaningId: string;
  checklistItems: CleaningChecklistItem[];
  returnTo: string;
  inventoryCardRef?: React.RefObject<InventoryCardRef | null>;
}

const REASON_LABELS: Record<NotCompletedReasonCode, string> = {
  NO_HABIA_INSUMOS: "No había insumos",
  NO_TUVE_ACCESO: "No tuve acceso",
  SE_ROMPIO_O_FALLO: "Se rompió o falló",
  NO_HUBO_TIEMPO: "No hubo tiempo",
  OTRO: "Otro",
};

const REASON_OPTIONS: NotCompletedReasonCode[] = [
  "NO_HABIA_INSUMOS",
  "NO_TUVE_ACCESO",
  "SE_ROMPIO_O_FALLO",
  "NO_HUBO_TIEMPO",
  "OTRO",
];

// Componente picker personalizado
function ReasonPicker({
  value,
  onChange,
  hasError,
  itemTitle,
  note,
  onNoteChange,
}: {
  value: NotCompletedReasonCode | "";
  onChange: (code: NotCompletedReasonCode) => void;
  hasError: boolean;
  itemTitle: string;
  note: string;
  onNoteChange: (note: string) => void;
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState<NotCompletedReasonCode | null>(null);
  const [localNote, setLocalNote] = useState(note);

  const handleSelect = (code: NotCompletedReasonCode) => {
    if (code === "OTRO") {
      // Mostrar campo de nota
      setSelectedCode(code);
      setLocalNote(note);
    } else {
      onChange(code);
      setIsPickerOpen(false);
      setSelectedCode(null);
    }
  };

  const handleConfirmOtro = () => {
    if (selectedCode === "OTRO") {
      onChange(selectedCode);
      onNoteChange(localNote);
    }
    setIsPickerOpen(false);
    setSelectedCode(null);
  };

  const handleCancel = () => {
    setIsPickerOpen(false);
    setSelectedCode(null);
    setLocalNote(note);
  };

  return (
    <>
      {/* Botón que abre el picker */}
      <button
        type="button"
        onClick={() => setIsPickerOpen(true)}
        className={`w-full rounded-lg border px-3 py-2.5 text-base text-left flex items-center justify-between transition ${
          hasError
            ? "border-red-300 bg-red-50"
            : "border-neutral-300 bg-white"
        }`}
      >
        <span className={value ? "text-neutral-900" : "text-neutral-500"}>
          {value ? REASON_LABELS[value] : "Selecciona una razón"}
        </span>
        <span className="text-neutral-400">▼</span>
      </button>

      {/* Modal picker flotante centrado */}
      {isPickerOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={handleCancel}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 w-[75%] max-w-[300px] bg-white rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del picker */}
            <div className="p-4 border-b border-neutral-100">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-semibold text-neutral-900">
                  Selecciona una razón
                </h4>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-neutral-400 hover:text-neutral-600 transition"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                {itemTitle}
              </p>
            </div>

            {/* Vista de selección de razón */}
            {!selectedCode && (
              <div className="py-1">
                {REASON_OPTIONS.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleSelect(code)}
                    className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-neutral-50 active:bg-neutral-100 transition ${
                      value === code ? "bg-neutral-50" : ""
                    }`}
                  >
                    <span className="text-base text-neutral-800">
                      {REASON_LABELS[code]}
                    </span>
                    {value === code && (
                      <span className="text-black text-base">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Vista de captura de nota para "Otro" */}
            {selectedCode === "OTRO" && (
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1.5">
                    Describe la razón
                  </label>
                  <textarea
                    value={localNote}
                    onChange={(e) => setLocalNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 resize-none"
                    placeholder="Escribe aquí..."
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCode(null)}
                    className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition"
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmOtro}
                    disabled={!localNote.trim()}
                    className="flex-1 rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800 transition disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function CompleteCleaningButton({
  cleaningId,
  checklistItems,
  returnTo,
  inventoryCardRef,
}: CompleteCleaningButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inventoryRequiredModalOpen, setInventoryRequiredModalOpen] = useState(false);
  const [reasons, setReasons] = useState<Record<string, { code: NotCompletedReasonCode | ""; note: string }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const incompleteItems = checklistItems.filter((item) => !item.isCompleted);

  const handleComplete = () => {
    if (incompleteItems.length === 0) {
      // No hay items incompletos, completar directamente
      startTransition(async () => {
        try {
          const result = await completeCleaningWithReasons(cleaningId, []);
          if (result.requiresInventoryReview) {
            console.log("[CompleteCleaningButton] Mostrando modal de inventario requerido");
            // Mostrar modal amigable en lugar de redirigir directamente
            setInventoryRequiredModalOpen(true);
          } else if (result.success) {
            router.push(returnTo);
            router.refresh();
          }
        } catch (err: any) {
          console.error("[CompleteCleaningButton] Error al completar limpieza:", err);
          // Mostrar error en UI
          alert(err?.message || "Error al completar la limpieza");
        }
      });
    } else {
      // Hay items incompletos, abrir modal para capturar razones
      // Inicializar razones vacías para cada item
      const initialReasons: Record<string, { code: NotCompletedReasonCode | ""; note: string }> = {};
      incompleteItems.forEach((item) => {
        initialReasons[item.id] = { code: "", note: "" };
      });
      setReasons(initialReasons);
      setErrors({});
      setIsModalOpen(true);
    }
  };

  const handleReasonChange = (itemId: string, code: NotCompletedReasonCode) => {
    setReasons((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], code },
    }));
    // Limpiar error al cambiar
    if (errors[itemId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[itemId];
        return newErrors;
      });
    }
  };

  const handleNoteChange = (itemId: string, note: string) => {
    setReasons((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], note },
    }));
    // Limpiar error de nota al cambiar
    if (errors[`${itemId}-note`]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`${itemId}-note`];
        return newErrors;
      });
    }
  };

  const validateAndSubmit = () => {
    const newErrors: Record<string, string> = {};
    
    // Validar cada item
    incompleteItems.forEach((item) => {
      const reason = reasons[item.id];
      if (!reason?.code) {
        newErrors[item.id] = "Selecciona una razón";
      } else if (reason.code === "OTRO" && !reason.note?.trim()) {
        newErrors[`${item.id}-note`] = "Agrega una nota para 'Otro'";
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Todo válido, completar limpieza
    const incompleteItemsWithReasons = incompleteItems.map((item) => ({
      itemId: item.id,
      reasonCode: reasons[item.id]!.code as NotCompletedReasonCode,
      reasonNote: reasons[item.id]!.note || undefined,
    }));

    startTransition(async () => {
      try {
        const result = await completeCleaningWithReasons(cleaningId, incompleteItemsWithReasons);
        if (result.requiresInventoryReview) {
          console.log("[CompleteCleaningButton] Mostrando modal de inventario requerido");
          setIsModalOpen(false);
          // Mostrar modal amigable en lugar de redirigir directamente
          setInventoryRequiredModalOpen(true);
        } else if (result.success) {
          setIsModalOpen(false);
          router.push(returnTo);
          router.refresh();
        }
      } catch (err: any) {
        console.error("[CompleteCleaningButton] Error al completar limpieza:", err);
        // Mostrar error en UI
        alert(err?.message || "Error al completar la limpieza");
      }
    });
  };

  const completedCount = checklistItems.filter((item) => item.isCompleted).length;
  const totalCount = checklistItems.length;

  const handleGoToInventory = () => {
    // Expandir el accordion de inventario
    if (inventoryCardRef?.current) {
      inventoryCardRef.current.open();
    }

    // Hacer scroll suave a la sección de inventario
    setTimeout(() => {
      const inventorySection = document.getElementById("inventory-section");
      if (inventorySection) {
        inventorySection.scrollIntoView({ behavior: "smooth", block: "start" });
        
        // Intentar enfocar el botón de enviar después de un pequeño delay
        setTimeout(() => {
          const submitBtn = document.getElementById("submit-inventory-btn");
          if (submitBtn) {
            (submitBtn as HTMLElement).focus();
          }
        }, 500);
      } else {
        // Fallback: navegar a la ruta si no se encuentra la sección
        const inventoryUrl = `/cleaner/cleanings/${cleaningId}/inventory-review${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
        router.push(inventoryUrl);
      }
    }, 100);
  };

  return (
    <>
      <InventoryRequiredModal
        isOpen={inventoryRequiredModalOpen}
        cleaningId={cleaningId}
        onClose={() => setInventoryRequiredModalOpen(false)}
        onGoToInventory={handleGoToInventory}
      />

      <button
        type="button"
        onClick={handleComplete}
        disabled={isPending}
        className="w-full rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Completando..." : "Completar limpieza"}
      </button>

      {/* Modal para capturar razones de items incompletos */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg rounded-2xl border border-neutral-200 bg-white shadow-xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-neutral-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-neutral-900">
                  Completar limpieza
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-neutral-400 hover:text-neutral-600 transition"
                >
                  ✕
                </button>
              </div>
              <p className="text-base text-neutral-600 mt-1">
                {completedCount} de {totalCount} items completados
              </p>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3 mb-4">
                ⚠️ Hay {incompleteItems.length} item{incompleteItems.length !== 1 ? "s" : ""} sin completar. 
                Por favor indica la razón de cada uno.
              </p>

              <div className="space-y-4">
                {incompleteItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-neutral-200 p-4 space-y-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-medium text-neutral-400 bg-neutral-100 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <p className="text-base font-medium text-neutral-800">
                        {item.title}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">
                        ¿Por qué no se completó?
                      </label>
                      <ReasonPicker
                        value={reasons[item.id]?.code || ""}
                        onChange={(code) => handleReasonChange(item.id, code)}
                        hasError={!!errors[item.id]}
                        itemTitle={item.title}
                        note={reasons[item.id]?.note || ""}
                        onNoteChange={(note) => handleNoteChange(item.id, note)}
                      />
                      {errors[item.id] && (
                        <p className="text-xs text-red-500 mt-1">{errors[item.id]}</p>
                      )}
                    </div>

                    {reasons[item.id]?.code === "OTRO" && (
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1.5">
                          Describe la razón
                        </label>
                        <textarea
                          value={reasons[item.id]?.note || ""}
                          onChange={(e) => handleNoteChange(item.id, e.target.value)}
                          rows={2}
                          className={`w-full rounded-lg border px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 resize-none transition ${
                            errors[`${item.id}-note`]
                              ? "border-red-300 bg-red-50"
                              : "border-neutral-300 bg-white"
                          }`}
                          placeholder="Describe por qué no se completó..."
                        />
                        {errors[`${item.id}-note`] && (
                          <p className="text-xs text-red-500 mt-1">{errors[`${item.id}-note`]}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-neutral-100 flex gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={validateAndSubmit}
                disabled={isPending}
                className="flex-1 rounded-lg bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Completando..." : "Confirmar y completar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
