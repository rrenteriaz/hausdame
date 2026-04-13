// lib/tareas-pro/sync-for-cleaning.ts
import prisma from "@/lib/prisma";
import { generateTaskJob, buildOccurrenceKey } from "./job-generation";

/**
 * Sincroniza los TaskJobs de una limpieza con los templates activos de la propiedad.
 *
 * Comportamiento:
 * - PENDING: genera si no existe; regenera si el template cambió Y el job no tiene trabajo real.
 * - IN_PROGRESS: solo genera si no existe; nunca toca un job ya iniciado (snapshot congelado).
 *
 * Detección de cambio: compara job.createdAt contra updatedAt de template,
 * secciones y pasos — cubre toda la jerarquía de contenido.
 *
 * Salvaguarda: no regenera si algún paso del job tiene status !== "PENDING"
 * (respuestas existentes aunque el job siga en PENDING).
 *
 * Es idempotente: puede llamarse en cada render del detalle de limpieza.
 *
 * ── DEUDA TÉCNICA CONOCIDA (V1) ──────────────────────────────────────────────
 *
 * 1. ATOMICIDAD PARCIAL
 *    El bloque deleteMany + generateTaskJob no está envuelto en una transacción
 *    real. Si el proceso falla entre el delete y la creación de secciones/pasos,
 *    el job puede quedar huérfano (creado pero vacío).
 *    Solución futura: refactorizar generateTaskJob para aceptar un segundo
 *    parámetro `tx?: Prisma.TransactionClient` y envolver todo en
 *    prisma.$transaction(async (tx) => { deleteMany(..., tx); generateTaskJob(..., tx); }).
 *
 * 2. PROXY DE SNAPSHOT CON job.createdAt
 *    Se usa job.createdAt como referencia de "cuándo fue tomado el snapshot".
 *    Limitación: si el job es regenerado por razones distintas al cambio de
 *    template (ej. carry-forward inject), createdAt se resetea y las
 *    comparaciones futuras pueden dar falsos positivos o negativos.
 *    Solución futura: agregar campo `templateSyncedAt DateTime?` en TaskJob
 *    y actualizarlo explícitamente en cada sync. Migración no destructiva.
 *
 * 3. REGENERACIÓN NO ATÓMICA BAJO CONCURRENCIA ALTA
 *    La idempotencia está garantizada por occurrenceKey unique + catch P2002
 *    en generateTaskJob. Sin embargo, dos procesos concurrentes pueden ambos
 *    pasar el guard de "template cambió", ambos hacer deleteMany (el segundo
 *    es no-op) y ambos llamar generateTaskJob (el segundo devuelve el existente).
 *    El resultado es correcto pero ineficiente. Con el refactor de tx (punto 1)
 *    esto quedaría cubierto por el lock implícito de la transacción.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function syncTaskJobsForCleaning({
  tenantId,
  propertyId,
  cleaningId,
  cleaningStatus,
  actorId,
}: {
  tenantId: string;
  propertyId: string;
  cleaningId: string;
  cleaningStatus: string;
  actorId: string;
}): Promise<void> {
  const templates = await prisma.taskTemplate.findMany({
    where: { tenantId, propertyId, status: "ACTIVE" },
    select: {
      id: true,
      updatedAt: true,
      sections: {
        select: {
          updatedAt: true,
          steps: { select: { updatedAt: true } },
        },
      },
    },
  });

  if (templates.length === 0) return;

  for (const template of templates) {
    const occurrenceKey = buildOccurrenceKey({
      templateId: template.id,
      propertyId,
      cleaningId,
    });

    const existingJob = await prisma.taskJob.findUnique({
      where: { tenantId_occurrenceKey: { tenantId, occurrenceKey } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        sections: {
          select: {
            steps: { select: { status: true } },
          },
        },
      },
    });

    if (!existingJob) {
      // No job → generar siempre
      const newJob = await generateTaskJob({
        tenantId,
        templateId: template.id,
        propertyId,
        cleaningId,
        actorId,
      });
      // Si la limpieza ya está en progreso, activar el job inmediatamente
      if (cleaningStatus === "IN_PROGRESS") {
        await prisma.taskJob.update({
          where: { id: newJob.id },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        });
        await (await import("./event-log")).logTaskEvent({
          tenantId,
          jobId: newJob.id,
          eventType: "STARTED",
          actorId,
        });
      }
      continue;
    }

    // Job ya iniciado → snapshot congelado, no tocar
    if (existingJob.status !== "PENDING") continue;

    // Limpieza IN_PROGRESS con job PENDING → transicionar el job automáticamente
    // El cleaner inició la limpieza, por lo tanto el job debe activarse también
    if (cleaningStatus === "IN_PROGRESS") {
      await prisma.taskJob.update({
        where: { id: existingJob.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      await (await import("./event-log")).logTaskEvent({
        tenantId,
        jobId: existingJob.id,
        eventType: "STARTED",
        actorId,
      });
      continue;
    }

    // Salvaguarda: si algún paso ya tiene actividad, no regenerar
    const hasAnyStepActivity = existingJob.sections.some((s) =>
      s.steps.some((step) => step.status !== "PENDING")
    );
    if (hasAnyStepActivity) continue;

    // Detectar cambio en la jerarquía completa del template
    const jobCreatedAt = existingJob.createdAt;

    const templateChanged = template.updatedAt > jobCreatedAt;
    const sectionChanged = template.sections.some((s) => s.updatedAt > jobCreatedAt);
    const stepChanged = template.sections.some((s) =>
      s.steps.some((step) => step.updatedAt > jobCreatedAt)
    );

    if (!templateChanged && !sectionChanged && !stepChanged) continue;

    // Template modificado + job sin trabajo → eliminar y regenerar
    // deleteMany en lugar de delete: si un proceso concurrente ya eliminó el job,
    // esta operación no lanza error (safe under concurrency)
    await prisma.taskJob.deleteMany({ where: { id: existingJob.id } });
    await generateTaskJob({
      tenantId,
      templateId: template.id,
      propertyId,
      cleaningId,
      actorId,
    });
  }
}
