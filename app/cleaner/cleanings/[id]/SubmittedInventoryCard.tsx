"use client";

import { useState } from "react";
import { InventoryReviewStatus } from "@/lib/types/inventory-enums";
import InventoryReviewPanel from "./inventory-review/InventoryReviewPanel";

interface InventoryLine {
  id: string;
  area: string;
  expectedQty: number;
  variantKey: string | null;
  variantValue: string | null;
  item: {
    id: string;
    name: string;
    category: string;
  };
  allLines?: any[];
}

interface InventoryReview {
  id: string;
  status: InventoryReviewStatus;
  itemChanges: any[];
  reports: any[];
}

interface SubmittedInventoryCardProps {
  cleaningId: string;
  propertyId: string;
  review: InventoryReview | null;
  inventoryLines: InventoryLine[];
}

export default function SubmittedInventoryCard({
  cleaningId,
  propertyId,
  review,
  inventoryLines,
}: SubmittedInventoryCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Solo mostrar si existe review y está SUBMITTED
  if (!review || review.status !== InventoryReviewStatus.SUBMITTED) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between hover:bg-neutral-50 transition"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-neutral-800">Inventario enviado</h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Enviado
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-neutral-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-0 border-t border-neutral-100">
          <InventoryReviewPanel
            cleaningId={cleaningId}
            propertyId={propertyId}
            initialReview={review}
            inventoryLines={inventoryLines}
            mode="report"
            onSubmitted={() => {}}
          />
        </div>
      )}
    </section>
  );
}

