import {
  InventoryReviewStatus,
  InventoryChangeReason,
  InventoryReportType,
  InventoryReportSeverity,
} from "@prisma/client";

export interface InventoryReportEvidence {
  id: string;
  asset?: { id: string; publicUrl: string | null } | null;
}

export interface InventoryReport {
  id: string;
  itemId: string;
  inventoryLineId?: string | null;
  type: InventoryReportType;
  severity: InventoryReportSeverity;
  description: string | null;
  status: string;
  evidence?: InventoryReportEvidence[];
}

export interface InventoryReviewItemChange {
  id: string;
  itemId: string;
  inventoryLineId?: string | null;
  quantityBefore: number;
  quantityAfter: number;
  reason: InventoryChangeReason;
  reasonOtherText: string | null;
  note: string | null;
  status: string;
}

export interface InventoryReview {
  id: string;
  status: InventoryReviewStatus;
  itemChanges: InventoryReviewItemChange[];
  reports: InventoryReport[];
}
