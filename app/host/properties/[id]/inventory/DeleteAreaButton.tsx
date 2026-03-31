"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteInventoryAreaAction } from "@/app/host/inventory/actions";

interface DeleteAreaButtonProps {
  propertyId: string;
  propertyZoneId: string;
  areaName: string;
  itemCount: number;
}

export default function DeleteAreaButton({
  propertyId,
  propertyZoneId,
  areaName,
  itemCount,
}: DeleteAreaButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("propertyId", propertyId);
      formData.set("propertyZoneId", propertyZoneId);
      const result = await deleteInventoryAreaAction(formData);
      setShowConfirm(false);
      if (result?.count === 0) {
        // Área ya eliminada en BD; refrescar para sincronizar la UI
        router.refresh();
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowConfirm(true);
        }}
        className="p-1.5 text-neutral-400 hover:text-red-600 rounded transition-colors"
        aria-label={`Eliminar área ${areaName}`}
        title="Eliminar área"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !isPending && setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-neutral-900 mb-2">
              Eliminar área
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              ¿Eliminar el área &quot;{areaName}&quot; y sus {itemCount} item
              {itemCount !== 1 ? "s" : ""}? Esta acción no se puede deshacer.
            </p>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => !isPending && setShowConfirm(false)}
                disabled={isPending}
                className="px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                {isPending ? "Eliminando..." : "Eliminar área"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
