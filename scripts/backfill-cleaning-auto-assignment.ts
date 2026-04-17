/**
 * scripts/backfill-cleaning-auto-assignment.ts
 *
 * Backfill seguro: auto-asigna assignedMembershipId a limpiezas PENDING
 * que no tienen ejecutor pero sí teamId, usando la lógica canónica actual.
 *
 * SEGURIDAD:
 *   - Dry-run por defecto (--apply para escribir)
 *   - Solo toca: status=PENDING, assignedMembershipId=null, teamId!=null
 *   - Solo asigna cuando resolveAutoAssignment devuelve membership determinística
 *   - Pre-flight antes de cada escritura (verifica que el estado no cambió)
 *   - Idempotente: segunda ejecución no produce cambios adicionales
 *
 * Uso:
 *   npx tsx scripts/backfill-cleaning-auto-assignment.ts
 *   npx tsx scripts/backfill-cleaning-auto-assignment.ts --apply
 *   npx tsx scripts/backfill-cleaning-auto-assignment.ts --tenantId=<id>
 *   npx tsx scripts/backfill-cleaning-auto-assignment.ts --propertyId=<id>
 *   npx tsx scripts/backfill-cleaning-auto-assignment.ts --limit=100
 *   npx tsx scripts/backfill-cleaning-auto-assignment.ts --tenantId=<id> --apply
 */

import "dotenv/config";
import prisma from "../lib/prisma";
import { resolveAutoAssignment } from "../lib/cleanings/resolveAutoAssignment";
import { resolvePreferredExecutorForProperty } from "../lib/cleanings/resolvePreferredExecutorForProperty";

// ─── Args ──────────────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes("--apply");

const tenantIdArg  = process.argv.find((a) => a.startsWith("--tenantId="));
const TENANT_ID    = tenantIdArg?.split("=")[1];

const propertyIdArg = process.argv.find((a) => a.startsWith("--propertyId="));
const PROPERTY_ID   = propertyIdArg?.split("=")[1];

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT    = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

// ─── Tipos ─────────────────────────────────────────────────────────────────

type AssignmentReason = "preferred_executor" | "single_active_membership";

interface CandidateResult {
  cleaningId: string;
  tenantId: string;
  propertyId: string;
  propertyShortName: string | null;
  teamId: string;
  resolvedMembershipId: string;
  reason: AssignmentReason;
}

interface SkipResult {
  cleaningId: string;
  reason:
    | "already_assigned"
    | "status_not_eligible"
    | "no_team"
    | "no_membership"
    | "multiple_memberships_no_preference"
    | "resolve_error";
  detail?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function divider(label?: string) {
  const width = 64;
  if (!label) {
    console.log("─".repeat(width));
    return;
  }
  const inner = ` ${label} `;
  const pad = Math.max(0, Math.floor((width - inner.length) / 2));
  console.log("─".repeat(pad) + inner + "─".repeat(width - pad - inner.length));
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  divider("BACKFILL: AUTO-ASIGNACIÓN DE LIMPIEZAS");
  console.log(`Fecha   : ${new Date().toISOString()}`);
  console.log(`Modo    : ${DRY_RUN ? "DRY RUN — ningún dato será modificado" : "⚠️  APPLY — se escribirá en la base de datos"}`);
  if (TENANT_ID)  console.log(`Filtro tenant    : ${TENANT_ID}`);
  if (PROPERTY_ID) console.log(`Filtro property  : ${PROPERTY_ID}`);
  if (LIMIT)       console.log(`Límite           : ${LIMIT}`);
  console.log("");

  // ── 1. Cargar candidatas elegibles ─────────────────────────────────────

  const where: Record<string, any> = {
    status: "PENDING",
    assignedMembershipId: null,
    teamId: { not: null },
    ...(TENANT_ID   ? { tenantId:   TENANT_ID   } : {}),
    ...(PROPERTY_ID ? { propertyId: PROPERTY_ID } : {}),
  };

  const raw = await (prisma as any).cleaning.findMany({
    where,
    select: {
      id: true,
      tenantId: true,
      propertyId: true,
      teamId: true,
      status: true,
      assignedMembershipId: true,
      needsAttention: true,
      attentionReason: true,
      assignmentStatus: true,
      property: {
        select: {
          shortName: true,
          name: true,
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  const totalFetched: number = raw.length;

  divider("EVALUANDO LIMPIEZAS");
  console.log(`Limpiezas PENDING sin asignar con teamId: ${totalFetched}\n`);

  // ── 2. Evaluar cada cleaning ────────────────────────────────────────────

  const candidates: CandidateResult[] = [];
  const skips: SkipResult[] = [];

  for (const c of raw) {
    // Doble check por si el filtro SQL no fuera suficiente
    if (c.status !== "PENDING") {
      skips.push({ cleaningId: c.id, reason: "status_not_eligible", detail: c.status });
      continue;
    }
    if (c.assignedMembershipId !== null) {
      skips.push({ cleaningId: c.id, reason: "already_assigned" });
      continue;
    }
    if (!c.teamId) {
      skips.push({ cleaningId: c.id, reason: "no_team" });
      continue;
    }

    let result;
    try {
      result = await resolveAutoAssignment(c.propertyId, c.teamId);
    } catch (err: any) {
      skips.push({
        cleaningId: c.id,
        reason: "resolve_error",
        detail: err?.message ?? "unknown",
      });
      continue;
    }

    if (!result.assignedMembershipId) {
      // Determinar motivo específico de no resolución
      if (result.attentionReason === "NO_AVAILABLE_MEMBER") {
        skips.push({ cleaningId: c.id, reason: "no_membership", detail: "0 memberships activas" });
      } else {
        skips.push({
          cleaningId: c.id,
          reason: "multiple_memberships_no_preference",
          detail: "2+ activas, sin preferencia configurada",
        });
      }
      continue;
    }

    // Tiene resolución determinística — determinar razón para el reporte
    let reason: AssignmentReason;
    try {
      const preferred = await resolvePreferredExecutorForProperty(c.propertyId, c.teamId);
      reason = preferred?.membershipId === result.assignedMembershipId
        ? "preferred_executor"
        : "single_active_membership";
    } catch {
      reason = "single_active_membership";
    }

    const propertyShortName: string | null = c.property?.shortName ?? c.property?.name ?? null;

    candidates.push({
      cleaningId: c.id,
      tenantId: c.tenantId,
      propertyId: c.propertyId,
      propertyShortName,
      teamId: c.teamId,
      resolvedMembershipId: result.assignedMembershipId,
      reason,
    });
  }

  // ── 3. Reporte de candidatas ────────────────────────────────────────────

  divider("CANDIDATAS CON RESOLUCIÓN DETERMINÍSTICA");

  if (candidates.length === 0) {
    console.log("Ninguna limpieza puede ser auto-asignada con la lógica actual.\n");
  } else {
    const byReason = {
      preferred: candidates.filter((c) => c.reason === "preferred_executor"),
      single:    candidates.filter((c) => c.reason === "single_active_membership"),
    };

    console.log(`Total auto-asignables: ${candidates.length}`);
    console.log(`  → Por preferred executor         : ${byReason.preferred.length}`);
    console.log(`  → Por única membership activa    : ${byReason.single.length}`);
    console.log("");

    for (const c of candidates) {
      const reasonLabel =
        c.reason === "preferred_executor" ? "preferred" : "única membership";
      const propLabel = c.propertyShortName ?? c.propertyId;
      console.log(
        `  ${DRY_RUN ? "[would assign]" : "[assigned]"}  ${c.cleaningId}` +
        `  prop=${propLabel}  team=${c.teamId.slice(-8)}` +
        `  membership=${c.resolvedMembershipId.slice(-8)}  (${reasonLabel})`
      );
    }
    console.log("");
  }

  // ── 4. Aplicar (solo con --apply) ──────────────────────────────────────

  let applied = 0;
  let skippedConcurrency = 0;

  if (!DRY_RUN && candidates.length > 0) {
    divider("APLICANDO");

    for (const c of candidates) {
      // Pre-flight: verificar que el estado no cambió entre lectura y escritura
      const current = await (prisma as any).cleaning.findFirst({
        where: {
          id: c.cleaningId,
          status: "PENDING",
          assignedMembershipId: null,
          teamId: c.teamId,
        },
        select: { id: true },
      });

      if (!current) {
        console.log(`  [skipped/concurrencia] ${c.cleaningId} — estado cambió antes de escribir`);
        skippedConcurrency++;
        continue;
      }

      await (prisma as any).cleaning.update({
        where: { id: c.cleaningId },
        data: {
          assignedMembershipId: c.resolvedMembershipId,
          assignmentStatus: "ASSIGNED",
          needsAttention: false,
          attentionReason: null,
        },
      });

      console.log(
        `  [ok] ${c.cleaningId}  →  membership=${c.resolvedMembershipId.slice(-8)}  (${c.reason})`
      );
      applied++;
    }

    console.log("");
  }

  // ── 5. Reporte de omitidas ─────────────────────────────────────────────

  divider("RESUMEN DE OMITIDAS");

  const skipCounts = {
    already_assigned: 0,
    status_not_eligible: 0,
    no_team: 0,
    no_membership: 0,
    multiple_memberships_no_preference: 0,
    resolve_error: 0,
  };

  for (const s of skips) {
    skipCounts[s.reason]++;
  }

  console.log(`Ya asignadas (ignoradas correctamente)    : ${skipCounts.already_assigned}`);
  console.log(`Status no elegible (IN_PROGRESS/etc.)     : ${skipCounts.status_not_eligible}`);
  console.log(`Sin teamId                                 : ${skipCounts.no_team}`);
  console.log(`Sin memberships activas en el team         : ${skipCounts.no_membership}`);
  console.log(`2+ memberships, sin preferencia configurada: ${skipCounts.multiple_memberships_no_preference}`);
  console.log(`Error al resolver (ver detalle abajo)      : ${skipCounts.resolve_error}`);

  const errors = skips.filter((s) => s.reason === "resolve_error");
  if (errors.length > 0) {
    console.log("\n  Errores de resolución:");
    for (const e of errors) {
      console.log(`    • ${e.cleaningId}: ${e.detail}`);
    }
  }

  // ── 6. Resumen final ───────────────────────────────────────────────────

  divider("RESUMEN FINAL");
  console.log(`Limpiezas revisadas          : ${totalFetched}`);
  console.log(`Con resolución determinística: ${candidates.length}`);
  if (DRY_RUN) {
    console.log(`Actualizadas (dry-run)        : 0 — usar --apply para escribir`);
  } else {
    console.log(`Actualizadas en DB            : ${applied}`);
    console.log(`Omitidas por concurrencia     : ${skippedConcurrency}`);
  }
  console.log(`Omitidas (no elegibles)       : ${skips.length - skippedConcurrency}`);
  console.log("");

  if (DRY_RUN && candidates.length > 0) {
    console.log(
      `Para aplicar los cambios ejecuta:\n  npx tsx scripts/backfill-cleaning-auto-assignment.ts --apply\n`
    );
  }
  if (applied > 0) {
    console.log(`✅ ${applied} limpieza(s) actualizadas correctamente.`);
  }
  if (!DRY_RUN && candidates.length === 0) {
    console.log("✅ Nada que actualizar — base de datos ya alineada.");
  }
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("\n❌ Error fatal:", err);
    prisma.$disconnect();
    process.exit(1);
  });
