/**
 * Centralized constants and types for Inventory to be used in client components
 * without triggering Prisma runtime bundling issues.
 * These correspond exactly to the Prisma schema enums.
 */

export const InventoryReviewStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  RESOLVED: "RESOLVED",
} as const;

export type InventoryReviewStatus = typeof InventoryReviewStatus[keyof typeof InventoryReviewStatus];

export const InventoryChangeReason = {
  ROUTINE_COUNT: "ROUTINE_COUNT",
  PREVIOUS_ERROR: "PREVIOUS_ERROR",
  DAMAGED: "DAMAGED",
  REPLACED: "REPLACED",
  LOST: "LOST",
  MOVED: "MOVED",
  OTHER: "OTHER",
} as const;

export type InventoryChangeReason = typeof InventoryChangeReason[keyof typeof InventoryChangeReason];

export const InventoryChangeStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  APPLIED: "APPLIED",
} as const;

export type InventoryChangeStatus = typeof InventoryChangeStatus[keyof typeof InventoryChangeStatus];

export const InventoryReportType = {
  DAMAGED_WORKS: "DAMAGED_WORKS",
  DAMAGED_NOT_WORKING: "DAMAGED_NOT_WORKING",
  MISSING_PHYSICAL: "MISSING_PHYSICAL",
  REPLACED_DIFFERENT: "REPLACED_DIFFERENT",
  DETAILS_MISMATCH: "DETAILS_MISMATCH",
  OTHER: "OTHER",
} as const;

export type InventoryReportType = typeof InventoryReportType[keyof typeof InventoryReportType];

export const InventoryReportSeverity = {
  URGENT: "URGENT",
  IMPORTANT: "IMPORTANT",
  INFO: "INFO",
} as const;

export type InventoryReportSeverity = typeof InventoryReportSeverity[keyof typeof InventoryReportSeverity];

export const InventoryReportStatus = {
  PENDING: "PENDING",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
  REJECTED: "REJECTED",
} as const;

export type InventoryReportStatus = typeof InventoryReportStatus[keyof typeof InventoryReportStatus];

export const InventoryReportResolution = {
  REPAIR: "REPAIR",
  KEEP_USING: "KEEP_USING",
  REPLACE_AND_DISCARD: "REPLACE_AND_DISCARD",
  DISCARD: "DISCARD",
  STORE: "STORE",
  MARK_LOST: "MARK_LOST",
  UPDATE_ITEM_TO_NEW: "UPDATE_ITEM_TO_NEW",
  MARK_TO_REPLACE: "MARK_TO_REPLACE",
  DEEP_CLEAN: "DEEP_CLEAN",
} as const;

export type InventoryReportResolution = typeof InventoryReportResolution[keyof typeof InventoryReportResolution];

export const InventoryCategory = {
  FURNITURE_EQUIPMENT: "FURNITURE_EQUIPMENT",
  LINENS: "LINENS",
  TABLEWARE_UTENSILS: "TABLEWARE_UTENSILS",
  DECOR: "DECOR",
  KITCHEN_ACCESSORIES: "KITCHEN_ACCESSORIES",
  KEYS_ACCESS: "KEYS_ACCESS",
  CONSUMABLES: "CONSUMABLES",
  SECURITY: "SECURITY",
  ELECTRICAL_APPLIANCE: "ELECTRICAL_APPLIANCE",
  OTHER: "OTHER",
} as const;

export type InventoryCategory = typeof InventoryCategory[keyof typeof InventoryCategory];

export const InventoryCondition = {
  NEW: "NEW",
  USED_LT_1Y: "USED_LT_1Y",
  USED_GT_1Y: "USED_GT_1Y",
} as const;

export type InventoryCondition = typeof InventoryCondition[keyof typeof InventoryCondition];

export const InventoryPriority = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type InventoryPriority = typeof InventoryPriority[keyof typeof InventoryPriority];

export const PropertyZoneOperationalCategory = {
  BEDROOM: "BEDROOM",
  BATHROOM: "BATHROOM",
  KITCHEN: "KITCHEN",
  SOCIAL: "SOCIAL",
  DINING: "DINING",
  ENTRY: "ENTRY",
  LAUNDRY: "LAUNDRY",
  OUTDOOR: "OUTDOOR",
  STORAGE: "STORAGE",
  OTHER: "OTHER",
} as const;

export type PropertyZoneOperationalCategory = typeof PropertyZoneOperationalCategory[keyof typeof PropertyZoneOperationalCategory];

export const ChecklistArea = {
  SALA: "SALA",
  COMEDOR: "COMEDOR",
  COCINA: "COCINA",
  HABITACIONES: "HABITACIONES",
  BANOS: "BANOS",
  PATIO: "PATIO",
  JARDIN: "JARDIN",
  COCHERA: "COCHERA",
  OTROS: "OTROS",
} as const;

export type ChecklistArea = typeof ChecklistArea[keyof typeof ChecklistArea];
