"use client";

import { useState, useTransition, useEffect } from "react";
import { syncIcalForProperty } from "../sync-ical";
import { createMissingCleaningsForReservations } from "../create-missing-cleanings";

const SYNC_INTERVAL_MINUTES = 5;

interface SyncIcalButtonProps {
  propertyId: string;
  hasIcalUrl: boolean;
  icalLastSyncedAt: Date | null;
  icalLastSyncError: string | null;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SyncIcalButton({
  propertyId,
  hasIcalUrl,
  icalLastSyncedAt,
  icalLastSyncError,
}: SyncIcalButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [formattedSyncedAt, setFormattedSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    if (icalLastSyncedAt) {
      setFormattedSyncedAt(formatDateTime(icalLastSyncedAt));
    }
  }, [icalLastSyncedAt]);
  const [result, setResult] = useState<{
    ok: boolean;
    skippedLock?: boolean;
    error?: string;
  } | null>(null);
  const [isCreatingMissing, startCreatingMissing] = useTransition();
  const [missingResult, setMissingResult] = useState<{
    created: number;
    errors: string[];
  } | null>(null);

  const handleSync = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const syncResult = await syncIcalForProperty(propertyId);
        setResult(syncResult);
        if (syncResult.ok) {
          setTimeout(() => window.location.reload(), 2000);
        }
      } catch (error: any) {
        setResult({
          ok: false,
          error: error.message || "Error desconocido",
        });
      }
    });
  };

  if (!hasIcalUrl) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs text-amber-800">
          Configura una URL de iCal en la sección &quot;Editar propiedad&quot; para sincronizar reservas.
        </p>
      </div>
    );
  }

  const handleCreateMissing = () => {
    setMissingResult(null);
    startCreatingMissing(async () => {
      try {
        const res = await createMissingCleaningsForReservations();
        setMissingResult(res);
        if (res.errors.length === 0) {
          setTimeout(() => window.location.reload(), 2000);
        }
      } catch (error: any) {
        setMissingResult({
          created: 0,
          errors: [error.message || "Error desconocido"],
        });
      }
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        La sincronización ocurre automáticamente cada {SYNC_INTERVAL_MINUTES} minutos.
      </p>

      {formattedSyncedAt && (
        <p className="text-xs text-neutral-600">
          Última sincronización: {formattedSyncedAt}
        </p>
      )}
      {icalLastSyncError && (
        <p className="text-xs text-red-600">
          Último error: {icalLastSyncError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSync}
        disabled={isPending}
        className="w-full rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Sincronizando..." : "Forzar sincronización"}
      </button>

      <button
        type="button"
        onClick={handleCreateMissing}
        disabled={isCreatingMissing}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isCreatingMissing ? "Creando limpiezas faltantes..." : "Crear limpiezas faltantes"}
      </button>

      {missingResult && (
        <div
          className={`rounded-xl border p-3 space-y-2 ${
            missingResult.errors.length > 0
              ? "border-red-200 bg-red-50"
              : "border-green-200 bg-green-50"
          }`}
        >
          <p
            className={`text-xs font-semibold ${
              missingResult.errors.length > 0 ? "text-red-900" : "text-green-900"
            }`}
          >
            Limpiezas faltantes:
          </p>
          {missingResult.errors.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-red-600">Errores:</p>
              {missingResult.errors.map((error, idx) => (
                <p key={idx} className="text-xs text-red-600 pl-2 break-words">
                  • {error}
                </p>
              ))}
            </div>
          )}
          <div className="text-xs">
            <span
              className={
                missingResult.errors.length > 0 ? "text-red-700" : "text-green-700"
              }
            >
              Limpiezas creadas:{" "}
              <span className="font-medium">{missingResult.created}</span>
            </span>
          </div>
          {missingResult.errors.length === 0 && missingResult.created === 0 && (
            <p className="text-xs text-green-600">
              No había limpiezas faltantes. Todas las reservas ya tienen su
              limpieza asociada.
            </p>
          )}
        </div>
      )}

      {result && (
        <div
          className={`rounded-xl border p-3 space-y-2 ${
            result.ok
              ? "border-green-200 bg-green-50"
              : result.skippedLock
              ? "border-amber-200 bg-amber-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <p
            className={`text-xs font-semibold ${
              result.ok
                ? "text-green-900"
                : result.skippedLock
                ? "text-amber-900"
                : "text-red-900"
            }`}
          >
            {result.ok
              ? "Sincronización completada correctamente."
              : result.skippedLock
              ? "Sincronización en progreso, intenta en unos minutos."
              : "Error en la sincronización"}
          </p>
          {result.error && !result.skippedLock && (
            <p className="text-xs text-red-600 break-words">{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
