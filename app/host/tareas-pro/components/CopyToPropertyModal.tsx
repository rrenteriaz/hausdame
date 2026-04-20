"use client";

// app/host/tareas-pro/components/CopyToPropertyModal.tsx
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { copyTaskTemplateToProperty } from "../copy-actions";

interface Property {
  id: string;
  name: string;
  shortName: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceTemplateId: string;
  sourceName: string;
  currentPropertyId: string;
  properties: Property[];
}

export default function CopyToPropertyModal({
  isOpen,
  onClose,
  sourceTemplateId,
  sourceName,
  currentPropertyId,
  properties,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const otherProperties = properties.filter((p) => p.id !== currentPropertyId);

  const [targetPropertyId, setTargetPropertyId] = useState(otherProperties[0]?.id ?? "");
  const [name, setName] = useState(`${sourceName} (copia)`);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!targetPropertyId) {
      setError("Selecciona una propiedad destino.");
      return;
    }
    if (!name.trim()) {
      setError("El nombre no puede estar vacío.");
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("sourceTemplateId", sourceTemplateId);
        fd.append("targetPropertyId", targetPropertyId);
        fd.append("name", name.trim());
        const result = await copyTaskTemplateToProperty(fd);
        onClose();
        router.push(`/host/tareas-pro/${result.templateId}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al copiar el checklist.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={!isPending ? onClose : undefined} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-neutral-900">Copiar a otra propiedad</h2>

        {/* Info */}
        <p className="text-xs text-neutral-500">
          Se creará una copia independiente en borrador. Editar la copia no afecta el checklist original ni su historial.
        </p>

        {/* Propiedad destino */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-neutral-600">
            Propiedad destino
          </label>
          {otherProperties.length === 0 ? (
            <p className="text-sm text-neutral-400 italic">
              No hay otras propiedades disponibles en este tenant.
            </p>
          ) : (
            <select
              value={targetPropertyId}
              onChange={(e) => setTargetPropertyId(e.target.value)}
              disabled={isPending}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
            >
              {otherProperties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.shortName ? `${p.shortName} — ${p.name}` : p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Nombre de la copia */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-neutral-600">
            Nombre del checklist copiado
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            maxLength={120}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
          />
          <p className="text-xs text-neutral-400">
            Si ya existe un checklist con ese nombre en la propiedad destino, se añadirá un sufijo automáticamente.
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Acciones */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 text-sm text-neutral-600 border border-neutral-200 px-4 py-2 rounded-lg font-medium hover:bg-neutral-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || otherProperties.length === 0 || !name.trim()}
            className="flex-1 text-sm text-white bg-neutral-900 px-4 py-2 rounded-lg font-medium hover:bg-neutral-800 transition disabled:opacity-50"
          >
            {isPending ? "Copiando…" : "Crear copia"}
          </button>
        </div>
      </div>
    </div>
  );
}
