/**
 * ServiceType — dominio Tareas Pro
 *
 * Representa el origen/tipo de un TaskJob sin necesidad de un campo
 * adicional en BD: se deriva de los datos existentes (cleaningId, occurrenceKey).
 *
 * Tipos actuales:
 *   CLEANING  — generado automáticamente al sincronizar una limpieza (cleaningId ≠ null)
 *   MANUAL    — generado manualmente desde la UI del host (cleaningId = null)
 *   RECURRING — planificado por schedule (aún no implementado; reservado para Fase 2)
 */
export enum ServiceType {
  CLEANING = "CLEANING",
  MANUAL = "MANUAL",
  RECURRING = "RECURRING",
}

/** Derivar ServiceType a partir de campos persistidos del job. */
export function getServiceType(job: {
  cleaningId: string | null;
  occurrenceKey: string;
}): ServiceType {
  if (job.cleaningId !== null) return ServiceType.CLEANING;
  if (job.occurrenceKey.startsWith("schedule:")) return ServiceType.RECURRING;
  return ServiceType.MANUAL;
}

export function isCleaningService(serviceType: ServiceType): boolean {
  return serviceType === ServiceType.CLEANING;
}

export function isRecurringService(serviceType: ServiceType): boolean {
  return serviceType === ServiceType.RECURRING;
}

export function isManualService(serviceType: ServiceType): boolean {
  return serviceType === ServiceType.MANUAL;
}

/**
 * Determina si un step con la frecuencia dada debe incluirse en un job.
 *
 * Reglas (v2 — modelo simplificado con periodicidad a nivel de tarea):
 *   stepFrequency null         → "Siempre" — incluido en cualquier job
 *   stepFrequency PER_CHECKOUT → solo en jobs de tipo CLEANING
 *   stepFrequency WEEKLY/MONTHLY/DAILY → nunca en jobs normales;
 *     estas tareas son periódicas y se ejecutan vía asignación de TaskRecurringDue
 */
export function stepAppliesToJob(
  stepFrequency: string | null,
  serviceType: ServiceType,
): boolean {
  // "Siempre" — sin restricción
  if (stepFrequency === null) return true;

  // PER_CHECKOUT solo aplica a limpiezas
  if (stepFrequency === "PER_CHECKOUT") return isCleaningService(serviceType);

  // WEEKLY / MONTHLY / DAILY — periódicas, excluidas de jobs normales
  return false;
}
