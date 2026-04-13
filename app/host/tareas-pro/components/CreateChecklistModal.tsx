"use client";

import { useState } from "react";
import { createTaskTemplate } from "../actions";

type Property = { id: string; name: string; shortName: string | null };

export default function CreateChecklistModal({ properties }: { properties: Property[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto bg-neutral-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-neutral-800 transition"
      >
        + Crear checklist
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-base font-semibold text-neutral-900">Nuevo checklist</h2>
            </div>
            <form action={createTaskTemplate} className="px-6 py-5 space-y-4">
              {/* Propiedad */}
              <div>
                <label className="block text-sm font-medium mb-2 text-neutral-700">Propiedad</label>
                <div className="space-y-1 max-h-44 overflow-y-auto border rounded-xl p-2">
                  {properties.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name="propertyId"
                        value={p.id}
                        required
                        className="shrink-0"
                      />
                      <span className="text-sm font-medium text-neutral-900">
                        {p.shortName ?? p.name}
                      </span>
                      {p.shortName && (
                        <span className="text-xs text-neutral-400 truncate">{p.name}</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700">Nombre</label>
                <input
                  name="name"
                  required
                  placeholder="Ej: Protocolo de limpieza checkout"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700">
                  Descripción{" "}
                  <span className="font-normal text-neutral-400">(opcional)</span>
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Describe brevemente para qué sirve este checklist"
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-neutral-900 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-neutral-800 transition"
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
