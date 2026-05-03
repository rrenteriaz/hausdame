"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { copyInventoryBetweenPropertiesAction } from "@/app/host/inventory/actions";

interface CopyInventoryModalProps {
  propertyId: string;
  propertyName: string;
  availableProperties: Array<{
    id: string;
    name: string;
    shortName: string | null;
  }>;
  triggerClassName?: string;
}

export default function CopyInventoryModal({
  propertyId,
  propertyName,
  availableProperties,
  triggerClassName,
}: CopyInventoryModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [fromPropertyId, setFromPropertyId] = useState("");
  const [copyQuantities, setCopyQuantities] = useState(true);
  const [overwriteMode, setOverwriteMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    archivedInDestination?: number;
    examples: Array<{ area: string; itemName: string }>;
  } | null>(null);

  const handleOpen = () => {
    setIsOpen(true);
    setError(null);
    setResult(null);
    setFromPropertyId("");
    setCopyQuantities(true);
    setOverwriteMode(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
    setResult(null);
    setFromPropertyId("");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!fromPropertyId) {
      setError("Selecciona una propiedad origen");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("fromPropertyId", fromPropertyId);
        formData.set("toPropertyId", propertyId);
        formData.set("copyQuantities", copyQuantities ? "true" : "false");
        formData.set("mode", overwriteMode ? "overwrite" : "merge");

        const stats = await copyInventoryBetweenPropertiesAction(formData);
        setResult(stats);
        router.refresh();
      } catch (error: any) {
        console.error("[CopyInventoryModal] Error:", error);
        setError(error?.message || "Ocurrió un error al copiar el inventario");
      }
    });
  };

  // Cerrar modal con Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

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
      {/* Botón para abrir el modal */}
      <button
        type="button"
        onClick={handleOpen}
        className={triggerClassName ?? "w-full sm:w-auto rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.99] transition"}
      >
        Copiar inventario
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleClose();
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <form onSubmit={handleSubmit}>
              {/* Header */}
              <div className="border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900">
                  Copiar inventario
                </h2>
                {/* Solo mostrar botón X si no hay resultado exitoso */}
                {!result && (
                  <button
                    type="button"
                    onClick={handleClose}
                    className="text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {/* Contenido */}
              <div className="p-4 space-y-4">
                {/* Si hay resultado exitoso, mostrar solo el resumen */}
                {result ? (
                  <>
                    {/* Resultado exitoso */}
                    <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                      <p className="text-sm font-medium text-green-800 mb-2">
                        Inventario copiado exitosamente
                      </p>
                      <div className="text-xs text-green-700 space-y-1">
                        <p>• {result.created} líneas creadas</p>
                        {result.updated > 0 && (
                          <p>• {result.updated} líneas actualizadas</p>
                        )}
                        {result.skipped > 0 && (
                          <p>• {result.skipped} líneas omitidas (ya existían)</p>
                        )}
                        {result.archivedInDestination !== undefined && result.archivedInDestination > 0 && (
                          <p>• {result.archivedInDestination} líneas desactivadas en destino</p>
                        )}
                        {result.examples.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-green-200">
                            <p className="font-medium mb-1">Ejemplos:</p>
                            <ul className="space-y-0.5">
                              {result.examples.map((ex, idx) => (
                                <li key={idx}>
                                  {ex.area} — {ex.itemName}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Mensaje de error */}
                    {error && (
                      <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                        <p className="text-sm text-red-800">{error}</p>
                      </div>
                    )}

                    {/* Información */}
                    <div className="bg-neutral-50 rounded-lg p-3">
                      <p className="text-sm text-neutral-700">
                        <span className="font-medium">Destino:</span> {propertyName}
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Se copiarán solo las líneas activas de la propiedad origen
                      </p>
                    </div>

                    {/* Select propiedad origen */}
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Propiedad origen *
                      </label>
                      <select
                        value={fromPropertyId}
                        onChange={(e) => setFromPropertyId(e.target.value)}
                        required
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                      >
                        <option value="">Selecciona una propiedad</option>
                        {availableProperties.map((prop) => (
                          <option key={prop.id} value={prop.id}>
                            {prop.shortName || prop.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Checkbox copiar cantidades */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="copyQuantities"
                        checked={copyQuantities}
                        onChange={(e) => setCopyQuantities(e.target.checked)}
                        className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-neutral-300"
                      />
                      <label
                        htmlFor="copyQuantities"
                        className="text-sm text-neutral-700 cursor-pointer"
                      >
                        Copiar cantidades
                      </label>
                    </div>

                    {/* Switch sobrescribir destino */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="overwriteMode"
                        checked={overwriteMode}
                        onChange={(e) => setOverwriteMode(e.target.checked)}
                        className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-neutral-300"
                      />
                      <label
                        htmlFor="overwriteMode"
                        className="text-sm text-neutral-700 cursor-pointer"
                      >Sobrescribir destino (⚠️ El inventario actual de la propiedad destino se perderá)
                      </label>
                        
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-neutral-200 px-4 py-3 flex items-center justify-end gap-3">
                {result ? (
                  // Si hay resultado, mostrar solo botón Aceptar
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 rounded-lg bg-black text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
                  >
                    Aceptar
                  </button>
                ) : (
                  // Si no hay resultado, mostrar Cancelar y Confirmar
                  <>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-base font-medium text-neutral-700 hover:text-neutral-900 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isPending || !fromPropertyId}
                      className="px-4 py-2 rounded-lg bg-black text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPending ? "Copiando..." : "Confirmar"}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

