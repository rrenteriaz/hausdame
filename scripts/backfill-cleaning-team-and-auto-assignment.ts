/**
 * scripts/backfill-cleaning-team-and-auto-assignment.ts
 *
 * Backfill seguro: rellena teamId y assignedMembershipId en limpiezas PENDING
 * que quedaron sin ejecutor porque la sincronización no pudo resolverlo en su momento.
 *
 * REUTILIZA lógica vigente del sistema:
 *   - resolveEffectiveTeamsForProperty  → cobertura real de team (WorkGroup → PropertyTeam)
 *   - resolveAutoAssignment             → selección de membership (preferred → único activo → OPEN)
 *
 * SEGURIDAD:
 *   - Dry-run por defecto (--apply para escribir)
 *   - Solo toca: status=PENDING, teamId=null, assignedMembershipId=null
 *   - Solo asigna team si la resolución es 100% determinística (exactamente 1 team activo)
 *   - Pre-flight antes de cada escritura
 *   - Idempotente: segunda ejecución no produce cambios adicionales
 *
 * Uso:
 *   npx tsx scripts/backfill-cleaning-team-and-auto-assignment.ts
 *   npx tsx scripts/backfill-cleaning-team-and-auto-assignment.ts --apply
 *   npx tsx scripts/backfill-cleaning-team-and-auto-assignment.ts --tenantId=<id>
 *   npx tsx scripts/backfill-cleaning-team-and-auto-assignment.ts --propertyId=<id>
 *   npx tsx scripts/backfill-cleaning-team-and-auto-assignment.ts --limit=100
 */

import "dotenv/config";
import prisma from "../lib/prisma";
import { resolveEffectiveTeamsForProperty } from "../lib/workgroups/resolveEffectiveTeamsForProperty";
import { resolveAutoAssignment }            from "../lib/cleanings/resolveAutoAssignment";

// ─── Args ───────────────────────────────────────────────────────────────────

const DRY_RUN     = !process.argv.includes("--apply");

const tenantIdArg  = process.argv.find((a) => a.startsWith("--tenantId="));
const TENANT_ID    = tenantIdArg?.split("=")[1];

const propertyIdArg = process.argv.find((a) => a.startsWith("--propertyId="));
const PROPERTY_ID   = propertyIdArg?.split("=")[1];

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT    = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

// ─── Tipos ──────────────────────────────────────────────────────────────────

type SkipReason =
  | "STATUS_NOT_PENDING"
  | "ALREADY_HAS_TEAM"
  | "ALREADY_HAS_ASSIGNEE"
  | "NO_TEAM_COVERAGE"
  | "MULTIPLE_TEAMS_NON_DETERMINISTIC"
  | "RESOLVE_ERROR"
  | "CONCURRENCY_CHANGED";

type ResolvedKind = "TEAM_ONLY" | "TEAM_AND_AUTO_ASSIGNEE";

interface CandidateResult {
  cleaningId: string;
  tenantId: string;
  propertyId: string;
  propertyLabel: string;
  teamId: string;
  teamSource: string;
  assignedMembershipId: string | null;
  kind: ResolvedKind;
}

interface SkipResult {
  cleaningId: string;
  reason: SkipReason;
  detail?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function divider(label?: string) {
  const width = 64;
  if (!label) { console.log("─".repeat(width)); return; }
  const inner = ` ${label} `;
  const pad   = Math.max(0, Math.floor((width - inner.length) / 2));
  console.log("─".repeat(pad) + inner + "─".repeat(width - pad - inner.length));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  divider("BACKFILL: TEAM + AUTO-ASIGNACIÓN DE LIMPIEZAS");
  console.log(`Fecha   : ${new Date().toISOString()}`);
  console.log(`Modo    : ${DRY_RUN ? "DRY RUN — ningún dato será modificado" : "⚠️  APPLY — se escribirá en la base de datos"}`);
  if (TENANT_ID)   console.log(`Filtro tenant   : ${TENANT_ID}`);
  if (PROPERTY_ID) console.log(`Filtro property : ${PROPERTY_ID}`);
  if (LIMIT)       console.log(`Límite          : ${LIMIT}`);
  console.log("");

  // ── 1. Cargar candidatas elegibles ────────────────────────────────────────

  const where: Record<string, any> = {
    status: "PENDING",
    teamId: null,
    assignedMembershipId: null,
    ...(TENANT_ID   ? { tenantId:   TENANT_ID   } : {}),
    ...(PROPERTY_ID ? { propertyId: PROPERTY_ID } : {}),
  };

  const raw = await (prisma as any).cleaning.findMany({
    where,
    select: {
      id:                   true,
      tenantId:             true,
      propertyId:           true,
      status:               true,
      teamId:               true,
      assignedMembershipId: true,
      propertyShortName:    true,
      propertyName:         true,
      scheduledDate:        true,
    },
    orderBy: { scheduledDate: "asc" },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  divider("EVALUANDO LIMPIEZAS");
  console.log(`Limpiezas PENDING sin teamId ni membershipId: ${raw.length}\n`);

  // ── 2. Pre-computar resolución de teams por (tenantId, propertyId) ────────
  //    Batching para evitar N+1 queries por propiedad.

  type TeamResolution = { teamIds: string[]; source: string };
  const teamResolutionCache = new Map<string, TeamResolution>();

  const uniquePairs: Array<{ tenantId: string; propertyId: string }> = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const key = `${c.tenantId}::${c.propertyId}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePairs.push({ tenantId: c.tenantId, propertyId: c.propertyId });
    }
  }

  for (const pair of uniquePairs) {
    const key = `${pair.tenantId}::${pair.propertyId}`;
    try {
      const result = await resolveEffectiveTeamsForProperty(pair.tenantId, pair.propertyId);
      teamResolutionCache.set(key, { teamIds: result.teamIds, source: result.source });
    } catch (err: any) {
      teamResolutionCache.set(key, { teamIds: [], source: "ERROR:" + (err?.message ?? "unknown") });
    }
  }

  // ── 3. Evaluar cada cleaning ──────────────────────────────────────────────

  const candidates: CandidateResult[] = [];
  const skips:      SkipResult[]      = [];

  for (const c of raw) {
    // Doble-check: los filtros SQL deberían garantizar esto, pero verificamos
    if (c.status !== "PENDING") {
      skips.push({ cleaningId: c.id, reason: "STATUS_NOT_PENDING", detail: c.status });
      continue;
    }
    if (c.teamId !== null) {
      skips.push({ cleaningId: c.id, reason: "ALREADY_HAS_TEAM" });
      continue;
    }
    if (c.assignedMembershipId !== null) {
      skips.push({ cleaningId: c.id, reason: "ALREADY_HAS_ASSIGNEE" });
      continue;
    }

    const key = `${c.tenantId}::${c.propertyId}`;
    const resolution = teamResolutionCache.get(key);

    if (!resolution || resolution.teamIds.length === 0) {
      skips.push({ cleaningId: c.id, reason: "NO_TEAM_COVERAGE" });
      continue;
    }

    if (resolution.teamIds.length > 1) {
      skips.push({
        cleaningId: c.id,
        reason:     "MULTIPLE_TEAMS_NON_DETERMINISTIC",
        detail:     `${resolution.teamIds.length} teams activos para esta propiedad`,
      });
      continue;
    }

    // Exactamente 1 team → resolución determinística
    const resolvedTeamId = resolution.teamIds[0];

    let autoResult;
    try {
      autoResult = await resolveAutoAssignment(c.propertyId, resolvedTeamId);
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      // PropertyAssignmentConfig puede no existir si la migración está pendiente.
      // En ese caso replicamos los pasos 2-4 de resolveAutoAssignment directamente:
      //   1 membership ACTIVE → auto-asignar / 0 → OPEN+atención / 2+ → OPEN
      if (msg.includes("PropertyAssignmentConfig") || msg.includes("does not exist")) {
        try {
          const activeMemberships = await prisma.teamMembership.findMany({
            where: { teamId: resolvedTeamId, status: "ACTIVE" },
            select: { id: true },
          });
          if (activeMemberships.length === 1) {
            autoResult = {
              assignedMembershipId: activeMemberships[0].id,
              teamId: resolvedTeamId,
              assignmentStatus: "ASSIGNED" as const,
              needsAttention: false,
              attentionReason: null,
            };
          } else if (activeMemberships.length === 0) {
            autoResult = {
              assignedMembershipId: null,
              teamId: resolvedTeamId,
              assignmentStatus: "OPEN" as const,
              needsAttention: true,
              attentionReason: "NO_AVAILABLE_MEMBER",
            };
          } else {
            autoResult = {
              assignedMembershipId: null,
              teamId: resolvedTeamId,
              assignmentStatus: "OPEN" as const,
              needsAttention: false,
              attentionReason: null,
            };
          }
        } catch (innerErr: any) {
          skips.push({ cleaningId: c.id, reason: "RESOLVE_ERROR", detail: innerErr?.message ?? "unknown" });
          continue;
        }
      } else {
        skips.push({ cleaningId: c.id, reason: "RESOLVE_ERROR", detail: msg || "unknown" });
        continue;
      }
    }

    const propertyLabel: string = c.propertyShortName ?? c.propertyName ?? c.propertyId;

    candidates.push({
      cleaningId:           c.id,
      tenantId:             c.tenantId,
      propertyId:           c.propertyId,
      propertyLabel,
      teamId:               resolvedTeamId,
      teamSource:           resolution.source,
      assignedMembershipId: autoResult.assignedMembershipId,
      kind:                 autoResult.assignedMembershipId ? "TEAM_AND_AUTO_ASSIGNEE" : "TEAM_ONLY",
    });
  }

  // ── 4. Reporte de candidatas ──────────────────────────────────────────────

  divider("CANDIDATAS CON RESOLUCIÓN DETERMINÍSTICA");

  if (candidates.length === 0) {
    console.log("Ninguna limpieza puede ser actualizada con la lógica actual.\n");
  } else {
    const teamAndAssignee = candidates.filter((c) => c.kind === "TEAM_AND_AUTO_ASSIGNEE");
    const teamOnly        = candidates.filter((c) => c.kind === "TEAM_ONLY");

    console.log(`Total actualizables                     : ${candidates.length}`);
    console.log(`  → TEAM + membershipId (auto-asignación): ${teamAndAssignee.length}`);
    console.log(`  → TEAM solamente (membershipId queda null): ${teamOnly.length}`);
    console.log("");

    for (const c of candidates) {
      const action = DRY_RUN ? "[would update]" : "[updated]";
      const memberLabel = c.assignedMembershipId
        ? `membership=${c.assignedMembershipId.slice(-8)}`
        : "membership=OPEN";
      console.log(
        `  ${action}  ${c.cleaningId}` +
        `  prop=${c.propertyLabel.padEnd(8)}` +
        `  team=${c.teamId.slice(-8)}` +
        `  ${memberLabel}` +
        `  kind=${c.kind}` +
        `  src=${c.teamSource}`
      );
    }
    console.log("");
  }

  // ── 5. Aplicar (solo con --apply) ─────────────────────────────────────────

  let applied         = 0;
  let skippedConcurrency = 0;

  if (!DRY_RUN && candidates.length > 0) {
    divider("APLICANDO");

    for (const c of candidates) {
      // Pre-flight: verificar que el estado no cambió entre lectura y escritura
      const current = await (prisma as any).cleaning.findFirst({
        where: {
          id:                   c.cleaningId,
          status:               "PENDING",
          teamId:               null,
          assignedMembershipId: null,
        },
        select: { id: true },
      });

      if (!current) {
        console.log(`  [skipped/concurrencia] ${c.cleaningId} — estado cambió antes de escribir`);
        skippedConcurrency++;
        continue;
      }

      // Datos a escribir según kind
      const data: Record<string, any> = {
        teamId: c.teamId,
      };

      if (c.kind === "TEAM_AND_AUTO_ASSIGNEE" && c.assignedMembershipId) {
        data.assignedMembershipId = c.assignedMembershipId;
        data.assignmentStatus     = "ASSIGNED";
        data.needsAttention       = false;
        data.attentionReason      = null;
      } else {
        // Solo team: la auto-asignación no fue determinística para membership;
        // el sistema retomará desde aquí en el próximo ciclo si corresponde.
        data.assignmentStatus = "OPEN";
      }

      await (prisma as any).cleaning.update({
        where: { id: c.cleaningId },
        data,
      });

      const memberLabel = c.assignedMembershipId
        ? `membership=${c.assignedMembershipId.slice(-8)}`
        : "membership=OPEN (solo team)";
      console.log(`  [ok] ${c.cleaningId}  team=${c.teamId.slice(-8)}  ${memberLabel}  (${c.kind})`);
      applied++;
    }

    console.log("");
  }

  // ── 6. Reporte de omitidas ────────────────────────────────────────────────

  divider("RESUMEN DE OMITIDAS");

  const skipCounts: Record<SkipReason, number> = {
    STATUS_NOT_PENDING:                0,
    ALREADY_HAS_TEAM:                  0,
    ALREADY_HAS_ASSIGNEE:              0,
    NO_TEAM_COVERAGE:                  0,
    MULTIPLE_TEAMS_NON_DETERMINISTIC:  0,
    RESOLVE_ERROR:                     0,
    CONCURRENCY_CHANGED:               0,
  };
  for (const s of skips) skipCounts[s.reason]++;

  console.log(`Status no elegible (no PENDING)           : ${skipCounts.STATUS_NOT_PENDING}`);
  console.log(`Ya tiene teamId                           : ${skipCounts.ALREADY_HAS_TEAM}`);
  console.log(`Ya tiene membershipId                     : ${skipCounts.ALREADY_HAS_ASSIGNEE}`);
  console.log(`Sin cobertura de team en la propiedad     : ${skipCounts.NO_TEAM_COVERAGE}`);
  console.log(`2+ teams activos, no determinístico       : ${skipCounts.MULTIPLE_TEAMS_NON_DETERMINISTIC}`);
  console.log(`Error al resolver                         : ${skipCounts.RESOLVE_ERROR}`);

  const errors = skips.filter((s) => s.reason === "RESOLVE_ERROR");
  if (errors.length > 0) {
    console.log("\n  Errores:");
    for (const e of errors) console.log(`    • ${e.cleaningId}: ${e.detail}`);
  }

  // ── 7. Resumen final ──────────────────────────────────────────────────────

  divider("RESUMEN FINAL");
  console.log(`Limpiezas revisadas                   : ${raw.length}`);
  console.log(`Con resolución determinística         : ${candidates.length}`);
  console.log(`  → TEAM + auto-assignee              : ${candidates.filter((c) => c.kind === "TEAM_AND_AUTO_ASSIGNEE").length}`);
  console.log(`  → TEAM solamente                    : ${candidates.filter((c) => c.kind === "TEAM_ONLY").length}`);

  if (DRY_RUN) {
    console.log(`Actualizadas (dry-run)                : 0 — usar --apply para escribir`);
  } else {
    console.log(`Actualizadas en DB                    : ${applied}`);
    console.log(`Omitidas por concurrencia             : ${skippedConcurrency}`);
  }
  console.log(`Omitidas (no elegibles)               : ${skips.length - skippedConcurrency}`);
  console.log("");

  if (DRY_RUN && candidates.length > 0) {
    console.log(
      `Para aplicar los cambios ejecuta:\n  npx tsx scripts/backfill-cleaning-team-and-auto-assignment.ts --apply\n`
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
