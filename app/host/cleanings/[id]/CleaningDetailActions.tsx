"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startCleaning, completeCleaning, reopenCleaning, deleteCleaning } from "../actions";
import CancelCleaningModal from "../CancelCleaningModal";
import InventoryRequiredModal from "./InventoryRequiredModal";
import EditCleaningDateModal from "./EditCleaningDateModal";

interface CleaningDetailActionsProps {
  cleaning: {
    id: string;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    scheduledDate: Date;
    property: {
      name: string;
      shortName: string | null;
    };
  };
  returnTo: string;
  isManual?: boolean;
}

export default function CleaningDetailActions({ cleaning, returnTo, isManual }: CleaningDetailActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [inventoryRequiredModalOpen, setInventoryRequiredModalOpen] = useState(false);
  const [editDateModalOpen, setEditDateModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancelClick = () => {
    setCancelModalOpen(true);
  };

  const handleCloseModal = () => {
    setCancelModalOpen(false);
  };

  const handleCompleteCleaning = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      try {
        await completeCleaning(formData);
        // Si no hay error, el redirect se maneja en la action
      } catch (err: any) {
        console.error("[CleaningDetailActions] Error al completar limpieza:", err);
        console.error("[CleaningDetailActions] Error message:", err?.message);
        console.error("[CleaningDetailActions] Error toString:", err?.toString());
        
        // Verificar si el error contiene el mensaje (puede venir en diferentes formatos)
        const errorMessage = err?.message || err?.toString() || "";
        
        if (errorMessage.includes("INVENTORY_REVIEW_REQUIRED") || errorMessage === "INVENTORY_REVIEW_REQUIRED") {
          console.log("[CleaningDetailActions] Mostrando modal de inventario requerido");
          // Mostrar modal amigable en lugar de redirigir directamente
          setInventoryRequiredModalOpen(true);
        } else {
          setError(err?.message || "Error al completar la limpieza");
        }
      }
    });
  };

  return (
    <>
      <CancelCleaningModal
        cleaningId={cleaning.id}
        propertyName={cleaning.property.shortName || cleaning.property.name}
        scheduledDate={cleaning.scheduledDate}
        isOpen={cancelModalOpen}
        onClose={handleCloseModal}
        returnTo={returnTo}
      />

      <InventoryRequiredModal
        isOpen={inventoryRequiredModalOpen}
        cleaningId={cleaning.id}
        onClose={() => setInventoryRequiredModalOpen(false)}
        returnTo={returnTo}
      />

      <EditCleaningDateModal
        cleaningId={cleaning.id}
        scheduledDate={cleaning.scheduledDate}
        returnTo={returnTo}
        isOpen={editDateModalOpen}
        onClose={() => setEditDateModalOpen(false)}
      />

      {cleaning.status === "PENDING" ? (
        <div className="flex items-center gap-3">
          {isManual && (
            <button
              type="button"
              onClick={() => setEditDateModalOpen(true)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              Editar fecha
            </button>
          )}
          <button
            type="button"
            onClick={handleCancelClick}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 active:scale-[0.99] transition"
          >
            Cancelar limpieza
          </button>
        </div>
      ) : cleaning.status === "IN_PROGRESS" ? (
        <div className="space-y-2">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <form onSubmit={handleCompleteCleaning} className="flex-1">
              <input type="hidden" name="cleaningId" value={cleaning.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Procesando..." : "✔ Completar"}
              </button>
            </form>

            <button
              type="button"
              onClick={handleCancelClick}
              className="text-xs text-neutral-500 underline underline-offset-2"
            >
              ⨯ Cancelar
            </button>
          </div>
        </div>
      ) : cleaning.status === "COMPLETED" ? (
        <div className="flex items-center justify-between">
          <p className="text-base text-neutral-600">Completada</p>
          <form action={reopenCleaning}>
            <input type="hidden" name="cleaningId" value={cleaning.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className="text-xs text-neutral-500 underline underline-offset-2">
              Reabrir
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-base text-neutral-600">Cancelada</p>
          <form action={deleteCleaning}>
            <input type="hidden" name="cleaningId" value={cleaning.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              className="text-xs text-red-600 underline underline-offset-2 hover:text-red-700"
            >
              Eliminar
            </button>
          </form>
        </div>
      )}
    </>
  );
}

