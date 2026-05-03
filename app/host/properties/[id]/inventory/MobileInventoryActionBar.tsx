"use client";

import { useState, useRef, useEffect } from "react";
import AddInventoryItemButton from "./AddInventoryItemButton";
import ApplyTemplateModal from "./ApplyTemplateModal";
import CopyInventoryModal from "./CopyInventoryModal";
import ZonesManagementSection from "./ZonesManagementSection";
import type { PropertyZoneOperationalCategory } from "@/lib/types/inventory-enums";

type Priority = "HIGH" | "MEDIUM" | "LOW";

interface Zone {
  id: string;
  name: string;
  sortOrder: number | null;
  operationalCategory: PropertyZoneOperationalCategory | null;
  _count: { inventoryLines: number };
}

interface Props {
  propertyId: string;
  propertyName: string;
  priorityFilter?: Priority;
  searchTerm?: string;
  areaFilter?: string;
  categoryFilter?: string;
  availableProperties: Array<{ id: string; name: string; shortName: string | null }>;
  propertyZones: Zone[];
  hasExistingInventory: boolean;
}

const MENU_ITEM_CLS =
  "w-full text-left px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors";

export default function MobileInventoryActionBar({
  propertyId,
  propertyName,
  priorityFilter,
  searchTerm,
  areaFilter,
  categoryFilter,
  availableProperties,
  propertyZones,
  hasExistingInventory,
}: Props) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setGearOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function buildPriorityHref(p: Priority | "ALL") {
    const params = new URLSearchParams();
    if (searchTerm) params.set("q", searchTerm);
    if (areaFilter) params.set("area", areaFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (p !== "ALL") params.set("priority", p);
    const qs = params.toString();
    return `/host/properties/${propertyId}/inventory${qs ? `?${qs}` : ""}`;
  }

  const priorities: { key: Priority | "ALL"; label: string }[] = [
    { key: "ALL", label: "Todo" },
    { key: "HIGH", label: "🟥 Alta" },
    { key: "MEDIUM", label: "🟨 Media" },
    { key: "LOW", label: "🟩 Baja" },
  ];

  const activeLabel =
    priorityFilter === "HIGH"
      ? "🟥 Alta"
      : priorityFilter === "MEDIUM"
      ? "🟨 Media"
      : priorityFilter === "LOW"
      ? "🟩 Baja"
      : null;

  return (
    <div className="flex items-center gap-2">
      {/* + Agregar item */}
      <AddInventoryItemButton propertyId={propertyId} />

      {/* Filter icon */}
      <div ref={filterRef} className="relative">
        <button
          type="button"
          aria-label="Filtrar por prioridad"
          onClick={() => {
            setFilterOpen((v) => !v);
            setGearOpen(false);
          }}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
            priorityFilter
              ? "border-neutral-800 bg-neutral-900 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 8h10M11 12h2" />
          </svg>
          {activeLabel && <span>{activeLabel}</span>}
        </button>

        {filterOpen && (
          <div className="absolute left-0 top-full mt-1 w-36 bg-white border border-neutral-200 rounded-xl shadow-lg z-30 overflow-hidden">
            {priorities.map(({ key, label }) => {
              const isActive = key === "ALL" ? !priorityFilter : priorityFilter === key;
              return (
                <a
                  key={key}
                  href={buildPriorityHref(key)}
                  onClick={() => setFilterOpen(false)}
                  className={`block px-4 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-neutral-900 text-white font-medium"
                      : "text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {label}
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Gear icon */}
      <div ref={gearRef} className="relative">
        <button
          type="button"
          aria-label="Más opciones"
          onClick={() => {
            setGearOpen((v) => !v);
            setFilterOpen(false);
          }}
          className="flex items-center justify-center rounded-lg border border-neutral-300 bg-white p-2 text-neutral-700 hover:bg-neutral-50 transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {gearOpen && (
          <div
            className="absolute right-0 top-full mt-1 w-52 bg-white border border-neutral-200 rounded-xl shadow-lg z-30 overflow-hidden divide-y divide-neutral-100"
            onClick={() => setGearOpen(false)}
          >
            <ApplyTemplateModal
              propertyId={propertyId}
              hasExistingInventory={hasExistingInventory}
              triggerClassName={MENU_ITEM_CLS}
            />
            {availableProperties.length > 0 && (
              <CopyInventoryModal
                propertyId={propertyId}
                propertyName={propertyName}
                availableProperties={availableProperties}
                triggerClassName={MENU_ITEM_CLS}
              />
            )}
            <ZonesManagementSection
              propertyId={propertyId}
              initialZones={propertyZones}
              triggerClassName={MENU_ITEM_CLS}
            />
          </div>
        )}
      </div>
    </div>
  );
}
