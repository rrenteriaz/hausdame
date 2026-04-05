"use client";

import { useState } from "react";
import Link from "next/link";

export type InventoryPropertyItem = {
  id: string;
  name: string;
  shortName: string | null;
  groupName: string | null;
  _count: {
    propertyZones: number;
    inventoryLines: number;
  };
};

export default function InventoryPropertyList({
  properties,
}: {
  properties: InventoryPropertyItem[];
}) {
  const [q, setQ] = useState("");

  const filtered = q.trim()
    ? properties.filter(
        (p) =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          (p.shortName?.toLowerCase().includes(q.toLowerCase()) ?? false)
      )
    : properties;

  return (
    <div className="space-y-3">
      {/* Buscador */}
      <div className="relative">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar alojamiento..."
          className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 bg-white"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8">
          {q
            ? "No hay alojamientos con ese nombre."
            : "No hay alojamientos registrados."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/host/properties/${p.id}/inventory?returnTo=/host/inventory`}
              className="block rounded-2xl border border-neutral-200 bg-white p-4 hover:border-neutral-400 active:bg-neutral-50 transition"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-medium text-neutral-900 truncate">
                      {p.name}
                    </span>
                    {p.shortName && (
                      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-black text-white">
                        {p.shortName}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-500">
                    {p._count.propertyZones}{" "}
                    {p._count.propertyZones === 1 ? "área" : "áreas"} ·{" "}
                    {p._count.inventoryLines}{" "}
                    {p._count.inventoryLines === 1 ? "ítem" : "ítems"}
                  </p>
                </div>
                <svg
                  className="w-4 h-4 text-neutral-400 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
