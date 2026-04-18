import prisma from "@/lib/prisma";

async function main() {
  const tenantId = "cmkptilbc0000x4o7lvmlls57";

  // Limpiezas de 5Mayo y CasaL — verificar estado actual tras el fix
  const cleanings = await prisma.cleaning.findMany({
    where: {
      tenantId,
      propertyShortName: { in: ["5Mayo", "CasaL"] },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      propertyShortName: true,
      scheduledDate: true,
      status: true,
      teamId: true,
      assignedMembershipId: true,
      assignmentStatus: true,
      needsAttention: true,
      attentionReason: true,
      updatedAt: true,
    },
    orderBy: { scheduledDate: "asc" },
  });

  for (const c of cleanings) {
    console.log(`\nPropiedad : ${c.propertyShortName}`);
    console.log(`Fecha     : ${c.scheduledDate?.toISOString().slice(0, 16).replace("T", " ")}`);
    console.log(`Status    : ${c.status}`);
    console.log(`teamId    : ${c.teamId ?? "null"}`);
    console.log(`membershipId     : ${c.assignedMembershipId ?? "null"}`);
    console.log(`assignmentStatus : ${c.assignmentStatus}`);
    console.log(`needsAttention   : ${c.needsAttention}`);
    console.log(`attentionReason  : ${c.attentionReason ?? "null"}`);
    console.log(`updatedAt : ${c.updatedAt.toISOString()}`);
  }
}

main().catch(console.error).finally(() => (prisma as any).$disconnect());
