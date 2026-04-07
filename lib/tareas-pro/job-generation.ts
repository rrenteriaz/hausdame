// lib/tareas-pro/job-generation.ts
import prisma from "@/lib/prisma";
import { Prisma } from "../generated/prisma";
import { logTaskEvent } from "./event-log";
import { injectCarryForwards } from "./carry-forward";

// ---- Helpers de occurrenceKey ----

/**
 * Construye un occurrenceKey determinista o explícitamente marcado.
 *
 * - cleaning:{cleaningId}:{templateId}  → determinista, para jobs ligados a una limpieza
 * - schedule:{templateId}:{propertyId}:{yyyy-mm-dd} → para generación por schedule
 * - manual:{templateId}:{isoTimestamp}  → para generación manual desde UI (única por invocación)
 */
export function buildOccurrenceKey(params: {
  templateId: string;
  propertyId: string;
  cleaningId?: string;
  mode?: "manual" | "schedule";
  scheduleDate?: string; // yyyy-mm-dd
}): string {
  if (params.cleaningId) {
    // Determinista: un único job por cleaning + template
    return `cleaning:${params.cleaningId}:${params.templateId}`;
  }
  if (params.mode === "schedule" && params.scheduleDate) {
    return `schedule:${params.templateId}:${params.propertyId}:${params.scheduleDate}`;
  }
  // Manual: única por invocación, pero marcada explícitamente
  return `manual:${params.templateId}:${new Date().toISOString()}`;
}

/**
 * Genera un TaskJob desde un template.
 *
 * Idempotencia: si ya existe un job con el mismo tenantId + occurrenceKey,
 * retorna ese job existente sin crear uno nuevo.
 *
 * Toma snapshot completo de secciones y pasos.
 * Inyecta automáticamente carry-forwards OPEN de la propiedad.
 */
export async function generateTaskJob({
  tenantId,
  templateId,
  propertyId,
  cleaningId,
  assignedUserId,
  actorId,
  occurrenceKeyOverride,
}: {
  tenantId: string;
  templateId: string;
  propertyId: string;
  cleaningId?: string;
  assignedUserId?: string;
  actorId: string;
  /** Permite al caller pasar una clave ya construida (p.ej. desde schedule). */
  occurrenceKeyOverride?: string;
}) {
  const template = await prisma.taskTemplate.findFirst({
    where: { id: templateId, tenantId, propertyId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          steps: {
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!template) throw new Error("Template no encontrado");
  if (template.status !== "ACTIVE") throw new Error("Template no está activo");

  const occurrenceKey =
    occurrenceKeyOverride ??
    buildOccurrenceKey({ templateId, propertyId, cleaningId });

  // ---- Idempotencia nivel 1: búsqueda previa (evita el create en el caso habitual) ----
  const existing = await prisma.taskJob.findUnique({
    where: { tenantId_occurrenceKey: { tenantId, occurrenceKey } },
  });
  if (existing) {
    return existing;
  }

  // ---- Idempotencia nivel 2: captura colisión por @@unique en carrera concurrente ----
  let job: Awaited<ReturnType<typeof prisma.taskJob.create>>;
  try {
    job = await prisma.taskJob.create({
      data: {
        tenantId,
        propertyId,
        templateId,
        cleaningId: cleaningId ?? null,
        assignedUserId: assignedUserId ?? null,
        status: "PENDING",
        occurrenceKey,
        templateNameSnapshot: template.name,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Colisión de unique constraint: otro proceso ganó la carrera — retornar el job existente
      const raceWinner = await prisma.taskJob.findUnique({
        where: { tenantId_occurrenceKey: { tenantId, occurrenceKey } },
      });
      if (raceWinner) return raceWinner;
    }
    throw err;
  }

  // Crear secciones con snapshot
  for (const section of template.sections) {
    const jobSection = await prisma.taskJobSection.create({
      data: {
        tenantId,
        jobId: job.id,
        templateSectionId: section.id,
        nameSnapshot: section.name,
        sectionTypeSnapshot: section.sectionType,
        requiresGlobalConfirmSnapshot: section.requiresGlobalConfirm,
        order: section.order,
        status: "PENDING",
        isCarryForwardInjected: false,
      },
    });

    // Crear pasos con snapshot
    for (const step of section.steps) {
      await prisma.taskJobStep.create({
        data: {
          tenantId,
          sectionId: jobSection.id,
          templateStepId: step.id,
          nameSnapshot: step.name,
          descriptionSnapshot: step.description ?? null,
          responseTypeSnapshot: step.responseType,
          isRequiredSnapshot: step.isRequired,
          blocksCompletionSnapshot: step.blocksCompletion,
          order: step.order,
          status: "PENDING",
        },
      });
    }
  }

  // Inyectar carry-forwards OPEN de esta propiedad
  await injectCarryForwards(job.id, tenantId, propertyId);

  // Log CREATED
  await logTaskEvent({
    tenantId,
    jobId: job.id,
    eventType: "CREATED",
    actorId,
    metadata: { templateId, propertyId, occurrenceKey },
  });

  return job;
}
