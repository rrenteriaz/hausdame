/**
 * scheduled-job-generator.ts
 *
 * Lógica core del scheduler de Tareas Pro.
 * Responsable de crear obligaciones operativas (TaskRecurringDue) de forma idempotente.
 *
 * ── Dos caminos de generación ─────────────────────────────────────────────
 *
 * 1. TEMPLATE-LEVEL (generateRecurringDuesForAll)
 *    Templates activos con frecuencia periódica en su schedule.
 *    Obligación a nivel de template completo (stepId = null).
 *    Idempotencia: periodKey = "daily:2024-04-10" | "weekly:2024-W15" | "monthly:2024-04"
 *    ← Modelo legacy. Soportado para templates existentes.
 *
 * 2. STEP-LEVEL (generateRecurringDuesForSteps)  ← MODELO RECOMENDADO
 *    Pasos de templates activos con stepFrequency + anchors propios.
 *    Obligación a nivel de paso individual (stepId = step.id).
 *    Idempotencia: periodKey = "step:{stepId}:weekly:2024-W15"
 *    Cada paso puede tener su propia cadencia dentro del mismo template.
 *
 * ── Sin acumulación ───────────────────────────────────────────────────────
 * Si ya existe obligación abierta (PENDING_ASSIGNMENT/ASSIGNED) para el mismo
 * template o paso, el período siguiente no crea otra hasta que se resuelva.
 *
 * ── Separación de responsabilidades ──────────────────────────────────────
 * Este módulo solo genera obligaciones periódicas.
 * Los jobs de limpieza los maneja syncTaskJobsForCleaning.
 */

import prisma from "@/lib/prisma";
import { shouldFireToday } from "./domain/schedule-anchor";

export type SchedulerResult = {
  processed: number;
  created: number;
  skipped: number;
  errors: number;
};

/**
 * TEMPLATE-LEVEL: genera obligaciones periódicas para templates activos con
 * frecuencia periódica en su schedule.
 *
 * @deprecated Modelo legacy. Los templates nuevos no deben usar DAILY/WEEKLY/MONTHLY
 * a nivel de template. Usar `generateRecurringDuesForSteps` para el modelo recomendado
 * donde cada tarea define su propia cadencia. Esta función se mantiene únicamente
 * para compatibilidad con templates que ya tienen periodicidad a nivel de template.
 */
export async function generateRecurringDuesForAll(now?: Date): Promise<SchedulerResult> {
  const templates = await prisma.taskTemplate.findMany({
    where: {
      status: "ACTIVE",
      schedule: {
        frequency: { in: ["DAILY", "WEEKLY", "MONTHLY"] },
      },
    },
    select: {
      id: true,
      tenantId: true,
      propertyId: true,
      schedule: {
        select: {
          frequency: true,
          anchorDayOfWeek: true,
          anchorDayOfMonth: true,
          timezone: true,
        },
      },
    },
  });

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const template of templates) {
    if (!template.schedule) {
      skipped++;
      continue;
    }

    processed++;

    const fire = shouldFireToday({
      frequency: template.schedule.frequency,
      anchorDayOfWeek: template.schedule.anchorDayOfWeek,
      anchorDayOfMonth: template.schedule.anchorDayOfMonth,
      timezone: template.schedule.timezone,
      now,
    });

    if (!fire.fires) {
      skipped++;
      continue;
    }

    const periodKey = fire.scheduleDate;

    try {
      const existingPeriod = await prisma.taskRecurringDue.findUnique({
        where: {
          tenantId_templateId_periodKey: {
            tenantId: template.tenantId,
            templateId: template.id,
            periodKey,
          },
        },
        select: { id: true },
      });
      if (existingPeriod) {
        skipped++;
        continue;
      }

      const openObligation = await prisma.taskRecurringDue.findFirst({
        where: {
          tenantId: template.tenantId,
          templateId: template.id,
          stepId: null, // solo obligaciones template-level
          status: { in: ["PENDING_ASSIGNMENT", "ASSIGNED"] },
        },
        select: { id: true },
      });
      if (openObligation) {
        skipped++;
        continue;
      }

      await prisma.taskRecurringDue.create({
        data: {
          tenantId: template.tenantId,
          propertyId: template.propertyId,
          templateId: template.id,
          frequency: template.schedule.frequency as any,
          periodKey,
          status: "PENDING_ASSIGNMENT",
        },
      });
      created++;
    } catch (err) {
      console.error("[recurring-dues] Error al generar obligación template-level:", {
        templateId: template.id,
        tenantId: template.tenantId,
        periodKey,
        err,
      });
      errors++;
    }
  }

  return { processed, created, skipped, errors };
}

/**
 * STEP-LEVEL: genera obligaciones periódicas para pasos individuales de templates activos
 * que tienen stepFrequency (WEEKLY/MONTHLY/DAILY) + anchors propios configurados.
 *
 * Este es el modelo correcto para el caso de uso:
 *   "Un template con pasos en distintas cadencias" (ej. semanal + mensual).
 */
export async function generateRecurringDuesForSteps(now?: Date): Promise<SchedulerResult> {
  // Buscar todos los pasos de templates ACTIVE con stepFrequency periódica
  const steps = await prisma.taskStepTemplate.findMany({
    where: {
      stepFrequency: { in: ["DAILY", "WEEKLY", "MONTHLY", "INTERVAL"] },
      section: {
        template: { status: "ACTIVE" },
      },
    },
    select: {
      id: true,
      tenantId: true,
      stepFrequency: true,
      stepAnchorDayOfWeek: true,
      stepAnchorDayOfMonth: true,
      intervalDays: true,
      startDate: true,
      section: {
        select: {
          template: {
            select: {
              id: true,
              propertyId: true,
              schedule: { select: { timezone: true } },
            },
          },
        },
      },
    },
  });

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const step of steps) {
    const freq = step.stepFrequency!;
    const template = step.section.template;
    const timezone = template.schedule?.timezone ?? null;

    // Validar configuración completa por tipo de frecuencia
    if (freq === "WEEKLY" && step.stepAnchorDayOfWeek === null) { skipped++; continue; }
    if (freq === "MONTHLY" && step.stepAnchorDayOfMonth === null) { skipped++; continue; }
    if (freq === "INTERVAL" && (!step.intervalDays || !step.startDate)) { skipped++; continue; }

    processed++;

    // ── INTERVAL: fire si (today - startDate) es múltiplo exacto de intervalDays ──
    let periodKey: string;

    if (freq === "INTERVAL") {
      const today = now ? new Date(now) : new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(step.startDate!);
      start.setHours(0, 0, 0, 0);
      if (today < start) { skipped++; continue; }
      const diffDays = Math.round((today.getTime() - start.getTime()) / 86_400_000);
      if (diffDays % step.intervalDays! !== 0) { skipped++; continue; }
      // periodKey diario único para INTERVAL
      const todayStr = today.toISOString().slice(0, 10);
      periodKey = `step:${step.id}:interval:${todayStr}`;
    } else {
      // WEEKLY / MONTHLY / DAILY — usa shouldFireToday
      // Guard: si startDate está configurada, no disparar antes de que llegue
      if ((freq === "WEEKLY" || freq === "MONTHLY") && step.startDate) {
        const today0 = now ? new Date(now) : new Date();
        today0.setHours(0, 0, 0, 0);
        const start = new Date(step.startDate);
        start.setHours(0, 0, 0, 0);
        if (today0 < start) { skipped++; continue; }
      }
      const fire = shouldFireToday({
        frequency: freq,
        anchorDayOfWeek: step.stepAnchorDayOfWeek,
        anchorDayOfMonth: step.stepAnchorDayOfMonth,
        timezone,
        now,
      });
      if (!fire.fires) { skipped++; continue; }
      periodKey = `step:${step.id}:${fire.scheduleDate}`;
    }

    // Step-level periodKey garantiza unicidad en el constraint

    try {
      // Idempotencia: ya existe obligación para este paso en este período exacto
      const existingPeriod = await prisma.taskRecurringDue.findUnique({
        where: {
          tenantId_templateId_periodKey: {
            tenantId: step.tenantId,
            templateId: template.id,
            periodKey,
          },
        },
        select: { id: true },
      });
      if (existingPeriod) {
        skipped++;
        continue;
      }

      // Sin acumulación: si ya hay una obligación abierta para este paso específico,
      // no crear otra hasta que se resuelva.
      const openObligation = await prisma.taskRecurringDue.findFirst({
        where: {
          tenantId: step.tenantId,
          stepId: step.id,
          status: { in: ["PENDING_ASSIGNMENT", "ASSIGNED"] },
        },
        select: { id: true },
      });
      if (openObligation) {
        skipped++;
        continue;
      }

      await prisma.taskRecurringDue.create({
        data: {
          tenantId: step.tenantId,
          propertyId: template.propertyId,
          templateId: template.id,
          stepId: step.id,
          frequency: freq as any,
          periodKey,
          status: "PENDING_ASSIGNMENT",
        },
      });
      created++;
    } catch (err) {
      console.error("[recurring-dues] Error al generar obligación step-level:", {
        stepId: step.id,
        templateId: template.id,
        tenantId: step.tenantId,
        periodKey,
        err,
      });
      errors++;
    }
  }

  return { processed, created, skipped, errors };
}
