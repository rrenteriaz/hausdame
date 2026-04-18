import { resolveAvailableTeamsForProperty } from "@/lib/workgroups/resolveAvailableTeamsForProperty";
import prisma from "@/lib/prisma";

async function main() {
  const tenantId = "cmkptilbc0000x4o7lvmlls57";
  const properties = await prisma.property.findMany({
    where: { tenantId },
    select: { id: true, shortName: true, name: true },
    orderBy: { name: "asc" },
  });

  for (const p of properties) {
    const result = await resolveAvailableTeamsForProperty(tenantId, p.id);
    const label = (p.shortName || p.name).padEnd(12);
    const count = result.teamIds.length;
    const flag = count > 1 ? " ⚠️  MÚLTIPLES" : "";
    console.log(`${label} → ${count} team(s) [${result.teamIds.join(", ")}]${flag}`);
    console.log(`            wge:${result.sourceBreakdown.workGroupCount} propertyTeam:${result.sourceBreakdown.propertyTeamCount}`);
  }
}

main().catch(console.error).finally(() => (prisma as any).$disconnect());
