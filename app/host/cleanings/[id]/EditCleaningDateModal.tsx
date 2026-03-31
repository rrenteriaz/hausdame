"use client";

import { useState, useTransition } from "react";
import { rescheduleCleaning } from "../actions";

interface EditCleaningDateModalProps {
  cleaningId: string;
  scheduledDate: Date;
  returnTo: string;
  isOpen: boolean;
  onClose: () => void;
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toLocalTimeString(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

export default function EditCleaningDateModal({
  cleaningId,
  scheduledDate,
  returnTo,
  isOpen,
  onClose,
}: EditCleaningDateModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await rescheduleCleaning(formData);
      } catch (err: any) {
        // Next.js lanza NEXT_REDIRECT cuando redirect() fue llamado — es éxito, cerrar modal
        const digest = (err as any)?.digest || "";
        const msg = err?.message || "";
        if (digest.includes("NEXT_REDIRECT") || msg.includes("NEXT_REDIRECT")) {
          onClose();
          return;
        }
        setError(msg || "Error al reprogramar la limpieza");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-base font-semibold text-neutral-900">Editar fecha y hora</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="cleaningId" value={cleaningId} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <div className="space-y-1">
            <label htmlFor="edit-date" className="text-xs text-neutral-500">
              Fecha
            </label>
            <input
              id="edit-date"
              name="date"
              type="date"
              required
              defaultValue={toLocalDateString(scheduledDate)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-time" className="text-xs text-neutral-500">
              Hora
            </label>
            <input
              id="edit-time"
              name="time"
              type="time"
              required
              defaultValue={toLocalTimeString(scheduledDate)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-black px-4 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
