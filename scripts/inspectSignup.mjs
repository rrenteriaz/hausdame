import { PrismaClient } from "../lib/generated/prisma";

const prisma = new PrismaClient();

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

async function main() {
  const email = getArgValue("--email") || getArgValue("-e");
  if (!email) {
    console.error("Uso: node scripts/inspectSignup.mjs --email usuario@ejemplo.com");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      cleanerProfile: { select: { id: true } },
      TeamMembership: {
        select: {
          id: true,
          role: true,
          status: true,
          team: { select: { id: true, name: true, tenantId: true } },
        },
      },
    },
  });

  if (!user) {
    console.log("Usuario no encontrado.");
    return;
  }

  const tenants = [];
  if (user.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, name: true, slug: true },
    });
    if (tenant) tenants.push(tenant);
  }

  const teamTenantIds = Array.from(
    new Set(user.TeamMembership.map((m) => m.team.tenantId).filter(Boolean))
  );
  for (const tenantId of teamTenantIds) {
    if (user.tenantId && tenantId === user.tenantId) continue;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });
    if (tenant) tenants.push(tenant);
  }

  console.log("User:", {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    cleanerProfileId: user.cleanerProfile?.id || null,
  });
  console.log("Tenants:", tenants);
  console.log(
    "TeamMemberships:",
    user.TeamMembership.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      teamId: m.team.id,
      teamName: m.team.name,
      tenantId: m.team.tenantId,
    }))
  );
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

