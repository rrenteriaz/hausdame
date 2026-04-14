import {
  InventoryReviewStatus,
  InventoryChangeReason,
  InventoryReportType,
  InventoryReportSeverity,
} from "@/lib/inventory-constants";

export interface InventoryEvidenceView {
  id: string;
  assetId: string;
  url: string;
  variant?: string | null;
}

export interface InventoryReport {
  id: string;
  itemId: string;
  inventoryLineId?: string | null;
  type: InventoryReportType;
  severity: InventoryReportSeverity;
  description: string | null;
  status: string;
  evidence?: InventoryEvidenceView[];
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
