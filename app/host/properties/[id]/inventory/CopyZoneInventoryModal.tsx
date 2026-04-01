"use client";

/**
 * Phase 13: Modal para copiar inventario de una zona origen a esta zona destino.
 * Variantes:
 *   "header-button" — icono compacto en el header del CollapsibleSection (zona con items)
 *   "cta"           — bloque de llamada a la acción en zona vacía
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { copyInventoryBetweenZonesAction } from "@/app/host/inventory/actions";
import { OPERATIONAL_CATEGORY_LABELS } from "@/lib/inventory-zone-labels";
import type { PropertyZoneOperationalCategory } from "@prisma/client";

interface ZoneOption {
  id: string;
  name: string;
  operationalCategory: PropertyZoneOperationalCategory | null;
}

interface Props {
  propertyId: string;
  targetZoneId: string;
  targetZoneName: string;
  /** Todas las zonas de la propiedad; se filtra la zona destino internamente */
  zones: ZoneOption[];
  variant?: "header-button" | "cta";
}

export default function CopyZoneInventoryModal({
  propertyId,
  targetZoneId,
  targetZoneName,
  zones,
  variant = "header-button",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [result, setResult] = useState<{ copied: number; skipped: number; sourceName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableSources = zones.filter((z) => z.id !== targetZoneId);

  // No hay zonas origen disponibles → no renderizar nada
  if (availableSources.length === 0) return null;

  const openModal = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsOpen(true);
    setError(null);
    setResult(null);
    setSelectedSourceId("");
  };

  const closeModal = () => {
    if (isPending) return;
    setIsOpen(false);
  };

  const handleCopy = () => {
    if (!selectedSourceId) return;
    const sourceName = availableSources.find((z) => z.id === selectedSourceId)?.name ?? "";
    setError(null);
    startTransition(async () => {
      try {
        const res = await copyInventoryBetweenZonesAction(propertyId, selectedSourceId, targetZoneId);
        setResult({ ...res, sourceName });
        router.refresh();
        setTimeout(() => {
          setIsOpen(false);
          setResult(null);
          setSelectedSourceId("");
        }, 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al copiar el inventario");
      }
    });
  };

  const trigger =
    variant === "cta" ? (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
        <p className="text-sm text-neutral-500 mb-3">Esta área no tiene inventario aún</p>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copiar desde otra área
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={openModal}
        className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded transition-colors"
        title="Copiar inventario desde otra área"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>
    );

  return (
    <>
      {trigger}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-neutral-900">Copiar inventario</h3>
            <p className="text-sm text-neutral-500">
              Destino:{" "}
              <span className="font-medium text-neutral-700">{targetZoneName}</span>
            </p>

            {result ? (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-center space-y-1">
                <p className="text-sm font-medium text-green-800">
                  ✓ Se copiaron {result.copied} item{result.copied !== 1 ? "s" : ""} desde &quot;
                  {result.sourceName}&quot;
                </p>
                {result.skipped > 0 && (
                  <p className="text-xs text-green-600">
                    {result.skipped} item{result.skipped !== 1 ? "s" : ""} ya existía
                    {result.skipped !== 1 ? "n" : ""} en el área destino
                  </p>
                )}
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    Copiar desde
                  </label>
                  <select
                    value={selectedSourceId}
                    onChange={(e) => setSelectedSourceId(e.target.value)}
                    disabled={isPending}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400 disabled:opacity-50"
                  >
                    <option value="">Seleccionar área...</option>
                    {availableSources.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                        {zone.operationalCategory
                          ? ` · ${OPERATIONAL_CATEGORY_LABELS[zone.operationalCategory]}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={isPending}
                    className="px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!selectedSourceId || isPending}
                    className="px-3 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg disabled:opacity-50 transition"
                  >
                    {isPending ? "Copiando..." : "Copiar inventario"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
