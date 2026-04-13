/**
 * GET /api/cron/generate-scheduled-jobs
 *
 * Genera obligaciones periódicas (TaskRecurringDue) para templates con
 * frecuencia programada (DAILY/WEEKLY/MONTHLY).
 * Debe ejecutarse una vez al día vía cron externo (ej. Vercel Cron, cron-job.org).
 *
 * Seguridad:
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * Idempotencia:
 *   Seguro ejecutarse múltiples veces el mismo día — no duplica obligaciones.
 *   Usa advisory lock para evitar ejecuciones concurrentes solapadas.
 *
 * Separación de responsabilidades:
 *   Este cron genera obligaciones periódicas (TaskRecurringDue).
 *   Los jobs de limpieza (cleaning:*) los maneja sync-for-cleaning.ts.
 *   La ejecución de tareas periódicas ocurre dentro de limpiezas reales.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateRecurringDuesForAll, generateRecurringDuesForSteps } from "@/lib/tareas-pro/scheduled-job-generator";

/** Lock ID estable derivado de "hausdame_scheduled_jobs_cron_v1" */
const LOCK_ID = 947312085;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim() === "") return false;
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7).trim() === secret;
}

async function tryLock(): Promise<boolean> {
  const rows = await prisma.$queryRaw<[{ locked: boolean }]>`
    SELECT pg_try_advisory_lock(${LOCK_ID}) as locked
  `;
  return rows[0]?.locked === true;
}

async function releaseLock(): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT pg_advisory_unlock(${LOCK_ID})`;
  } catch (err) {
    console.error("[cron][scheduled-jobs] Error releasing lock:", err);
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const acquired = await tryLock();
  if (!acquired) {
    console.log("[cron][scheduled-jobs] skipped — lock held");
    return NextResponse.json({ ok: true, skipped: true, reason: "lock_held" });
  }

  const startAt = Date.now();
  console.log("[cron][scheduled-jobs] start", { ts: new Date().toISOString() });

  try {
    // Template-level: templates con frecuencia periódica global (modelo legacy)
    const templateResult = await generateRecurringDuesForAll();
    // Step-level: pasos individuales con su propia cadencia (modelo recomendado)
    const stepResult = await generateRecurringDuesForSteps();

    const result = {
      processed: templateResult.processed + stepResult.processed,
      created: templateResult.created + stepResult.created,
      skipped: templateResult.skipped + stepResult.skipped,
      errors: templateResult.errors + stepResult.errors,
      templateLevel: templateResult,
      stepLevel: stepResult,
    };
    const durationMs = Date.now() - startAt;

    console.log("[cron][scheduled-jobs] done", { ...result, durationMs });
    return NextResponse.json({ ok: true, ...result, durationMs });
  } catch (err: any) {
    console.error("[cron][scheduled-jobs] fatal error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Unknown error" },
      { status: 500 },
    );
  } finally {
    await releaseLock();
  }
}
