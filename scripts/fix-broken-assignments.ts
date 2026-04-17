/**
 * Corrige limpiezas PENDING con needsAttention=true por razones de asignación rota
 * (NO_TEAM_CONFIGURED, NO_AVAILABLE_MEMBER) donde ahora SÍ hay datos WGE válidos.
 * 
 * Solo toca limpiezas PENDING — no IN_PROGRESS ni COMPLETED.
 * Muestra un preview y pide confirmación antes de escribir.
 */
import prisma from "@/lib/prisma";
import { resolveAvailableTeamsForProperty } from "@/lib/workgroups/resolveAvailableTeamsForProperty";
import { resolveAutoAssignment } from "@/lib/cleanings/resolveAutoAssignment";

const DRY_RUN = process.argv.includes("--dry-run");
const FIXABLE_REASONS = ["NO_TEAM_CONFIGURED", "NO_AVAILABLE_MEMBER", "NO_TEAM_ASSIGNED"];

async function main() {
  // Auto-detectar tenantId desde los propios WorkGroups (o sobreescribir con TENANT_ID)
  const wgSample = await (prisma as any).hostWorkGroup.findFirst({ select: { tenantId: true } });
  const tenantId = process.env.TENANT_ID ?? wgSample?.tenantId;
  if (!tenantId) throw new Error("No se pudo detectar tenantId");
  console.log("tenantId:", tenantId);

  // Candidatos: PENDING + needsAttention + sin assignedMembershipId + razón fixable
  const candidates = await prisma.cleaning.findMany({
    where: {
      tenantId,
      needsAttention: true,
      status: "PENDING",
      assignedMembershipId: null,
      attentionReason: { in: FIXABLE_REASONS },
    },
    select: {
      id: true,
      propertyId: true,
      propertyShortName: true,
      teamId: true,
      attentionReason: true,
      scheduledDate: true,
    },
    orderBy: { scheduledDate: "asc" },
  });

  console.log(`\nCandidatos a corregir: ${candidates.length}`);
  if (candidates.length === 0) { console.log("Nada que hacer."); return; }

  let fixable = 0, skipped = 0;

  for (const c of candidates) {
    const { teamIds } = await resolveAvailableTeamsForProperty(tenantId, c.propertyId);
    const resolvedTeamId = teamIds.length > 0 ? teamIds[0] : null;
    const assignment = await resolveAutoAssignment(c.propertyId, resolvedTeamId);

    const willAssign = assignment.assignedMembershipId !== null;
    const status = willAssign ? "✅ ASIGNAR" : "⚠️  SIGUE SIN EQUIPO";
    console.log(`\n  [${status}] ${c.propertyShortName} | ${c.scheduledDate?.toISOString().slice(0, 10)}`);
    console.log(`    antes: reason=${c.attentionReason}, teamId=${c.teamId ?? "null"}`);
    console.log(`    después: membershipId=${assignment.assignedMembershipId}, teamId=${assignment.teamId}, reason=${assignment.attentionReason ?? "null"}`);

    if (!willAssign) { skipped++; continue; }
    fixable++;

    if (!DRY_RUN) {
      await prisma.cleaning.update({
        where: { id: c.id },
        data: {
          teamId: assignment.teamId,
          assignedMembershipId: assignment.assignedMembershipId,
          assignmentStatus: assignment.assignmentStatus,
          needsAttention: assignment.needsAttention,
          attentionReason: assignment.attentionReason,
        },
      });
    }
  }

  console.log(`\nResumen: ${fixable} corregidas, ${skipped} sin resolver.`);
  if (DRY_RUN) console.log("(DRY RUN — no se escribió nada)");
}

main()
  .catch(console.error)
  .finally(() => (prisma as any).$disconnect());
