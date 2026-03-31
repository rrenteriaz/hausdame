"use client";

import { useRef } from "react";
import InventoryCard, { InventoryCardRef } from "./InventoryCard";
import CompleteCleaningButton from "./CompleteCleaningButton";
import InventoryProblemsCard from "./InventoryProblemsCard";

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
  status: any;
  itemChanges: any[];
  reports: any[];
}

interface CleaningChecklistItem {
  id: string;
  title: string;
  isCompleted: boolean;
}

interface CleaningDetailClientProps {
  cleaningId: string;
  propertyId: string;
  review: InventoryReview | null;
  inventoryLines: InventoryLine[];
  checklistItems: CleaningChecklistItem[];
  returnTo: string;
  memberId?: string;
  cleaningStatus: string;
  tenantId: string;
}

export default function CleaningDetailClient({
  cleaningId,
  propertyId,
  review,
  inventoryLines,
  checklistItems,
  returnTo,
  memberId,
  cleaningStatus,
  tenantId,
}: CleaningDetailClientProps) {
  const inventoryCardRef = useRef<InventoryCardRef>(null);

  return (
    <>
      {/* Inventario - Solo mostrar si la limpieza está en progreso */}
      {cleaningStatus === "IN_PROGRESS" && (
        <>
          <InventoryProblemsCard cleaningId={cleaningId} returnTo={returnTo} />
          <InventoryCard
            ref={inventoryCardRef}
            cleaningId={cleaningId}
            propertyId={propertyId}
            review={review}
            inventoryLines={inventoryLines}
            returnTo={returnTo}
            memberId={memberId}
            tenantId={tenantId}
          />
        </>
      )}

      {/* Acciones - Solo mostrar si está en progreso */}
      {cleaningStatus === "IN_PROGRESS" && (
        <section className="p-4">
          <CompleteCleaningButton
            cleaningId={cleaningId}
            checklistItems={checklistItems}
            returnTo={returnTo}
            inventoryCardRef={inventoryCardRef}
          />
        </section>
      )}
    </>
  );
}

