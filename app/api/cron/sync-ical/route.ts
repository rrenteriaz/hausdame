/**
 * GET /api/cron/sync-ical
 * Cron endpoint para sincronización automática iCal.
 * Requiere Authorization: Bearer ${CRON_SECRET}
 * Usa advisory lock global para evitar ejecuciones solapadas.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncIcalForTenantBatch } from "@/lib/integrations/ical/sync";

const BATCH_SIZE =
  parseInt(process.env.ICAL_SYNC_BATCH_SIZE || "10", 10) || 10;

/** Lock ID estable (derivado de "hausdame_ical_cron_v1") */
const LOCK_ID = 817230192;

function getCronSecret(): string | null {
  return process.env.CRON_SECRET || null;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = getCronSecret();
  if (!secret || secret.trim() === "") return false;

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7).trim();
  return token === secret;
}

async function tryAcquireAdvisoryLock(): Promise<boolean> {
  const rows = await prisma.$queryRaw<[{ locked: boolean }]>`
    SELECT pg_try_advisory_lock(${LOCK_ID}) as locked
  `;
  return rows[0]?.locked === true;
}

async function releaseAdvisoryLock(): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT pg_advisory_unlock(${LOCK_ID})`;
  } catch (err) {
    console.error("[cron][ical] Failed to release advisory lock:", err);
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const locked = await tryAcquireAdvisoryLock();
  if (!locked) {
    console.log("[cron][ical] Skipped: lock already held by another run");
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "lock_held",
    });
  }

  try {
    const propertiesWithIcal = await prisma.property.findMany({
      where: {
        icalUrl: { not: null, gt: "" },
      },
      select: { tenantId: true },
      distinct: ["tenantId"],
    });

    const tenantIds = propertiesWithIcal.map((p) => p.tenantId);

    if (tenantIds.length === 0) {
      return NextResponse.json({
        ok: true,
        tenantsProcessed: 0,
        propertiesSynced: 0,
        skippedLocked: 0,
        skippedNotStale: 0,
        errors: 0,
      });
    }

    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    let propertiesSynced = 0;
    let skippedLocked = 0;
    let skippedNotStale = 0;
    let errors = 0;

    for (const tenant of tenants) {
      const result = await syncIcalForTenantBatch({
        tenantId: tenant.id,
        reason: "cron",
        limit: BATCH_SIZE,
      });
      propertiesSynced += result.synced;
      skippedLocked += result.skippedLocked;
      skippedNotStale += result.skippedNotStale;
      errors += result.errors;
    }

    return NextResponse.json({
      ok: true,
      tenantsProcessed: tenants.length,
      propertiesSynced,
      skippedLocked,
      skippedNotStale,
      errors,
    });
  } catch (err: any) {
    console.error("[cron][ical] Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message || "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    await releaseAdvisoryLock();
  }
}
