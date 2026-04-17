/**
 * scripts/diagnose-assignment-model.ts
 *
 * Diagnóstico del estado del modelo de asignación de limpiezas.
 * SOLO LECTURA — no modifica ningún dato.
 *
 * Reporta:
 *   - % de limpiezas con assignedMemberId (legacy)
 *   - % con assignedMembershipId (nuevo)
 *   - % con ambos
 *   - % con ninguno (OPEN)
 *   - Casos inconsistentes:
 *       A) assignedMemberId != null && assignedMembershipId == null
 *       B) assignedMembershipId != null && teamId == null  ← viola invariante del contrato
 *       C) assignedMemberId != null && assignedMembershipId != null (coexistencia)
 *
 * Uso:
 *   npx tsx scripts/diagnose-assignment-model.ts
 *   npx tsx scripts/diagnose-assignment-model.ts --tenantId=<id>
 *   npx tsx scripts/diagnose-assignment-model.ts --status=PENDING
 *   npx tsx scripts/diagnose-assignment-model.ts --tenantId=<id> --status=PENDING
 */

import "dotenv/config";
import prisma from "../lib/prisma";

const tenantIdArg = process.argv.find((a) => a.startsWith("--tenantId="));
const TENANT_ID_FILTER = tenantIdArg?.split("=")[1];

const statusArg = process.argv.find((a) => a.startsWith("--status="));
const STATUS_FILTER = statusArg?.split("=")[1];

function pct(count: number, total: number): string {
  if (total === 0) return "0.00%";
  return ((count / total) * 100).toFixed(2) + "%";
}

function divider(label?: string) {
  const line = "─".repeat(60);
  if (label) {
    const pad = Math.max(0, Math.floor((60 - label.length - 2) / 2));
    console.log("─".repeat(pad) + " " + label + " " + "─".repeat(60 - pad - label.length - 2));
  } else {
    console.log(line);
  }
}

async function main() {
  console.log("");
  divider("DIAGNÓSTICO: MODELO DE ASIGNACIÓN DE LIMPIEZAS");
  console.log(`Fecha        : ${new Date().toISOString()}`);
  if (TENANT_ID_FILTER) console.log(`Tenant filter: ${TENANT_ID_FILTER}`);
  if (STATUS_FILTER)    console.log(`Status filter: ${STATUS_FILTER}`);
  console.log("");

  const where: any = {
    ...(TENANT_ID_FILTER ? { tenantId: TENANT_ID_FILTER } : {}),
    ...(STATUS_FILTER     ? { status: STATUS_FILTER }      : {}),
  };

  // ── Fetch all relevant cleanings ──────────────────────────────────────────
  const cleanings = await (prisma as any).cleaning.findMany({
    where,
    select: {
      id: true,
      tenantId: true,
      status: true,
      assignmentStatus: true,
      teamId: true,
      assignedMemberId: true,
      assignedTeamMemberId: true,
      assignedMembershipId: true,
      scheduledDate: true,
    },
    orderBy: { scheduledDate: "asc" },
  });

  const total = cleanings.length;

  // ── Buckets ───────────────────────────────────────────────────────────────
  const buckets = {
    // model state
    onlyMemberId:        [] as any[],  // legacy only
    onlyMembershipId:    [] as any[],  // new only
    both:                [] as any[],  // coexistence
    neither:             [] as any[],  // OPEN / unassigned
    // invariant violations
    membershipWithoutTeam: [] as any[], // violates contract invariant
    legacyMismatch:        [] as any[], // assignedMemberId != assignedTeamMemberId
    statusMismatch:        [] as any[], // assignmentStatus=ASSIGNED but no assignee
    openWithAssignee:      [] as any[], // assignmentStatus=OPEN but has assignee
  };

  for (const c of cleanings) {
    const hasMemberId     = c.assignedMemberId     !== null;
    const hasMembershipId = c.assignedMembershipId !== null;
    const hasTeamId       = c.teamId               !== null;

    if (hasMemberId && hasMembershipId)  buckets.both.push(c);
    else if (hasMemberId)                buckets.onlyMemberId.push(c);
    else if (hasMembershipId)            buckets.onlyMembershipId.push(c);
    else                                 buckets.neither.push(c);

    // Invariante: no puede existir assignedMembershipId sin teamId
    if (hasMembershipId && !hasTeamId) {
      buckets.membershipWithoutTeam.push(c);
    }

    // Consistencia interna: assignedMemberId debe coincidir con assignedTeamMemberId cuando ambos existen
    if (c.assignedMemberId && c.assignedTeamMemberId && c.assignedMemberId !== c.assignedTeamMemberId) {
      buckets.legacyMismatch.push(c);
    }

    // assignmentStatus=ASSIGNED pero sin ningún assignee
    if (c.assignmentStatus === "ASSIGNED" && !hasMemberId && !hasMembershipId) {
      buckets.statusMismatch.push(c);
    }

    // assignmentStatus=OPEN pero tiene assignee
    if (c.assignmentStatus === "OPEN" && (hasMemberId || hasMembershipId)) {
      buckets.openWithAssignee.push(c);
    }
  }

  // ── Resumen cuantitativo ──────────────────────────────────────────────────
  divider("DISTRIBUCIÓN POR MODELO");
  console.log(`Total limpiezas                            : ${total}`);
  console.log("");
  console.log(`Solo assignedMemberId    (legacy)          : ${buckets.onlyMemberId.length.toString().padStart(5)} / ${total}  (${pct(buckets.onlyMemberId.length, total)})`);
  console.log(`Solo assignedMembershipId (nuevo)          : ${buckets.onlyMembershipId.length.toString().padStart(5)} / ${total}  (${pct(buckets.onlyMembershipId.length, total)})`);
  console.log(`Ambos (coexistencia)                       : ${buckets.both.length.toString().padStart(5)} / ${total}  (${pct(buckets.both.length, total)})`);
  console.log(`Ninguno (OPEN / sin ejecutor)              : ${buckets.neither.length.toString().padStart(5)} / ${total}  (${pct(buckets.neither.length, total)})`);
  console.log("");

  // ── Inconsistencias críticas ──────────────────────────────────────────────
  divider("INCONSISTENCIAS CRÍTICAS");
  const hasCritical =
    buckets.membershipWithoutTeam.length > 0 ||
    buckets.legacyMismatch.length > 0 ||
    buckets.statusMismatch.length > 0 ||
    buckets.openWithAssignee.length > 0;

  if (!hasCritical) {
    console.log("✅ Sin inconsistencias críticas detectadas.");
  }

  if (buckets.membershipWithoutTeam.length > 0) {
    console.log(`\n⛔ [INVARIANTE VIOLADA] assignedMembershipId != null && teamId == null`);
    console.log(`   Afecta ${buckets.membershipWithoutTeam.length} limpieza(s):`);
    for (const c of buckets.membershipWithoutTeam.slice(0, 10)) {
      console.log(`   • ${c.id}  tenant=${c.tenantId}  membershipId=${c.assignedMembershipId}`);
    }
    if (buckets.membershipWithoutTeam.length > 10) {
      console.log(`   ... y ${buckets.membershipWithoutTeam.length - 10} más`);
    }
  }

  if (buckets.legacyMismatch.length > 0) {
    console.log(`\n⚠️  [LEGACY MISMATCH] assignedMemberId ≠ assignedTeamMemberId`);
    console.log(`   Afecta ${buckets.legacyMismatch.length} limpieza(s):`);
    for (const c of buckets.legacyMismatch.slice(0, 10)) {
      console.log(`   • ${c.id}  memberId=${c.assignedMemberId}  teamMemberId=${c.assignedTeamMemberId}`);
    }
  }

  if (buckets.statusMismatch.length > 0) {
    console.log(`\n⚠️  [STATUS MISMATCH] assignmentStatus=ASSIGNED pero sin ningún assignee`);
    console.log(`   Afecta ${buckets.statusMismatch.length} limpieza(s):`);
    for (const c of buckets.statusMismatch.slice(0, 10)) {
      console.log(`   • ${c.id}  status=${c.status}  tenant=${c.tenantId}`);
    }
  }

  if (buckets.openWithAssignee.length > 0) {
    console.log(`\n⚠️  [STATUS MISMATCH] assignmentStatus=OPEN pero tiene assignee`);
    console.log(`   Afecta ${buckets.openWithAssignee.length} limpieza(s):`);
    for (const c of buckets.openWithAssignee.slice(0, 10)) {
      console.log(`   • ${c.id}  memberId=${c.assignedMemberId ?? "-"}  membershipId=${c.assignedMembershipId ?? "-"}`);
    }
  }

  // ── Candidatos prioritarios para migración (Fase 4) ───────────────────────
  divider("CANDIDATOS PARA MIGRACIÓN (Fase 4)");
  const migrationCandidates = buckets.onlyMemberId.filter(
    (c) => c.assignedMemberId !== null && c.assignedMembershipId === null
  );
  console.log(`Limpiezas con solo assignedMemberId (legacy)`);
  console.log(`→ Candidatos directos para migrar a assignedMembershipId: ${migrationCandidates.length}`);

  // Desglose por tenant
  const byTenant = new Map<string, number>();
  for (const c of migrationCandidates) {
    byTenant.set(c.tenantId, (byTenant.get(c.tenantId) ?? 0) + 1);
  }
  if (byTenant.size > 0) {
    console.log("\n  Por tenant:");
    for (const [tid, count] of [...byTenant.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${tid}  →  ${count} limpieza(s)`);
    }
  }

  // ── Muestra de casos legacy sin membership ────────────────────────────────
  if (migrationCandidates.length > 0) {
    divider("MUESTRA: legacy sin membership (primeros 15)");
    const sample = migrationCandidates.slice(0, 15);
    for (const c of sample) {
      // Intentar resolver el membership correspondiente
      const teamMember = await (prisma as any).teamMember.findFirst({
        where: { id: c.assignedMemberId },
        select: { id: true, name: true, userId: true, teamId: true },
      });

      let membershipStatus = "sin TeamMember";
      if (teamMember) {
        const membership = await prisma.teamMembership.findFirst({
          where: {
            userId: teamMember.userId,
            teamId: teamMember.teamId,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        membershipStatus = membership
          ? `→ membership ${membership.id}  ✅ migrable`
          : "→ sin membership ACTIVE  ⚠️ no migrable";
      }

      console.log(`  • ${c.id}  [${c.status}]  memberId=${c.assignedMemberId}  ${membershipStatus}`);
    }
    if (migrationCandidates.length > 15) {
      console.log(`  ... y ${migrationCandidates.length - 15} más`);
    }
  }

  // ── Resumen final ─────────────────────────────────────────────────────────
  divider("RESUMEN");
  const migrableCount  = migrationCandidates.length;
  const alreadyNewCount = buckets.onlyMembershipId.length + buckets.both.length;
  const openCount      = buckets.neither.length;

  console.log(`Modelo nuevo (membershipId)  : ${alreadyNewCount}  (${pct(alreadyNewCount, total)})`);
  console.log(`Pendientes de migración      : ${migrableCount}     (${pct(migrableCount, total)})`);
  console.log(`Sin ejecutor (OPEN)          : ${openCount}     (${pct(openCount, total)})`);
  console.log(`Invariantes violadas         : ${buckets.membershipWithoutTeam.length}`);
  console.log("");
  if (buckets.membershipWithoutTeam.length > 0) {
    console.log("❌ Requiere acción inmediata: hay invariantes violadas.");
  } else if (migrableCount > 0) {
    console.log("🔶 Ejecutar Fase 4 para migrar datos legacy.");
  } else {
    console.log("✅ Todos los datos usan el modelo nuevo o están OPEN.");
  }
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
