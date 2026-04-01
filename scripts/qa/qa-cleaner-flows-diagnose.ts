/**
 * Diagnóstico previo al QA de flujos Cleaner.
 * Solo lectura — no modifica datos.
 */
import "dotenv/config";
import prisma from "@/lib/prisma";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("QA scripts no deben ejecutarse en producción.");
  }

  console.log("=== DIAGNÓSTICO: Datos para QA de flujos Cleaner ===\n");

  // 1. Tenants
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true }, take: 5 });
  console.log("Tenants:");
  console.table(tenants);

  // 2. TeamMemberships ACTIVE con Team y User
  const memberships = await prisma.teamMembership.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      teamId: true,
      userId: true,
      role: true,
      User: { select: { id: true, name: true, email: true, role: true } },
      Team: { select: { id: true, name: true, tenantId: true } },
    },
    take: 10,
  });

  console.log("\nTeamMemberships ACTIVE:");
  console.table(
    memberships.map((m) => ({
      membershipId: m.id,
      role: m.role,
      teamId: m.teamId,
      teamName: m.Team.name,
      tenantId: m.Team.tenantId,
      userId: m.userId,
      userName: m.User.name,
      userEmail: m.User.email,
      userRole: m.User.role,
    }))
  );

  if (memberships.length === 0) {
    console.log("❌ Sin TeamMemberships ACTIVE. Sin datos para QA.");
    return;
  }

  // Usar el primero como cleaner candidato
  const m = memberships[0];
  const tenantId = m.Team.tenantId;
  const teamId = m.teamId;
  console.log(`\nCandidato cleaner: "${m.User.name}" membership=${m.id} team=${teamId} tenant=${tenantId}`);

  // 3. Propiedades accesibles (WGE)
  const wgProps = await prisma.hostWorkGroupProperty.findMany({
    where: { workGroup: { executors: { some: { teamId } } } },
    select: { propertyId: true },
    take: 10,
  });
  const wgPropIds = wgProps.map((p) => p.propertyId);

  // Propiedades accesibles (PropertyTeam legacy)
  const ptRows = await (prisma as any).propertyTeam.findMany({
    where: { teamId },
    select: { propertyId: true },
    take: 10,
  });
  const ptPropIds = ptRows.map((r: any) => r.propertyId);

  const allPropertyIds = [...new Set([...wgPropIds, ...ptPropIds])];
  console.log(`Propiedades accesibles: ${allPropertyIds.length} (${wgPropIds.length} vía WGE, ${ptPropIds.length} vía PT)`);

  if (allPropertyIds.length === 0) {
    console.log("❌ Sin propiedades. No se puede hacer QA completo.");
    return;
  }

  // 4. Limpiezas OPEN/PENDING disponibles para aceptar
  const open = await (prisma as any).cleaning.findMany({
    where: {
      propertyId: { in: allPropertyIds },
      assignmentStatus: "OPEN",
      status: "PENDING",
      assignedMembershipId: null,
      assignedMemberId: null,
    },
    select: {
      id: true, status: true, assignmentStatus: true,
      scheduledDate: true, tenantId: true, propertyId: true,
      teamId: true, needsAttention: true,
    },
    orderBy: { scheduledDate: "asc" },
    take: 5,
  });

  console.log("\nLimpiezas OPEN/PENDING (para aceptar):");
  if (open.length === 0) {
    console.log("  ⚠️  Ninguna — QA creará una synthetic");
  } else {
    console.table(open.map((c: any) => ({
      id: c.id,
      status: c.status,
      assignmentStatus: c.assignmentStatus,
      scheduledDate: c.scheduledDate?.toISOString().slice(0, 10),
      propertyId: c.propertyId,
    })));
  }

  // 5. Limpiezas ya asignadas a este cleaner
  const assigned = await (prisma as any).cleaning.findMany({
    where: {
      propertyId: { in: allPropertyIds },
      assignmentStatus: "ASSIGNED",
      assignedMembershipId: m.id,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    select: {
      id: true, status: true, assignmentStatus: true,
      scheduledDate: true, assignedMembershipId: true,
    },
    take: 5,
  });

  console.log(`\nLimpiezas ASSIGNED al cleaner (membership=${m.id}):`);
  if (assigned.length === 0) {
    console.log("  (ninguna)");
  } else {
    console.table(assigned.map((c: any) => ({
      id: c.id,
      status: c.status,
      scheduledDate: c.scheduledDate?.toISOString().slice(0, 10),
    })));
  }

  // 6. CleaningAssignees recientes
  const assignees = await prisma.cleaningAssignee.findMany({
    where: { tenantId },
    select: { id: true, cleaningId: true, memberId: true, status: true, assignedAt: true },
    orderBy: { assignedAt: "desc" },
    take: 5,
  });
  console.log("\nCleaningAssignees recientes (tenant):");
  console.table(assignees);

  console.log("\n=== RESUMEN ===");
  console.log(`Cleaner listo: ${m.User.name} (${m.User.email})`);
  console.log(`Membership:    ${m.id}`);
  console.log(`Team:          ${teamId}`);
  console.log(`Tenant:        ${tenantId}`);
  console.log(`Propiedades:   ${allPropertyIds.length}`);
  console.log(`OPEN/PENDING:  ${open.length}`);
  console.log(`ASSIGNED ya:   ${assigned.length}`);

  if (open.length > 0) {
    console.log(`\n✅ Candidato para accept: ${open[0].id}`);
  }
  if (assigned.length > 0) {
    console.log(`✅ Candidato para decline/complete: ${assigned[0].id} (${assigned[0].status})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
