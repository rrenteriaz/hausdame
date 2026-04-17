/**
 * scripts/migrate-assigned-members-to-memberships.ts
 *
 * Migración de datos — Fase 4 del contrato de asignación de limpiezas.
 *
 * Para cada Cleaning con assignedMemberId != null Y assignedMembershipId == null:
 *   1. Obtener TeamMember → userId + teamId
 *   2. Buscar TeamMembership donde userId+teamId+status=ACTIVE
 *   3. Si existe → actualizar assignedMembershipId = membership.id
 *      (NO toca assignedMemberId — se mantiene hasta Fase 5)
 *   4. Si no existe → registrar como no migrable (skip)
 *
 * Esta migración es idempotente: si se ejecuta de nuevo, los registros ya
 * migrados (assignedMembershipId != null) son ignorados automáticamente.
 *
 * Modo dry-run por defecto. Pasar --apply para escribir.
 *
 * Uso:
 *   npx tsx scripts/migrate-assigned-members-to-memberships.ts
 *   npx tsx scripts/migrate-assigned-members-to-memberships.ts --apply
 *   npx tsx scripts/migrate-assigned-members-to-memberships.ts --tenantId=<id>
 *   npx tsx scripts/migrate-assigned-members-to-memberships.ts --tenantId=<id> --apply
 *   npx tsx scripts/migrate-assigned-members-to-memberships.ts --status=PENDING --apply
 */

import "dotenv/config";
import prisma from "../lib/prisma";

const DRY_RUN = !process.argv.includes("--apply");
const tenantIdArg = process.argv.find((a) => a.startsWith("--tenantId="));
const TENANT_ID_FILTER = tenantIdArg?.split("=")[1];
const statusArg = process.argv.find((a) => a.startsWith("--status="));
const STATUS_FILTER = statusArg?.split("=")[1];

interface MigrationResult {
  cleaningId: string;
  tenantId: string;
  status: string;
  assignedMemberId: string;
  memberName: string | null;
  teamId: string | null;
  membershipId: string | null;
  outcome: "migrated" | "no_member" | "no_membership" | "skipped_already_has";
}

function divider(label?: string) {
  const line = "─".repeat(64);
  if (label) {
    const pad = Math.max(0, Math.floor((64 - label.length - 2) / 2));
    console.log("─".repeat(pad) + " " + label + " " + "─".repeat(64 - pad - label.length - 2));
  } else {
    console.log(line);
  }
}

async function main() {
  console.log("");
  divider("MIGRACIÓN: assignedMemberId → assignedMembershipId");
  console.log(`Modo         : ${DRY_RUN ? "DRY-RUN (pasar --apply para escribir)" : "APPLY"}`);
  console.log(`Fecha        : ${new Date().toISOString()}`);
  if (TENANT_ID_FILTER) console.log(`Tenant filter: ${TENANT_ID_FILTER}`);
  if (STATUS_FILTER)    console.log(`Status filter: ${STATUS_FILTER}`);
  console.log("");

  // ── Obtener candidatos ────────────────────────────────────────────────────
  const candidates = await (prisma as any).cleaning.findMany({
    where: {
      assignedMemberId:     { not: null },
      assignedMembershipId: null,
      ...(TENANT_ID_FILTER ? { tenantId: TENANT_ID_FILTER } : {}),
      ...(STATUS_FILTER     ? { status: STATUS_FILTER }      : {}),
    },
    select: {
      id: true,
      tenantId: true,
      status: true,
      assignmentStatus: true,
      teamId: true,
      assignedMemberId: true,
    },
    orderBy: { scheduledDate: "asc" },
  });

  console.log(`Candidatos encontrados: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log("✅ No hay limpiezas pendientes de migración.");
    return;
  }
  console.log("");

  // ── Procesar cada candidato ───────────────────────────────────────────────
  const results: MigrationResult[] = [];
  let migratedCount = 0;
  let noMemberCount = 0;
  let noMembershipCount = 0;

  for (const cleaning of candidates) {
    const memberId = cleaning.assignedMemberId as string;

    // Paso 1: Obtener TeamMember
    const teamMember = await (prisma as any).teamMember.findFirst({
      where: { id: memberId },
      select: { id: true, name: true, userId: true, teamId: true },
    });

    if (!teamMember) {
      results.push({
        cleaningId: cleaning.id,
        tenantId: cleaning.tenantId,
        status: cleaning.status,
        assignedMemberId: memberId,
        memberName: null,
        teamId: null,
        membershipId: null,
        outcome: "no_member",
      });
      noMemberCount++;
      continue;
    }

    // Paso 2: Buscar TeamMembership activa
    const membership = await prisma.teamMembership.findFirst({
      where: {
        userId:  teamMember.userId,
        teamId:  teamMember.teamId,
        status:  "ACTIVE",
      },
      select: { id: true },
    });

    if (!membership) {
      results.push({
        cleaningId: cleaning.id,
        tenantId: cleaning.tenantId,
        status: cleaning.status,
        assignedMemberId: memberId,
        memberName: teamMember.name,
        teamId: teamMember.teamId,
        membershipId: null,
        outcome: "no_membership",
      });
      noMembershipCount++;
      continue;
    }

    // Guard de invariante: asegurar que teamId esté seteado
    const teamIdForUpdate = cleaning.teamId ?? teamMember.teamId;

    // Paso 3: Migrar
    if (!DRY_RUN) {
      await (prisma as any).cleaning.update({
        where: { id: cleaning.id },
        data: {
          assignedMembershipId: membership.id,
          // Asegurar teamId si no estaba seteado (iCal pre-Fase 2 no lo escribía)
          ...(cleaning.teamId ? {} : { teamId: teamIdForUpdate }),
          // NO tocar assignedMemberId hasta Fase 5
        },
      });
    }

    results.push({
      cleaningId: cleaning.id,
      tenantId: cleaning.tenantId,
      status: cleaning.status,
      assignedMemberId: memberId,
      memberName: teamMember.name,
      teamId: teamIdForUpdate,
      membershipId: membership.id,
      outcome: "migrated",
    });
    migratedCount++;
  }

  // ── Reporte detallado ─────────────────────────────────────────────────────
  divider("RESULTADO DETALLADO");

  const migrated  = results.filter((r) => r.outcome === "migrated");
  const noMember  = results.filter((r) => r.outcome === "no_member");
  const noMemb    = results.filter((r) => r.outcome === "no_membership");

  if (migrated.length > 0) {
    console.log(`\n✅ ${DRY_RUN ? "Would migrate" : "Migrated"}: ${migrated.length}`);
    for (const r of migrated.slice(0, 20)) {
      console.log(`  • ${r.cleaningId}  [${r.status}]  ${r.memberName ?? r.assignedMemberId}  →  membership ${r.membershipId}`);
    }
    if (migrated.length > 20) console.log(`  ... y ${migrated.length - 20} más`);
  }

  if (noMember.length > 0) {
    console.log(`\n⚠️  Sin TeamMember en BD: ${noMember.length}`);
    console.log("   (El TeamMember fue eliminado o el ID es inválido)");
    for (const r of noMember.slice(0, 10)) {
      console.log(`  • ${r.cleaningId}  memberId=${r.assignedMemberId}`);
    }
  }

  if (noMemb.length > 0) {
    console.log(`\n🔶 Sin TeamMembership ACTIVE: ${noMemb.length}`);
    console.log("   (El cleaner tiene TeamMember pero no TeamMembership activa — no migrable automáticamente)");
    for (const r of noMemb.slice(0, 10)) {
      console.log(`  • ${r.cleaningId}  [${r.status}]  ${r.memberName}  teamId=${r.teamId}`);
    }
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  divider("RESUMEN");
  console.log(`Total procesados          : ${candidates.length}`);
  console.log(`${DRY_RUN ? "Migrarían" : "Migrados"}              : ${migratedCount}`);
  console.log(`Sin TeamMember            : ${noMemberCount}`);
  console.log(`Sin TeamMembership ACTIVE : ${noMembershipCount}`);
  console.log("");

  if (DRY_RUN) {
    console.log("→ Ejecutar con --apply para realizar los cambios.");
  } else {
    if (migratedCount > 0) {
      console.log("✅ Migración completada. Ejecutar diagnose-assignment-model.ts para verificar.");
    }
    if (noMembershipCount > 0) {
      console.log("⚠️  Hay limpiezas no migrables. Revisar TeamMembership de los cleaners afectados.");
    }
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
