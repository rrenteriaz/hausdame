// lib/tareas-pro/job-generation.ts
import prisma from "@/lib/prisma";
import { Prisma } from "../generated/prisma";
import { logTaskEvent } from "./event-log";
import { injectCarryForwards } from "./carry-forward";
import { getServiceType, stepAppliesToJob } from "./domain/service-type";

// ---- Helpers de occurrenceKey ----

export function buildOccurrenceKey(params: {
  templateId: string;
  propertyId: string;
  cleaningId?: string;
  mode?: "manual" | "schedule";
  scheduleDate?: string;
}): string {
  if (params.cleaningId) {
    return `cleaning:${params.cleaningId}:${params.templateId}`;
  }
  if (params.mode === "schedule" && params.scheduleDate) {
    return `schedule:${params.templateId}:${params.propertyId}:${params.scheduleDate}`;
  }
  return `manual:${params.templateId}:${new Date().toISOString()}`;
}

/**
 * Genera un TaskJob desde un template.
 *
 * Filtrado por stepFrequency (v2 — modelo simplificado):
 * - null         → siempre incluida
 * - PER_CHECKOUT → solo en jobs de tipo CLEANING
 * - WEEKLY/MONTHLY/DAILY → excluidas; se ejecutan vía TaskRecurringDue
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
  occurrenceKeyOverride?: string;
}) {
  const template = await prisma.taskTemplate.findFirst({
    where: { id: templateId, tenantId, propertyId },
    include: {
      schedule: true,
      sections: {
        orderBy: { order: "asc" },
        include: {
          steps: { orderBy: { order: "asc" } },
        },
      },
    },
  });

  if (!template) throw new Error("Template no encontrado");
  if (template.status !== "ACTIVE") throw new Error("Template no está activo");

  const occurrenceKey =
    occurrenceKeyOverride ??
    buildOccurrenceKey({ templateId, propertyId, cleaningId });

  // ---- Idempotencia nivel 1 ----
  const existing = await prisma.taskJob.findUnique({
    where: { tenantId_occurrenceKey: { tenantId, occurrenceKey } },
  });
  if (existing) return existing;

  // ---- Idempotencia nivel 2: captura colisión concurrente ----
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
      const raceWinner = await prisma.taskJob.findUnique({
        where: { tenantId_occurrenceKey: { tenantId, occurrenceKey } },
      });
      if (raceWinner) return raceWinner;
    }
    throw err;
  }

  // ServiceType derivado de los datos persistidos (sin campo extra en BD)
  const serviceType = getServiceType({ cleaningId: cleaningId ?? null, occurrenceKey });

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

    for (const step of section.steps) {
      if (!stepAppliesToJob(step.stepFrequency, serviceType)) continue;

      await prisma.taskJobStep.create({
        data: {
          tenantId,
          sectionId: jobSection.id,
          templateStepId: step.id,
          nameSnapshot: step.name,
          descriptionSnapshot: step.description ?? null,
          capturesYesNoSnapshot: step.capturesYesNo,
          yesNoRequiredSnapshot: step.yesNoRequired,
          capturesNumberSnapshot: step.capturesNumber,
          numberRequiredSnapshot: step.numberRequired,
          capturesPhotoSnapshot: step.capturesPhoto,
          photoRequiredSnapshot: step.photoRequired,
          capturesTextSnapshot: step.capturesText,
          textRequiredSnapshot: step.textRequired,
          isRequiredSnapshot: step.isRequired,
          blocksCompletionSnapshot: step.blocksCompletion,
          order: step.order,
          status: "PENDING",
          snapshotVersion: step.captureVersion, // propagates template version to job step
        },
      });
    }
  }

  await injectCarryForwards(job.id, tenantId, propertyId);

  await logTaskEvent({
    tenantId,
    jobId: job.id,
    eventType: "CREATED",
    actorId,
    metadata: { templateId, propertyId, occurrenceKey },
  });

  return job;
}
