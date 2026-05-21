"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { applyInventoryTemplateToProperty } from "@/app/host/inventory/template-actions";

interface ApplyTemplateModalProps {
  propertyId: string;
  hasExistingInventory: boolean;
  triggerClassName?: string;
}

export default function ApplyTemplateModal({
  propertyId,
  hasExistingInventory,
  triggerClassName,
}: ApplyTemplateModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [showDestructiveConfirm, setShowDestructiveConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    errors: string[];
  } | null>(null);

  const handleOpen = () => {
    setIsOpen(true);
    setShowDestructiveConfirm(false);
    setError(null);
    setResult(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    setShowDestructiveConfirm(false);
    setError(null);
    setResult(null);
  };

  const handleApplyClick = () => {
    if (hasExistingInventory) {
      setShowDestructiveConfirm(true);
    } else {
      handleApply();
    }
  };

  const handleApply = () => {
    setShowDestructiveConfirm(false);
    setError(null);
    setResult(null);

    startTransition(async () => {
      try {
        const result = await applyInventoryTemplateToProperty(propertyId);
        setResult(result);
        
        if (result.errors.length === 0) {
          // Cerrar modal automáticamente después de 2 segundos si no hay errores
          setTimeout(() => {
            handleClose();
            router.refresh();
          }, 2000);
        } else {
          // Si hay errores, mantener el modal abierto para que el usuario los vea
          router.refresh();
        }
      } catch (error: any) {
        console.error("[ApplyTemplateModal] Error:", error);
        setError(error?.message || "Ocurrió un error al aplicar la plantilla");
      }
    });
  };

  // Cerrar modal con Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (showDestructiveConfirm) {
          setShowDestructiveConfirm(false);
        } else {
          handleClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, showDestructiveConfirm]);

  // Prevenir scroll del body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Botón trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className={triggerClassName ?? "rounded-lg border border-neutral-300 bg-white px-4 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99]"}
      >
        Generar inventario desde plantilla
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
              Generar inventario desde plantilla
            </h3>

            {hasExistingInventory && (
              <div className="mb-4 rounded-lg p-3 bg-yellow-50 border border-yellow-200">
                <p className="text-xs text-yellow-900 font-medium mb-1">
                  ⚠️ Advertencia
                </p>
                <p className="text-xs text-yellow-800">
                  Esta acción eliminará el inventario actual y lo reemplazará
                  completamente por la plantilla base.
                </p>
              </div>
            )}

            {!hasExistingInventory && (
              <p className="text-xs text-neutral-600 mb-4">
                Se creará el inventario completo desde la plantilla base V1.0.
              </p>
            )}

            {error && (
              <div className="mb-4 rounded-lg p-3 bg-red-50 border border-red-200">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {result && (
              <div
                className={`mb-4 rounded-lg p-3 ${
                  result.errors.length > 0
                    ? "bg-yellow-50 border border-yellow-200"
                    : "bg-green-50 border border-green-200"
                }`}
              >
                {result.errors.length > 0 && (
                  <div className="space-y-1 mb-2">
                    <p className="text-xs font-medium text-yellow-900 mb-1">
                      Errores encontrados:
                    </p>
                    {result.errors.map((error, idx) => (
                      <p key={idx} className="text-xs text-yellow-800">
                        • {error}
                      </p>
                    ))}
                  </div>
                )}
                <p
                  className={`text-xs font-medium ${
                    result.errors.length > 0
                      ? "text-yellow-900"
                      : "text-green-900"
                  }`}
                >
                  {result.errors.length === 0
                    ? `✓ Inventario creado exitosamente (${result.created} líneas)`
                    : `Se crearon ${result.created} líneas, pero hubo ${result.errors.length} error(es)`}
                </p>
              </div>
            )}

            {/* Segunda confirmación destructiva */}
            {showDestructiveConfirm && (
              <div className="mb-4 rounded-lg p-4 bg-red-50 border border-red-200 space-y-3">
                <p className="text-sm font-semibold text-red-900">
                  Confirmar reemplazo del inventario
                </p>
                <p className="text-xs text-red-800">
                  Se eliminará el inventario actual de esta propiedad y será
                  reemplazado por la plantilla base. Esta acción no se puede
                  deshacer.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={isPending}
                    className="flex-1 rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending ? "Reemplazando..." : "Sí, reemplazar inventario"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDestructiveConfirm(false)}
                    disabled={isPending}
                    className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={handleApplyClick}
                disabled={isPending || (result !== null && result.errors.length === 0) || showDestructiveConfirm}
                className="flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Creando..." : "Crear inventario"}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

