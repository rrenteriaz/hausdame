"use client";

import { useState, useTransition } from "react";
import {
  createChecklistItem,
  updateChecklistItem,
  toggleChecklistItemActive,
  deleteChecklistItem,
  copyChecklistToProperties,
} from "../checklist-actions";
import { ChecklistArea } from "@/lib/types/cleaning-enums";

interface PropertyChecklistItem {
  id: string;
  area: ChecklistArea;
  title: string;
  sortOrder: number;
  isActive: boolean;
}

interface PropertyChecklistProps {
  propertyId: string;
  items: PropertyChecklistItem[];
  allProperties: Array<{ id: string; name: string; shortName?: string | null }>;
}

const AREA_LABELS: Record<ChecklistArea, string> = {
  SALA: "Sala",
  COMEDOR: "Comedor",
  COCINA: "Cocina",
  HABITACIONES: "Habitaciones",
  BANOS: "Baños",
  PATIO: "Patio",
  JARDIN: "Jardín",
  COCHERA: "Cochera",
  OTROS: "Otros",
};

const AREA_OPTIONS: ChecklistArea[] = [
  "SALA",
  "COMEDOR",
  "COCINA",
  "HABITACIONES",
  "BANOS",
  "PATIO",
  "JARDIN",
  "COCHERA",
  "OTROS",
];

export default function PropertyChecklist({
  propertyId,
  items,
  allProperties,
}: PropertyChecklistProps) {
  const [isPending, startTransition] = useTransition();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItemArea, setNewItemArea] = useState<ChecklistArea>("SALA");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [copyResult, setCopyResult] = useState<{ copied: number; errors: string[] } | null>(null);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [selectedProperties, setSelectedProperties] = useState<Set<string>>(new Set());

  // Agrupar items por área (solo áreas con items activos)
  const itemsByArea = items
    .filter((item) => item.isActive)
    .reduce((acc, item) => {
      if (!acc[item.area]) {
        acc[item.area] = [];
      }
      acc[item.area].push(item);
      return acc;
    }, {} as Record<ChecklistArea, PropertyChecklistItem[]>);

  // Ordenar items dentro de cada área por sortOrder
  Object.keys(itemsByArea).forEach((area) => {
    itemsByArea[area as ChecklistArea].sort((a, b) => a.sortOrder - b.sortOrder);
  });

  const activeAreas = Object.keys(itemsByArea) as ChecklistArea[];

  const handleAdd = () => {
    if (!newItemTitle.trim()) return;

    const formData = new FormData();
    formData.append("propertyId", propertyId);
    formData.append("area", newItemArea);
    formData.append("title", newItemTitle.trim());
    formData.append("returnTo", `/host/properties/${propertyId}`);

    startTransition(async () => {
      await createChecklistItem(formData);
      setIsAdding(false);
      setNewItemTitle("");
      setNewItemArea("SALA");
    });
  };

  const handleToggleActive = (id: string, currentActive: boolean) => {
    const formData = new FormData();
    formData.append("id", id);
    formData.append("propertyId", propertyId);
    formData.append("isActive", String(currentActive));

    startTransition(async () => {
      await toggleChecklistItemActive(formData);
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("¿Eliminar este item del checklist?")) return;

    const formData = new FormData();
    formData.append("id", id);
    formData.append("propertyId", propertyId);
    formData.append("returnTo", `/host/properties/${propertyId}`);

    startTransition(async () => {
      await deleteChecklistItem(formData);
    });
  };

  const handleCopy = () => {
    if (selectedProperties.size === 0) {
      alert("Selecciona al menos una propiedad");
      return;
    }

    startTransition(async () => {
      const result = await copyChecklistToProperties(propertyId, Array.from(selectedProperties));
      setCopyResult(result);
      if (result.errors.length === 0) {
        setTimeout(() => {
          setIsCopyModalOpen(false);
          setSelectedProperties(new Set());
          setCopyResult(null);
        }, 2000);
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedProperties.size === allProperties.length) {
      setSelectedProperties(new Set());
    } else {
      setSelectedProperties(new Set(allProperties.map((p) => p.id)));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-800">Checklist</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCopyModalOpen(true)}
            disabled={activeAreas.length === 0}
            className="text-xs text-neutral-600 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Copiar a otras propiedades
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="text-xs text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
          >
            Agregar item
          </button>
        </div>
      </div>

      {/* Formulario para agregar item */}
      {isAdding && (
        <div className="rounded-xl border border-neutral-200 bg-white p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newItemArea}
              onChange={(e) => setNewItemArea(e.target.value as ChecklistArea)}
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
            >
              {AREA_OPTIONS.map((area) => (
                <option key={area} value={area}>
                  {AREA_LABELS[area]}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              placeholder="Título del item"
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") {
                  setIsAdding(false);
                  setNewItemTitle("");
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending || !newItemTitle.trim()}
              className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Agregar
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewItemTitle("");
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de items agrupados por área */}
      {activeAreas.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No hay items en el checklist. Agrega items para comenzar.
        </p>
      ) : (
        <div className="space-y-4">
          {activeAreas.map((area) => (
            <div key={area} className="rounded-xl border border-neutral-200 bg-white p-3 space-y-2">
              <h3 className="text-xs font-semibold text-neutral-800">{AREA_LABELS[area]}</h3>
              <ul className="space-y-1">
                {itemsByArea[area].map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-neutral-50"
                  >
                    <span className="text-xs text-neutral-700 flex-1">{item.title}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item.id, item.isActive)}
                        className="text-xs text-neutral-500 hover:text-neutral-900"
                      >
                        {item.isActive ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Modal para copiar a otras propiedades */}
      {isCopyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setIsCopyModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
              Copiar checklist a otras propiedades
            </h3>
            <p className="text-xs text-neutral-600 mb-4">
              Selecciona las propiedades a las que quieres copiar este checklist. Se reemplazarán
              los items existentes.
            </p>

            {copyResult && (
              <div
                className={`mb-4 rounded-lg p-3 ${
                  copyResult.errors.length > 0
                    ? "bg-red-50 border border-red-200"
                    : "bg-green-50 border border-green-200"
                }`}
              >
                {copyResult.errors.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {copyResult.errors.map((error, idx) => (
                      <p key={idx} className="text-xs text-red-600">
                        • {error}
                      </p>
                    ))}
                  </div>
                )}
                <p
                  className={`text-xs font-medium ${
                    copyResult.errors.length > 0 ? "text-red-900" : "text-green-900"
                  }`}
                >
                  Copiado a {copyResult.copied} propiedad(es)
                </p>
              </div>
            )}

            <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="w-full text-left text-xs font-medium text-neutral-700 hover:text-neutral-900 underline underline-offset-2"
              >
                {selectedProperties.size === allProperties.length
                  ? "Deseleccionar todas"
                  : "Seleccionar todas"}
              </button>
              {allProperties.map((prop) => (
                <label
                  key={prop.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedProperties.has(prop.id)}
                    onChange={(e) => {
                      const newSet = new Set(selectedProperties);
                      if (e.target.checked) {
                        newSet.add(prop.id);
                      } else {
                        newSet.delete(prop.id);
                      }
                      setSelectedProperties(newSet);
                    }}
                    className="rounded border-neutral-300 text-black focus:ring-black/5"
                  />
                  <span className="text-xs text-neutral-700">
                    {prop.shortName || prop.name}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={handleCopy}
                disabled={isPending || selectedProperties.size === 0}
                className="flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Copiando..." : "Copiar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCopyModalOpen(false);
                  setSelectedProperties(new Set());
                  setCopyResult(null);
                }}
                className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

