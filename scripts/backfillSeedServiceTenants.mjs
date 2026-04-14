import fs from "fs";
import dotenv from "dotenv";
import { PrismaClient } from "../lib/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
} else if (fs.existsSync(".env")) {
  dotenv.config({ path: ".env" });
}

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
  console.error("❌ Error: DATABASE_URL no está definido.");
  process.exit(1);
}

try {
  neonConfig.webSocketConstructor = ws;
} catch (error) {
  console.warn("Error configurando WebSocket para Neon:", error);
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter, log: ["error", "warn"] });

const DEFAULT_EMAILS = [
  "cleaner1@hausdame.test",
  "cleaner2@hausdame.test",
  "cleaner3@hausdame.test",
  "cleaner4@hausdame.test",
];

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index !== -1) return process.argv[index + 1] || null;
  const withEquals = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!withEquals) return null;
  return withEquals.split("=").slice(1).join("=") || null;
}

function parseMode() {
  const raw = getArgValue("--mode");
  if (!raw) return "preflight";
  const mode = raw.toLowerCase();
  if (!["preflight", "dry-run", "apply"].includes(mode)) return "preflight";
  return mode;
}

function parseEmails() {
  const raw = getArgValue("--emails");
  if (!raw) return DEFAULT_EMAILS;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isDemoTarget(tenant, demoTenantId) {
  if (!tenant || !demoTenantId) return false;
  return tenant.id === demoTenantId;
}

function looksLikeDemoByName(tenant) {
  if (!tenant) return false;
  const name = tenant.name?.toLowerCase() || "";
  const slug = tenant.slug?.toLowerCase() || "";
  return name.includes("demo") || slug.includes("demo");
}

function classifyTenant(tenant, demoTenantId) {
  if (!tenant) {
    return { tenantClass: "UNKNOWN", reason: "no tenant" };
  }

  if (demoTenantId && tenant.id === demoTenantId) {
    return { tenantClass: "DEMO", reason: "DEMO_TENANT_ID match" };
  }

  if (isServicesTenant(tenant)) {
    return { tenantClass: "SERVICES", reason: "services prefix" };
  }

  const hostSlugAllowlist = ["ranferi-airbnb"];
  const hostSlugPrefixes = ["host-"];
  const slug = tenant.slug || "";

  if (hostSlugAllowlist.includes(slug)) {
    return { tenantClass: "HOST", reason: "slug allowlist" };
  }
  if (hostSlugPrefixes.some((prefix) => slug.startsWith(prefix))) {
    return { tenantClass: "HOST", reason: "host slug prefix" };
  }

  return { tenantClass: "UNKNOWN", reason: "unknown slug" };
}

function isServicesTenant(tenant) {
  if (!tenant) return false;
  const name = tenant.name || "";
  const slug = tenant.slug || "";
  return name.startsWith("Services -") || slug.startsWith("services-");
}

async function findLeaderTeamsForUser(userId, memberships) {
  const leaderTeamIds = [];
  for (const membership of memberships) {
    const firstActive = await prisma.teamMembership.findFirst({
      where: { teamId: membership.teamId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    if (firstActive?.userId === userId) {
      leaderTeamIds.push(membership.teamId);
    }
  }
  return leaderTeamIds;
}

async function inspectUser(email, options) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      cleanerProfile: { select: { id: true } },
    },
  });

  if (!user) {
    return {
      email,
      user: null,
      blockers: ["USER_NOT_FOUND"],
      plan: [],
      before: null,
    };
  }

  const memberships = await prisma.teamMembership.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      teamId: true,
      role: true,
      status: true,
      Team: {
        select: {
          id: true,
          name: true,
          tenantId: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  const legacyMembers = await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: { id: true, teamId: true, tenantId: true, isActive: true },
  });

  const tenant = user.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { id: true, name: true, slug: true },
      })
    : null;

  const blockers = [];
  if (user.role !== "CLEANER") blockers.push("USER_ROLE_NOT_CLEANER");
  const demoTenantId = options.demoTenantId;
  const allowDemoMigration = options.allowDemoMigration;
  const allowHostHomeMigration = options.allowHostHomeMigration;
  const demoTarget = !!tenant && isDemoTarget(tenant, demoTenantId);
  const { tenantClass, reason: tenantClassReason } = classifyTenant(tenant, demoTenantId);
  if (tenant && looksLikeDemoByName(tenant) && !demoTarget) {
    console.warn("WARN_TENANT_NAME_LOOKS_DEMO", {
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    });
  }

  if (demoTarget && !allowDemoMigration) blockers.push("USER_TENANT_IS_DEMO");
  if (tenantClass === "HOST" && !allowHostHomeMigration) {
    blockers.push("USER_TENANT_LOOKS_HOST");
  }

  const membershipTeamsMissing = memberships.some((m) => !m.Team);
  if (membershipTeamsMissing) blockers.push("MEMBERSHIP_TEAM_MISSING");

  const displayName = user.name?.trim() || user.email.split("@")[0];
  const baseSlug = `services-${slugify(displayName)}`;
  const baseName = `Services - ${displayName}`;

  const leaderTeamIds = await findLeaderTeamsForUser(user.id, memberships);
  const leaderTeams = memberships.filter((m) => leaderTeamIds.includes(m.teamId));
  const servicesLeaderTeams = leaderTeams.filter((m) => isServicesTenant(m.Team?.tenant));

  if (servicesLeaderTeams.length > 1) blockers.push("MULTIPLE_SERVICES_TENANTS");

  const servicesTenantCandidate =
    servicesLeaderTeams.length === 1 ? servicesLeaderTeams[0].Team.tenant : null;

  const hasServicesHomeTenant = user.tenantId && isServicesTenant(tenant);
  const migratedFromDemoCandidate = allowDemoMigration && demoTarget && !hasServicesHomeTenant;
  const migratedFromHostCandidate =
    allowHostHomeMigration && tenantClass === "HOST" && !hasServicesHomeTenant;

  if (allowDemoMigration && demoTarget) {
    const ownsProperty = await prisma.property.findFirst({
      where: { tenantId: demoTenantId, userId: user.id },
      select: { id: true },
    });
    if (ownsProperty) blockers.push("USER_OWNS_PROPERTIES_IN_DEMO");

    const adminProperty = await prisma.propertyAdmin.findFirst({
      where: { tenantId: demoTenantId, userId: user.id },
      select: { id: true },
    });
    if (adminProperty) blockers.push("USER_IS_PROPERTY_ADMIN_IN_DEMO");

    if (user.role === "OWNER" || user.role === "ADMIN") {
      const demoOwnersCount = await prisma.user.count({
        where: { tenantId: demoTenantId, role: { in: ["OWNER", "ADMIN"] } },
      });
      if (demoOwnersCount === 1) blockers.push("USER_IS_SOLE_OWNER_ADMIN_IN_DEMO");
    }
  }

  const plan = [];
  if (blockers.length === 0) {
    if (hasServicesHomeTenant) {
      plan.push({ type: "NOOP", reason: "USER_ALREADY_HAS_SERVICES_TENANT" });
    } else if (servicesTenantCandidate && !user.tenantId) {
      plan.push({
        type: "SET_HOME_TENANT",
        tenantId: servicesTenantCandidate.id,
      });
    } else if (!user.tenantId || (allowDemoMigration && demoTarget)) {
      if (allowDemoMigration && demoTarget) {
        plan.push({ type: "DEMO_MIGRATION" });
      }
      plan.push({
        type: "CREATE_TENANT",
        tenantName: baseName,
        tenantSlug: baseSlug,
      });
    } else if (allowHostHomeMigration && tenantClass === "HOST") {
      plan.push({ type: "HOST_HOME_MIGRATION" });
      plan.push({
        type: "CREATE_TENANT",
        tenantName: baseName,
        tenantSlug: baseSlug,
      });
    } else {
      blockers.push("USER_TENANT_NOT_SERVICES");
    }
  }

  if (blockers.length === 0) {
    plan.push({ type: "ENSURE_BASE_TEAM" });
    plan.push({ type: "ENSURE_TL_MEMBERSHIP" });
    plan.push({ type: "ENSURE_CLEANER_PROFILE" });
  }

  const before = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    tenant,
    memberships: memberships.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      teamId: m.teamId,
      teamName: m.Team?.name || null,
      tenantId: m.Team?.tenantId || null,
      tenantSlug: m.Team?.tenant?.slug || null,
    })),
    legacyMembers,
    cleanerProfileId: user.cleanerProfile?.id || null,
  };

  return {
    email,
    user,
    tenant,
    memberships,
    legacyMembers,
    blockers,
    plan,
    baseName,
    baseSlug,
    servicesTenantCandidate,
    isDemoTarget: demoTarget,
    migratedFromDemoCandidate,
    migratedFromHostCandidate,
    leaderTeamIds,
    tenantClass,
    tenantClassReason,
    before,
  };
}

async function pickUniqueSlug(baseSlug) {
  let attempt = 0;
  let slug = baseSlug;
  while (attempt < 10) {
    const existing = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }
  return null;
}

async function applyForUser(record, options) {
  const summary = {
    userId: record.user.id,
    email: record.email,
    actions: [],
  };

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: record.user.id },
      select: { id: true, email: true, name: true, tenantId: true },
    });
    if (!user) throw new Error("USER_NOT_FOUND");

    let tenantId = user.tenantId;
    let tenant = tenantId
      ? await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, name: true, slug: true },
        })
      : null;

    if (tenant && isDemoTarget(tenant, options.demoTenantId)) {
      if (!options.allowDemoMigration || tenant.id !== options.demoTenantId) {
        throw new Error("TENANT_IS_DEMO");
      }
    }
    if (tenant && !isServicesTenant(tenant)) {
      if (
        !(
          (options.allowDemoMigration && isDemoTarget(tenant, options.demoTenantId)) ||
          (options.allowHostHomeMigration && record.tenantClass === "HOST")
        )
      ) {
        throw new Error("TENANT_NOT_SERVICES");
      }
    }

    if (!tenantId && record.servicesTenantCandidate?.id) {
      tenantId = record.servicesTenantCandidate.id;
      tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true },
      });
      if (!tenant) throw new Error("CANDIDATE_TENANT_NOT_FOUND");
      if (!isServicesTenant(tenant)) throw new Error("CANDIDATE_TENANT_NOT_SERVICES");

      await tx.user.update({
        where: { id: user.id },
        data: { tenantId },
      });
      summary.actions.push({ type: "SET_HOME_TENANT", tenantId });
    }

    if (
      !tenantId ||
      (options.allowDemoMigration && record.isDemoTarget) ||
      (options.allowHostHomeMigration && record.tenantClass === "HOST")
    ) {
      const slug = await pickUniqueSlug(record.baseSlug);
      if (!slug) throw new Error("SLUG_CONFLICT");

      tenant = await tx.tenant.create({
        data: { name: record.baseName, slug },
        select: { id: true, name: true, slug: true },
      });
      tenantId = tenant.id;
      summary.actions.push({ type: "CREATE_TENANT", tenantId });

      await tx.user.update({
        where: { id: user.id },
        data: { tenantId },
      });
      summary.actions.push({ type: "SET_HOME_TENANT", tenantId });
    }

    const team = await tx.team.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: "Mi equipo",
        },
      },
      create: {
        tenantId,
        name: "Mi equipo",
      },
      update: {},
      select: { id: true },
    });
    summary.actions.push({ type: "ENSURE_BASE_TEAM", teamId: team.id });

    const membership = await tx.teamMembership.upsert({
      where: {
        teamId_userId: {
          teamId: team.id,
          userId: user.id,
        },
      },
      create: {
        teamId: team.id,
        userId: user.id,
        role: "CLEANER",
        status: "ACTIVE",
      },
      update: { status: "ACTIVE" },
      select: { id: true },
    });
    summary.actions.push({ type: "ENSURE_TL_MEMBERSHIP", membershipId: membership.id });

    const existingProfile = await tx.cleanerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!existingProfile) {
      const profile = await tx.cleanerProfile.create({
        data: { userId: user.id, fullName: user.name || null },
        select: { id: true },
      });
      summary.actions.push({ type: "CREATE_CLEANER_PROFILE", cleanerProfileId: profile.id });
    } else {
      summary.actions.push({ type: "ENSURE_CLEANER_PROFILE", cleanerProfileId: existingProfile.id });
    }

    await tx.metricEvent.create({
      data: {
        tenantId,
        type: "BACKFILL_SERVICES_TENANT",
        payload: {
          userId: user.id,
          email: user.email,
          migratedFromDemo: options.allowDemoMigration && record.isDemoTarget,
          migratedFromHost: options.allowHostHomeMigration && record.tenantClass === "HOST",
          previousTenantId:
            options.allowHostHomeMigration && record.tenantClass === "HOST" ? tenant?.id : null,
        },
      },
    });

    return { tenantId, teamId: team.id, membershipId: membership.id };
  });

  return { summary, result };
}

async function main() {
  const mode = parseMode();
  const emails = parseEmails();
  const apply = mode === "apply";
  const dryRun = mode === "dry-run";
  const preflight = mode === "preflight";
  const yes = process.argv.includes("--yes");
  const allowDemoMigration = hasFlag("--allow-demo-migration");
  const allowHostHomeMigration = hasFlag("--allow-host-home-migration");
  const demoTenantId = process.env.DEMO_TENANT_ID || null;
  const reportJsonPath = getArgValue("--report-json");
  const report = {
    runId: nowIso(),
    mode,
    allowDemoMigration,
    allowHostHomeMigration,
    demoTenantId,
    resultsByUser: {},
  };

  console.log(`runId: ${report.runId}`);

  if (apply && !yes) {
    console.error("Modo apply requiere --yes");
    process.exit(1);
  }

  if (allowDemoMigration) {
    if (!demoTenantId) {
      console.error("DEMO_TENANT_ID no está definido en el entorno.");
      process.exit(1);
    }

    const demoTenant = await prisma.tenant.findUnique({
      where: { id: demoTenantId },
      select: { id: true, name: true, slug: true },
    });
    if (!demoTenant) {
      console.error("DEMO_TENANT_ID no existe en la DB.");
      process.exit(1);
    }
    console.log("Demo tenant validado:", demoTenant);
  }

  console.log(`Modo: ${mode}`);
  console.log(`Usuarios: ${emails.join(", ")}`);
  console.log(`allow-demo-migration: ${allowDemoMigration ? "on" : "off"}`);
  console.log(`allow-host-home-migration: ${allowHostHomeMigration ? "on" : "off"}`);

  const records = [];
  for (const email of emails) {
    const record = await inspectUser(email, {
      allowDemoMigration,
      allowHostHomeMigration,
      demoTenantId,
    });
    records.push(record);
  }

  for (const record of records) {
    console.log("\n---");
    console.log("Usuario:", record.email);
    if (!record.user) {
      console.log("BLOCKERS:", record.blockers);
      report.resultsByUser[record.email] = {
        email: record.email,
        status: "BLOCKED",
        blockers: record.blockers,
        migratedFromDemo: false,
      };
      continue;
    }

    console.log("Antes:", {
      userId: record.before.userId,
      role: record.before.role,
      tenantId: record.before.tenantId,
      tenantSlug: record.before.tenant?.slug || null,
      memberships: record.before.memberships.length,
      legacyMembers: record.before.legacyMembers.length,
      cleanerProfileId: record.before.cleanerProfileId,
    });

    console.log("TenantClass:", {
      tenantClass: record.tenantClass,
      tenantId: record.before.tenantId,
      tenantSlug: record.before.tenant?.slug || null,
      reason: record.tenantClassReason,
    });

    console.log("Memberships:", record.before.memberships);
    console.log("LeaderTeams:", record.leaderTeamIds);
    if (record.before.legacyMembers.length > 0) {
      console.log("Legacy TeamMembers:", record.before.legacyMembers);
    }

    if (record.blockers.length > 0) {
      console.log("BLOCKERS:", record.blockers);
      report.resultsByUser[record.user.id] = {
        email: record.email,
        status: "BLOCKED",
        userId: record.user.id,
        blockers: record.blockers,
        migratedFromDemo: false,
      };
      continue;
    }

    console.log("Plan:", record.plan);
    if (record.migratedFromDemoCandidate) {
      console.log("WOULD_MIGRATE_FROM_DEMO:", {
        previousTenantId: record.before.tenantId,
        newTenantSlug: record.baseSlug,
      });
    }
    if (record.migratedFromHostCandidate) {
      console.log("WOULD_MIGRATE_HOME_FROM_HOST:", {
        previousTenantId: record.before.tenantId,
        previousTenantSlug: record.before.tenant?.slug || null,
        newTenantSlug: record.baseSlug,
      });
    }

    report.resultsByUser[record.user.id] = {
      email: record.email,
      userId: record.user.id,
      status: record.plan.some((p) => p.type === "NOOP") ? "NOOP" : "OK",
      migratedFromDemo: record.migratedFromDemoCandidate,
      migratedFromHost: record.migratedFromHostCandidate,
      previousTenantId: record.before.tenantId,
      proposedTenantSlug: record.baseSlug,
      plan: record.plan,
      blockers: [],
    };

    if (dryRun) {
      console.log("DRY_RUN: sin cambios.");
    }
  }

  if (apply) {
    const results = [];
    const appliedUsers = [];
    for (const record of records) {
      if (record.blockers.length > 0 || !record.user) continue;
      try {
        const applied = await applyForUser(record, {
          allowDemoMigration,
          allowHostHomeMigration,
          demoTenantId,
        });
        const afterUser = await prisma.user.findUnique({
          where: { id: record.user.id },
          select: { id: true, email: true, tenantId: true },
        });
        const afterTenant = afterUser?.tenantId
          ? await prisma.tenant.findUnique({
              where: { id: afterUser.tenantId },
              select: { slug: true },
            })
          : null;
        const afterTeam = afterUser?.tenantId
          ? await prisma.team.findUnique({
              where: {
                tenantId_name: { tenantId: afterUser.tenantId, name: "Mi equipo" },
              },
              select: { id: true },
            })
          : null;
        const afterMembership = afterTeam
          ? await prisma.teamMembership.findUnique({
              where: {
                teamId_userId: { teamId: afterTeam.id, userId: record.user.id },
              },
              select: { id: true },
            })
          : null;

        const migratedFromDemo = record.isDemoTarget && allowDemoMigration;
        const migratedFromHost = record.tenantClass === "HOST" && allowHostHomeMigration;
        const previousTenantId =
          migratedFromDemo || migratedFromHost ? record.before.tenantId : null;
        const row = {
          email: record.email,
          homeTenantId: afterUser?.tenantId || null,
          homeTenantSlug: afterTenant?.slug || null,
          baseTeamId: afterTeam?.id || null,
          tlMembershipId: afterMembership?.id || null,
          migratedFromDemo,
          migratedFromHost,
          previousTenantId,
          actions: applied.summary.actions,
        };
        results.push(row);
        appliedUsers.push({
          userId: record.user.id,
          email: record.email,
          tenantId: afterUser?.tenantId || null,
          teamId: afterTeam?.id || null,
          membershipId: afterMembership?.id || null,
        });
        console.log(`APPLIED: ${record.email}`, applied.summary.actions);
        report.resultsByUser[record.user.id] = {
          email: record.email,
          userId: record.user.id,
          status: "APPLIED",
          migratedFromDemo,
          migratedFromHost,
          previousTenantId,
          newTenantId: afterUser?.tenantId || null,
          baseTeamId: afterTeam?.id || null,
          tlMembershipId: afterMembership?.id || null,
          actions: applied.summary.actions,
          blockers: [],
        };
      } catch (error) {
        console.error(`ERROR (${record.email}):`, error?.message || error);
        const key = record.user?.id || record.email;
        report.resultsByUser[key] = {
          email: record.email,
          userId: record.user?.id || null,
          status: "BLOCKED",
          blockers: [error?.message || "UNKNOWN_ERROR"],
          migratedFromDemo: false,
        };
      }
    }

    console.log("\n=== RESUMEN POST ===");
    for (const row of results) console.log(row);

    if (appliedUsers.length > 0) {
      let hasMismatch = false;
      for (const row of appliedUsers) {
        const user = await prisma.user.findUnique({
          where: { id: row.userId },
          select: { tenantId: true },
        });
        const baseTeam = row.tenantId
          ? await prisma.team.findUnique({
              where: {
                tenantId_name: { tenantId: row.tenantId, name: "Mi equipo" },
              },
              select: { id: true },
            })
          : null;
        const membership = baseTeam
          ? await prisma.teamMembership.findUnique({
              where: {
                teamId_userId: { teamId: baseTeam.id, userId: row.userId },
              },
              select: { id: true },
            })
          : null;

        if (user?.tenantId !== row.tenantId || !baseTeam?.id || !membership?.id) {
          hasMismatch = true;
          console.error("POST_APPLY_MISMATCH:", {
            email: row.email,
            expectedTenantId: row.tenantId,
            actualTenantId: user?.tenantId || null,
            baseTeamId: baseTeam?.id || null,
            membershipId: membership?.id || null,
          });
        }
      }
      if (hasMismatch) {
        console.error("❌ Verificacion post-apply fallida.");
        process.exit(2);
      }
    }
  }

  if (preflight || dryRun) {
    console.log("\n=== RESUMEN PREVIO ===");
    for (const record of records) {
      if (!record.user) {
        console.log({ email: record.email, status: "USER_NOT_FOUND" });
        continue;
      }
      console.log({
        email: record.email,
        userId: record.user.id,
        tenantId: record.before.tenantId,
        tenantSlug: record.before.tenant?.slug || null,
        blockers: record.blockers,
      });
    }
  }

  if (reportJsonPath) {
    const reportToWrite = {
      ...report,
      reportPath: reportJsonPath,
      results: Object.values(report.resultsByUser),
    };
    try {
      fs.writeFileSync(reportJsonPath, JSON.stringify(reportToWrite, null, 2));
      console.log(`Reporte JSON escrito en: ${reportJsonPath}`);
    } catch (error) {
      console.error("No se pudo escribir report-json:", error?.message || error);
      process.exitCode = 1;
    }
  }

  if (reportJsonPath) {
    console.log(`runId: ${report.runId} reportPath: ${reportJsonPath}`);
  } else {
    console.log(`runId: ${report.runId}`);
  }
}

main()
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

