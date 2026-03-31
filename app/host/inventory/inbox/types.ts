import { InventoryReportResolution, InventoryReportSeverity } from "@prisma/client";

export interface InboxItem {
  type: "CHANGE" | "REPORT";
  id: string;
  itemId: string;
  itemName: string;
  itemThumbnail: string | null;
  property: string;
  propertyId: string | null;
  cleaningId: string | null;
  area: string | null;
  createdAt: Date;
  createdBy: string;
  // Para cambios
  quantityBefore?: number;
  quantityAfter?: number;
  reason?: string;
  reasonOtherText?: string | null;
  note?: string | null;
  status?: string;
  // Para reportes
  reportType?: string;
  severity?: InventoryReportSeverity;
  description?: string | null;
  managerResolution?: InventoryReportResolution | null;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  evidence?: Array<{
    id: string;
    url: string;
    variant?: string | null;
  }>;
  inventoryLineId: string | null;
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
