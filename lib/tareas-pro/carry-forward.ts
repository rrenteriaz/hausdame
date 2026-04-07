// lib/tareas-pro/carry-forward.ts 
import prisma from "@/lib/prisma";
import { logTaskEvent } from "./event-log";
import { TaskStepResponseType } from "../generated/prisma";

// ---- Tipos del snapshot ----

interface StepSnapshot {
  nameSnapshot: string;
  descriptionSnapshot: string | null;
  responseTypeSnapshot: TaskStepResponseType;
  isRequiredSnapshot: boolean;
  blocksCompletionSnapshot: boolean;
  order: number;
}

interface CarryForwardContextSnapshot {
  sectionName: string;
  sectionType: string;
  requiresGlobalConfirm: boolean;
  order: number;
  reason: string | null;
  /** Pasos capturados al momento del diferimiento. Puede estar ausente en CFs legacy. */
  steps?: StepSnapshot[];
}

// ---- Inyección ----

/**
 * Inyecta TaskCarryForwards OPEN en un nuevo job.
 * Crea la TaskJobSection inyectada Y sus TaskJobStep desde el snapshot.
 * Respeta maxAttempts si policy = LIMITED.
 */
export async function injectCarryForwards(
  jobId: string,
  tenantId: string,
  propertyId: string
) {
  const openCarryForwards = await prisma.taskCarryForward.findMany({
    where: { tenantId, propertyId, status: "OPEN" },
  });

  for (const cf of openCarryForwards) {
    // Anti-loop: si política LIMITED y ya superó intentos máximos, expirar
    if (cf.policy === "LIMITED" && cf.currentAttempt >= cf.maxAttempts) {
      await prisma.taskCarryForward.update({
        where: { id: cf.id },
        data: { status: "EXPIRED" },
      });
      continue;
    }

    const snapshot = cf.contextSnapshot as unknown as CarryForwardContextSnapshot;

    // Crear sección inyectada
    const injectedSection = await prisma.taskJobSection.create({
      data: {
        tenantId,
        jobId,
        templateSectionId: "carry-forward",
        nameSnapshot: `[Pendiente anterior] ${snapshot.sectionName}`,
        sectionTypeSnapshot: (snapshot.sectionType as any) ?? "STANDARD",
        requiresGlobalConfirmSnapshot: snapshot.requiresGlobalConfirm ?? false,
        order: 9999 + cf.currentAttempt,
        status: "PENDING",
        isCarryForwardInjected: true,
        carryForwardId: cf.id,
      },
    });

    // Recrear los pasos desde el snapshot (si existen — compatibilidad con CFs legacy)
    if (snapshot.steps && snapshot.steps.length > 0) {
      for (const stepSnap of snapshot.steps) {
        await prisma.taskJobStep.create({
          data: {
            tenantId,
            sectionId: injectedSection.id,
            templateStepId: "carry-forward",
            nameSnapshot: stepSnap.nameSnapshot,
            descriptionSnapshot: stepSnap.descriptionSnapshot,
            responseTypeSnapshot: stepSnap.responseTypeSnapshot,
            isRequiredSnapshot: stepSnap.isRequiredSnapshot,
            blocksCompletionSnapshot: stepSnap.blocksCompletionSnapshot,
            order: stepSnap.order,
            status: "PENDING",
          },
        });
      }
    }

    // Marcar carry-forward como INJECTED y acumular intento
    await prisma.taskCarryForward.update({
      where: { id: cf.id },
      data: {
        status: "INJECTED",
        currentAttempt: { increment: 1 },
      },
    });

    await logTaskEvent({
      tenantId,
      jobId,
      eventType: "CARRY_FORWARD_INJECTED",
      metadata: {
        carryForwardId: cf.id,
        sectionName: snapshot.sectionName,
        stepsInjected: snapshot.steps?.length ?? 0,
      },
    });
  }
}

// ---- Creación de carry-forward ----

/**
 * Crea un TaskCarryForward desde una sección DEFERRED.
 * Captura snapshot completo: metadatos de sección + todos sus pasos ejecutables.
 */
export async function createCarryForwardFromSection(
  tenantId: string,
  propertyId: string,
  jobId: string,
  sectionId: string,
  reason: string | null,
  policy: "UNLIMITED" | "LIMITED",
  maxAttempts: number
) {
  // Incluir steps para capturar snapshot completo
  const section = await prisma.taskJobSection.findUnique({
    where: { id: sectionId },
    include: {
      steps: { orderBy: { order: "asc" } },
    },
  });

  if (!section) throw new Error("Sección no encontrada");

  // Capturar snapshot de steps ejecutables (todos, incluidos los pendientes)
  const stepsSnapshot: StepSnapshot[] = (section.steps as any[]).map((step) => ({
    nameSnapshot: step.nameSnapshot,
    descriptionSnapshot: step.descriptionSnapshot,
    responseTypeSnapshot: step.responseTypeSnapshot,
    isRequiredSnapshot: step.isRequiredSnapshot,
    blocksCompletionSnapshot: step.blocksCompletionSnapshot,
    order: step.order,
  }));

  const contextSnapshot: CarryForwardContextSnapshot = {
    sectionName: section.nameSnapshot,
    sectionType: section.sectionTypeSnapshot,
    requiresGlobalConfirm: section.requiresGlobalConfirmSnapshot,
    order: section.order,
    reason,
    steps: stepsSnapshot,
  };

  const cf = await prisma.taskCarryForward.create({
    data: {
      tenantId,
      propertyId,
      sourceJobId: jobId,
      status: "OPEN",
      policy,
      maxAttempts,
      currentAttempt: 0,
      reason,
      contextSnapshot: contextSnapshot as any,
    },
  });

  await logTaskEvent({
    tenantId,
    jobId,
    eventType: "CARRY_FORWARD_CREATED",
    metadata: {
      carryForwardId: cf.id,
      sectionId,
      stepsSnapshotted: stepsSnapshot.length,
    },
  });

  return cf;
}
