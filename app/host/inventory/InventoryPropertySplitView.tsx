"use client";

import { useState } from "react";

export type InventoryPropertyItemSplit = {
  id: string;
  name: string;
  shortName: string | null;
  thumbUrl: string | null;
  zones: number;
  lines: number;
};

export type InventoryGroupItemSplit = {
  name: string;
  properties: InventoryPropertyItemSplit[];
};

export default function InventoryPropertySplitView({
  groups,
}: {
  groups: InventoryGroupItemSplit[];
}) {
  const [selectedGroup, setSelectedGroup] = useState<string>(
    groups[0]?.name ?? ""
  );

  const current = groups.find((g) => g.name === selectedGroup);

  return (
    <div className="flex border border-neutral-200 rounded-2xl overflow-hidden h-[calc(100vh-460px)] min-h-[360px]">
      {/* Panel izquierdo: grupos */}
      <div className="w-48 shrink-0 border-r border-neutral-200 bg-neutral-50 overflow-y-auto">
        {groups.map((g) => {
          const isSelected = g.name === selectedGroup;
          return (
            <button
              key={g.name}
              type="button"
              onClick={() => setSelectedGroup(g.name)}
              className={`w-full text-left px-4 py-3 transition-colors border-b border-neutral-100 last:border-b-0 ${
                isSelected
                  ? "border-r-2 border-r-neutral-900 bg-white"
                  : "hover:bg-neutral-100"
              }`}
            >
              <p
                className={`text-sm font-medium truncate ${
                  isSelected ? "text-neutral-900" : "text-neutral-600"
                }`}
              >
                {g.name}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {g.properties.length}{" "}
                {g.properties.length === 1 ? "propiedad" : "propiedades"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Panel derecho: propiedades del grupo seleccionado */}
      <div className="flex-1 overflow-y-auto bg-white">
        {current && current.properties.length > 0 ? (
          <div className="divide-y divide-neutral-100">
            {current.properties.map((p) => (
              <a
                key={p.id}
                href={`/host/properties/${p.id}/inventory?returnTo=/host/inventory`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors no-underline"
              >
                {/* Thumbnail */}
                <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200">
                  {p.thumbUrl ? (
                    <img
                      src={p.thumbUrl}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center">
                        <span className="text-xs font-semibold text-neutral-500">
                          H
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900 truncate">
                      {p.name}
                    </span>
                    {p.shortName && (
                      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-black text-white">
                        {p.shortName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {p.lines === 0
                      ? "Sin inventario"
                      : `${p.zones} ${p.zones === 1 ? "área" : "áreas"} · ${p.lines} ${p.lines === 1 ? "ítem" : "ítems"}`}
                  </p>
                </div>

                {/* Chevron */}
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
              </a>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full py-12">
            <p className="text-sm text-neutral-400">
              No hay propiedades en este grupo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
