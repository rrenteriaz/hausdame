import prisma from "@/lib/prisma";

async function main() {
  const cleanings = await prisma.cleaning.findMany({
    where: { needsAttention: true, status: { not: "CANCELLED" } },
    select: {
      id: true, propertyId: true, propertyShortName: true,
      teamId: true, assignedMembershipId: true, attentionReason: true,
    },
  });

  console.log("needsAttention cleanings:", cleanings.length);
  for (const c of cleanings) {
    console.log("\n--- Property:", c.propertyShortName, c.propertyId);
    console.log("  teamId:", c.teamId, "| reason:", c.attentionReason);

    const wgLinks = await (prisma as any).hostWorkGroupProperty.findMany({
      where: { propertyId: c.propertyId },
      select: { workGroupId: true, tenantId: true },
    });
    console.log("  WG property links:", JSON.stringify(wgLinks));

    if (wgLinks.length > 0) {
      const wgIds = wgLinks.map((w: any) => w.workGroupId);
      const executors = await (prisma as any).workGroupExecutor.findMany({
        where: { workGroupId: { in: wgIds } },
        select: { workGroupId: true, teamId: true, status: true },
      });
      console.log("  WGE executors:", JSON.stringify(executors));

      const activeMemberships = await (prisma as any).teamMembership.findMany({
        where: { teamId: { in: executors.map((e: any) => e.teamId) }, status: "ACTIVE" },
        select: { id: true, teamId: true },
      });
      console.log("  Active memberships:", JSON.stringify(activeMemberships));
    }
  }
}

main().catch(console.error).finally(() => (prisma as any).$disconnect());
