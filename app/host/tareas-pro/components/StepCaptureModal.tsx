"use client";

// app/host/tareas-pro/components/StepCaptureModal.tsx
import { useState } from "react";
import { updateTaskStepCaptures } from "../actions";

type Captures = {
  capturesYesNo: boolean;
  yesNoRequired: boolean;
  capturesNumber: boolean;
  numberRequired: boolean;
  capturesPhoto: boolean;
  photoRequired: boolean;
  capturesText: boolean;
  textRequired: boolean;
};

const CAPTURE_OPTIONS = [
  { key: "capturesYesNo" as const, label: "Sí / No", desc: "Respuesta booleana" },
  { key: "capturesNumber" as const, label: "Número", desc: "Valor numérico" },
  { key: "capturesText" as const, label: "Texto", desc: "Nota o descripción" },
  { key: "capturesPhoto" as const, label: "Foto", desc: "Evidencia fotográfica" },
] as const;

const REQUIRED_KEY: Record<string, keyof Captures> = {
  capturesYesNo: "yesNoRequired",
  capturesNumber: "numberRequired",
  capturesText: "textRequired",
  capturesPhoto: "photoRequired",
};

export default function StepCaptureModal({
  isOpen,
  stepId,
  stepName,
  currentCaptures,
  onClose,
  onUpdate,
}: {
  isOpen: boolean;
  stepId: string;
  stepName: string;
  currentCaptures: Captures;
  onClose: () => void;
  onUpdate: (captures: Captures) => void;
}) {
  const [captures, setCaptures] = useState<Captures>(currentCaptures);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const toggle = (key: keyof Captures) => {
    setCaptures((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // If disabling a capture, also disable its required flag
      const reqKey = REQUIRED_KEY[key as string];
      if (reqKey && !next[key as keyof Captures]) {
        next[reqKey] = false;
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("stepId", stepId);
      Object.entries(captures).forEach(([k, v]) => formData.append(k, String(v)));
      await updateTaskStepCaptures(formData);
      onUpdate(captures);
      onClose();
    } catch (err: any) {
      alert(err?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-neutral-100">
          <p className="text-xs text-neutral-400 truncate">{stepName}</p>
          <h2 className="text-sm font-semibold text-neutral-900 mt-0.5">Capturas adicionales</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Siempre se puede marcar como completada. Añade capturas opcionales u obligatorias.
          </p>
        </div>

        {/* Capture toggles */}
        <div className="divide-y divide-neutral-100">
          {CAPTURE_OPTIONS.map(({ key, label, desc }) => {
            const reqKey = REQUIRED_KEY[key] as keyof Captures;
            const isEnabled = captures[key];
            const isRequired = captures[reqKey];
            return (
              <div key={key} className="px-5 py-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-800">{label}</p>
                    <p className="text-xs text-neutral-400">{desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      isEnabled ? "bg-neutral-900" : "bg-neutral-200"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        isEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
                {isEnabled && (
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Obligatoria</span>
                    <button
                      type="button"
                      onClick={() => toggle(reqKey)}
                      className={`w-9 h-5 rounded-full transition-colors relative ${
                        isRequired ? "bg-red-500" : "bg-neutral-200"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          isRequired ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-neutral-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-sm text-neutral-600 border border-neutral-200 px-4 py-2.5 rounded-xl hover:bg-neutral-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 text-sm bg-neutral-900 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-neutral-800 transition disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
