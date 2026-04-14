"use client";

import { useState, useImperativeHandle, forwardRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  historyStats?: {
    totalCount: number;
    activeCount: number;
    resolvedCount: number;
    latestReport: {
      type: string;
      createdAt: Date;
      status: string;
      managerResolution: string | null;
    } | null;
  } | null;
}

interface InventoryReview {
  id: string;
  status: InventoryReviewStatus;
  itemChanges: any[];
  reports: any[];
}

interface InventoryCardProps {
  cleaningId: string;
  propertyId: string;
  review: InventoryReview | null;
  inventoryLines: InventoryLine[];
  returnTo?: string;
  memberId?: string;
  tenantId: string;
}

export interface InventoryCardRef {
  open: () => void;
}

const InventoryCard = forwardRef<InventoryCardRef, InventoryCardProps>(
  ({ cleaningId, propertyId, review, inventoryLines, returnTo, memberId, tenantId }, ref) => {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);

    useImperativeHandle(ref, () => ({
      open: () => setIsOpen(true),
    }));

    const isSubmitted = review?.status === InventoryReviewStatus.SUBMITTED;
    // Los cambios y reportes vienen del review completo si está disponible
    const changesCount = (review as any)?.itemChanges?.length || 0;
    const reportsCount = (review as any)?.reports?.length || 0;

    // Convertir review a formato completo para el panel
    const fullReview: InventoryReview | null = review
      ? {
          id: review.id,
          status: review.status,
          itemChanges: (review as any).itemChanges || [],
          reports: (review as any).reports || [],
        }
      : null;

    return (
      <section id="inventory-section" className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-4 flex items-center justify-between hover:bg-neutral-50 transition"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-neutral-800">Inventario</h3>
            <span className="text-xs text-neutral-500">
              ({inventoryLines.length} {inventoryLines.length === 1 ? "item" : "items"})
            </span>
            {isSubmitted ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Enviado
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                No enviado
              </span>
            )}
            {(changesCount > 0 || reportsCount > 0) && !isSubmitted && (
              <span className="text-xs text-neutral-500">
                • {changesCount} cambio{changesCount !== 1 ? "s" : ""} • {reportsCount} reporte{reportsCount !== 1 ? "s" : ""}
              </span>
            )}
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
          <div className="px-4 pb-4 pt-0 border-t border-neutral-100 space-y-3">
            {/* Botón para verificación rápida */}
            <Link
              href={`/cleaner/cleanings/${cleaningId}/inventory${
                returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
              }`}
              className="block w-full px-4 py-2 text-sm font-medium text-center bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition"
            >
              Verificar inventario rápidamente
            </Link>

            <InventoryReviewPanel
              cleaningId={cleaningId}
              propertyId={propertyId}
              initialReview={fullReview}
              inventoryLines={inventoryLines}
              returnTo={returnTo}
              tenantId={tenantId}
              mode="embedded"
              onSubmitted={() => {
                // Refrescar para actualizar el estado
                router.refresh();
              }}
            />
          </div>
        )}
      </section>
    );
  }
);

InventoryCard.displayName = "InventoryCard";

export default InventoryCard;

