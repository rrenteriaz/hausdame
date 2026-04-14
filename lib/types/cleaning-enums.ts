/**
 * Tipos y constantes de enums relacionados con limpiezas.
 * Archivo puro — sin imports de Prisma.
 * Safe to import from both Server and Client Components.
 */

export const ChecklistArea = {
  SALA:        "SALA",
  COMEDOR:     "COMEDOR",
  COCINA:      "COCINA",
  HABITACIONES:"HABITACIONES",
  BANOS:       "BANOS",
  PATIO:       "PATIO",
  JARDIN:      "JARDIN",
  COCHERA:     "COCHERA",
  OTROS:       "OTROS",
} as const;
export type ChecklistArea = (typeof ChecklistArea)[keyof typeof ChecklistArea];

export const NotCompletedReasonCode = {
  NO_HABIA_INSUMOS:  "NO_HABIA_INSUMOS",
  NO_TUVE_ACCESO:    "NO_TUVE_ACCESO",
  SE_ROMPIO_O_FALLO: "SE_ROMPIO_O_FALLO",
  NO_HUBO_TIEMPO:    "NO_HUBO_TIEMPO",
  OTRO:              "OTRO",
} as const;
export type NotCompletedReasonCode = (typeof NotCompletedReasonCode)[keyof typeof NotCompletedReasonCode];
