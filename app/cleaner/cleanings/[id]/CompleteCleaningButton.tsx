"use client";

import { useState, useTransition } from "react";
import { completeCleaningWithReasons } from "../../checklist-actions";
import { useRouter } from "next/navigation";
import InventoryRequiredModal from "./InventoryRequiredModal";
import { InventoryCardRef } from "./InventoryCard";

interface CompleteCleaningButtonProps {
  cleaningId: string;
  returnTo: string;
  inventoryCardRef?: React.RefObject<InventoryCardRef | null>;
  tareasAnchorId?: string;
}

export default function CompleteCleaningButton({
  cleaningId,
  returnTo,
  inventoryCardRef,
  tareasAnchorId = "tareas-pro-block",
}: CompleteCleaningButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [inventoryRequiredModalOpen, setInventoryRequiredModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tareasBlockers, setTareasBlockers] = useState<
    { jobId: string; blockers: string[] }[] | null
  >(null);

  const handleComplete = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await completeCleaningWithReasons(cleaningId);
        if (result.success) {
          router.push(returnTo);
          router.refresh();
        } else if ("requiresInventoryReview" in result) {
          setInventoryRequiredModalOpen(true);
        } else if ("tareasBlockers" in result) {
          setTareasBlockers(result.tareasBlockers);
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "Error al completar la limpieza");
      }
    });
  };

  const handleGoToInventory = () => {
    if (inventoryCardRef?.current) {
      inventoryCardRef.current.open();
    }
    setTimeout(() => {
      const inventorySection = document.getElementById("inventory-section");
      if (inventorySection) {
        inventorySection.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => {
          const submitBtn = document.getElementById("submit-inventory-btn");
          if (submitBtn) (submitBtn as HTMLElement).focus();
        }, 500);
      } else {
        const inventoryUrl = `/cleaner/cleanings/${cleaningId}/inventory-review${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
        router.push(inventoryUrl);
      }
    }, 100);
  };

  // Bottom sheet de tareas bloqueantes
  const totalBlockers = tareasBlockers?.reduce((sum, j) => sum + j.blockers.length, 0) ?? 0;

  const handleGoToTareas = () => {
    const el = document.getElementById(tareasAnchorId);
    setTareasBlockers(null);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Pequeño delay para que el scroll termine antes del focus,
      // que abre el bloque colapsado vía onFocus del section
      setTimeout(() => el.focus({ preventScroll: true }), 400);
    }
  };

  return (
    <>
      <InventoryRequiredModal
        isOpen={inventoryRequiredModalOpen}
        cleaningId={cleaningId}
        onClose={() => setInventoryRequiredModalOpen(false)}
        onGoToInventory={handleGoToInventory}
      />

      {/* Bottom sheet — Tareas obligatorias pendientes */}
      {tareasBlockers && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setTareasBlockers(null)}
          />
          <div className="fixed bottom-0 inset-x-0 z-50 flex justify-center">
            <div className="w-full sm:max-w-lg bg-white rounded-t-2xl shadow-2xl px-5 pt-3 pb-10 space-y-4">
              {/* Handle */}
              <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto" />

              {/* Título */}
              <h2 className="text-base font-semibold text-neutral-900">
                Hay tareas obligatorias pendientes
              </h2>

              {/* Descripción */}
              <p className="text-sm text-neutral-600">
                Para completar la limpieza, primero responde las tareas obligatorias o indica por qué no pudieron completarse.
              </p>

              {/* Resumen numérico */}
              <p className="text-sm font-medium text-red-600">
                Quedan {totalBlockers} tarea{totalBlockers !== 1 ? "s" : ""} obligatoria{totalBlockers !== 1 ? "s" : ""} por responder.
              </p>

              {/* Acciones */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleGoToTareas}
                  className="flex-1 rounded-lg bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
                >
                  Ir a tareas
                </button>
                <button
                  type="button"
                  onClick={() => setTareasBlockers(null)}
                  className="px-4 py-2.5 rounded-lg border border-neutral-300 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={handleComplete}
        disabled={isPending}
        className="w-full rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Completando..." : "Completar limpieza"}
      </button>

      {/* Error genérico (errores reales de servidor) */}
      {errorMessage && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900 mb-1">
            No se puede completar la limpieza
          </p>
          <p className="text-xs text-amber-700 whitespace-pre-line">
            {errorMessage}
          </p>
        </div>
      )}
    </>
  );
}
