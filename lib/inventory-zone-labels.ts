import { PropertyZoneOperationalCategory } from "@prisma/client";

export const OPERATIONAL_CATEGORY_LABELS: Record<PropertyZoneOperationalCategory, string> = {
  BEDROOM:  "Dormitorio",
  BATHROOM: "Baño",
  KITCHEN:  "Cocina",
  SOCIAL:   "Sala",
  DINING:   "Comedor",
  ENTRY:    "Entrada",
  LAUNDRY:  "Lavandería",
  OUTDOOR:  "Exterior",
  STORAGE:  "Almacén",
  OTHER:    "Otro",
};

export const OPERATIONAL_CATEGORY_OPTIONS = Object.entries(
  OPERATIONAL_CATEGORY_LABELS
) as [PropertyZoneOperationalCategory, string][];
