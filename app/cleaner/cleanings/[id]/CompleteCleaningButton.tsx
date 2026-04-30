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
}

export default function CompleteCleaningButton({
  cleaningId,
  returnTo,
  inventoryCardRef,
}: CompleteCleaningButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [inventoryRequiredModalOpen, setInventoryRequiredModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleComplete = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await completeCleaningWithReasons(cleaningId);
        if (result.requiresInventoryReview) {
          setInventoryRequiredModalOpen(true);
        } else if (result.success) {
          router.push(returnTo);
          router.refresh();
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

      {/* Bloqueador: Tareas de la propiedad con pasos obligatorios pendientes */}
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
