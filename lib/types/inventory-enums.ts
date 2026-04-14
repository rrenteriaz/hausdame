/**
 * Tipos y constantes de enums relacionados con inventario.
 * Archivo puro — sin imports de Prisma.
 * Safe to import from both Server and Client Components.
 */

export const InventoryReviewStatus = {
  DRAFT:     "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED:  "APPROVED",
  REJECTED:  "REJECTED",
  RESOLVED:  "RESOLVED",
} as const;
export type InventoryReviewStatus = (typeof InventoryReviewStatus)[keyof typeof InventoryReviewStatus];

export const InventoryChangeReason = {
  ROUTINE_COUNT:  "ROUTINE_COUNT",
  PREVIOUS_ERROR: "PREVIOUS_ERROR",
  DAMAGED:        "DAMAGED",
  REPLACED:       "REPLACED",
  LOST:           "LOST",
  MOVED:          "MOVED",
  OTHER:          "OTHER",
} as const;
export type InventoryChangeReason = (typeof InventoryChangeReason)[keyof typeof InventoryChangeReason];

export const InventoryReportType = {
  DAMAGED_WORKS:     "DAMAGED_WORKS",
  DAMAGED_NOT_WORKING:"DAMAGED_NOT_WORKING",
  MISSING_PHYSICAL:  "MISSING_PHYSICAL",
  REPLACED_DIFFERENT:"REPLACED_DIFFERENT",
  DETAILS_MISMATCH:  "DETAILS_MISMATCH",
  OTHER:             "OTHER",
} as const;
export type InventoryReportType = (typeof InventoryReportType)[keyof typeof InventoryReportType];

export const InventoryReportSeverity = {
  URGENT:    "URGENT",
  IMPORTANT: "IMPORTANT",
  INFO:      "INFO",
} as const;
export type InventoryReportSeverity = (typeof InventoryReportSeverity)[keyof typeof InventoryReportSeverity];

export const InventoryPriority = {
  HIGH:   "HIGH",
  MEDIUM: "MEDIUM",
  LOW:    "LOW",
} as const;
export type InventoryPriority = (typeof InventoryPriority)[keyof typeof InventoryPriority];

export type PropertyZoneOperationalCategory =
  | "BEDROOM"
  | "BATHROOM"
  | "KITCHEN"
  | "SOCIAL"
  | "DINING"
  | "ENTRY"
  | "LAUNDRY"
  | "OUTDOOR"
  | "STORAGE"
  | "OTHER";
