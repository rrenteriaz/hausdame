// Cargar variables de entorno (tsx no carga .env automáticamente como Next.js)
import fs from "fs";
import dotenv from "dotenv";

// Cargar .env.local primero (tiene prioridad), luego .env
if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
} else if (fs.existsSync(".env")) {
  dotenv.config({ path: ".env" });
}

// Validar DATABASE_URL antes de continuar
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
  console.error("❌ Error: DATABASE_URL no está definido.");
  console.error("   Crea .env o .env.local con DATABASE_URL antes de correr el seed.");
  process.exit(1);
}

// ===== BLINDAJE 1: Requerir flag explícito ALLOW_DEMO_SEED =====
if (process.env.ALLOW_DEMO_SEED !== "1") {
  console.error("❌ Error: Refusing to run seed-dev-users.ts without ALLOW_DEMO_SEED=1");
  console.error("   This script can create demo tenants/users.");
  console.error("   To run intentionally, set: ALLOW_DEMO_SEED=1");
  console.error("   Example: ALLOW_DEMO_SEED=1 ALLOW_SEED_WRITES=1 npx tsx scripts/seed-dev-users.ts --create-demo");
  process.exit(1);
}

// ===== BLINDAJE 2: No permitir en producción =====
if (process.env.NODE_ENV === "production") {
  console.error("❌ Error: This script cannot run in production (NODE_ENV=production)");
  console.error("   This script is designed only for development.");
  process.exit(1);
}

// ===== BLINDAJE 3: Requerir ALLOW_SEED_WRITES para escribir a BD =====
if (process.env.ALLOW_SEED_WRITES !== "1") {
  console.error("❌ Error: Refusing to run because ALLOW_SEED_WRITES=1 is required to write to DB.");
  console.error("   This script will create/update tenants and users.");
  console.error("   To run intentionally, set: ALLOW_SEED_WRITES=1");
  console.error("   Example: ALLOW_DEMO_SEED=1 ALLOW_SEED_WRITES=1 npx tsx scripts/seed-dev-users.ts --create-demo");
  process.exit(1);
}

// ===== Sanitizar DATABASE_URL para logs =====
function sanitizeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Ocultar password si existe
    if (parsed.password) {
      parsed.password = "***";
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    // Si no es URL válida, mostrar solo primeros caracteres
    return url.substring(0, 20) + "...";
  }
}

function getDatabaseFingerprint(url: string): { host: string; dbName: string } {
  try {
    const parsed = new URL(url);
    const dbName = parsed.pathname ? parsed.pathname.replace(/^\//, "") : "unknown";
    return {
      host: parsed.host || "unknown",
      dbName: dbName || "unknown",
    };
  } catch {
    return { host: "unknown", dbName: "unknown" };
  }
}

// ===== Parsear argumentos =====
const args = process.argv.slice(2);
const createDemo = args.includes("--create-demo");
const force = args.includes("--force");

// ===== Constantes para tenant demo =====
const DEMO_TENANT_SLUG = "hausdame-demo";
const DEMO_TENANT_NAME = "Hausdame Demo";

// ===== Logs de inicio =====
const dbUrl = process.env.DATABASE_URL!;
const dbFingerprint = getDatabaseFingerprint(dbUrl);

console.log("=".repeat(80));
console.log("SEED DEV USERS - Modo Seguro");
console.log("=".repeat(80));
console.log(`Script: seed-dev-users.ts`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || "undefined"}`);
console.log(`Database fingerprint:`);
console.log(`  Host: ${dbFingerprint.host}`);
console.log(`  Database: ${dbFingerprint.dbName}`);
console.log(`  Full URL (sanitized): ${sanitizeDatabaseUrl(dbUrl)}`);
console.log(`Flags:`);
console.log(`  --create-demo: ${createDemo ? "✅ YES" : "❌ NO"}`);
console.log(`  --force: ${force ? "✅ YES" : "❌ NO"}`);
console.log(`Environment gates:`);
console.log(`  ALLOW_DEMO_SEED: ✅ YES`);
console.log(`  ALLOW_SEED_WRITES: ✅ YES`);
if (process.env.SEED_ALLOWED_DB_HOST) {
  console.log(`  SEED_ALLOWED_DB_HOST: ${process.env.SEED_ALLOWED_DB_HOST}`);
}
console.log("=".repeat(80));
console.log();

// ===== BLINDAJE OPCIONAL: Validar host permitido =====
if (process.env.SEED_ALLOWED_DB_HOST) {
  const allowedHost = process.env.SEED_ALLOWED_DB_HOST.trim();
  if (dbFingerprint.host !== allowedHost && !dbFingerprint.host.includes(allowedHost)) {
    console.error("❌ Error: Database host does not match SEED_ALLOWED_DB_HOST");
    console.error(`   Expected host to contain: ${allowedHost}`);
    console.error(`   Actual host: ${dbFingerprint.host}`);
    process.exit(1);
  }
}

import { PrismaClient, UserRole } from "../lib/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";

// Configurar Neon para usar WebSocket en Node.js
try {
  neonConfig.webSocketConstructor = ws;
} catch (error) {
  console.warn("Error configurando WebSocket para Neon:", error);
}

// Crear PrismaClient con adapter de Neon (igual que lib/prisma.ts)
const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({
  adapter,
  log: ["error", "warn"],
});

// Roles válidos según el schema (UserRole enum: OWNER, ADMIN, CLEANER, HANDYMAN)
type Role = UserRole;

const DEFAULT_PASSWORD = "Test123456"; // SOLO DEV

function emailOf(role: string, n: number) {
  return `${role.toLowerCase()}${n}@hausdame.test`;
}

async function checkForDuplicateUsers(email: string, targetTenantId: string): Promise<boolean> {
  const existingUsers = await prisma.user.findMany({
    where: { email },
    select: { id: true, tenantId: true, email: true },
  });

  if (existingUsers.length === 0) {
    return false; // No hay duplicados
  }

  // Verificar si alguno está en otro tenant
  const inOtherTenant = existingUsers.some(u => u.tenantId !== targetTenantId);
  
  if (inOtherTenant) {
    console.error(`⚠️  DUPLICADO DETECTADO: Email "${email}" existe en otros tenants:`);
    for (const u of existingUsers) {
      if (u.tenantId) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: u.tenantId },
          select: { name: true, slug: true },
        });
        console.error(`  - Usuario ${u.id} en tenant: ${tenant?.name || u.tenantId} (${tenant?.slug || "unknown"})`);
      } else {
        console.error(`  - Usuario ${u.id} sin tenant (tenantId: null)`);
      }
    }
    return true; // Hay duplicado en otro tenant
  }

  return false; // Todos están en el mismo tenant, no es problema
}

async function createOrUpdateUser(params: {
  tenantId: string;
  role: Role;
  email: string;
  password: string;
  force?: boolean;
}) {
  // Verificar duplicados antes de crear/actualizar
  const hasDuplicate = await checkForDuplicateUsers(params.email, params.tenantId);
  
  if (hasDuplicate && !params.force) {
    throw new Error(
      `Cannot create/update user "${params.email}": email exists in different tenant. ` +
      `Use --force to override (not recommended).`
    );
  }

  if (hasDuplicate && params.force) {
    console.warn(`⚠️  FORCE MODE: Proceeding despite duplicate email "${params.email}"`);
    console.warn(`   WARNING: This may create a duplicate user in tenant ${params.tenantId}`);
  }

  const hashedPassword = await bcrypt.hash(params.password, 10);

  // ===== NO usar upsert global por email =====
  // Buscar usuario SOLO dentro del tenant objetivo
  const existing = await prisma.user.findFirst({
    where: { 
      email: params.email,
      tenantId: params.tenantId,
    },
    select: { id: true, tenantId: true, email: true },
  });

  if (existing) {
    // Usuario existe en el tenant objetivo => update por id
    console.log(`  📝 Updating user ${params.email} (id: ${existing.id}) in tenant ${params.tenantId}`);
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        role: params.role,
        tenantId: params.tenantId,
        hashedPassword,
      },
    });
  } else {
    // Usuario no existe en el tenant objetivo => create
    if (hasDuplicate && params.force) {
      console.warn(`  ⚠️  Creating duplicate user ${params.email} in tenant ${params.tenantId} (force mode)`);
    } else {
      console.log(`  📝 Creating user ${params.email} in tenant ${params.tenantId}`);
    }
    return prisma.user.create({
      data: {
        email: params.email,
        role: params.role,
        tenantId: params.tenantId,
        hashedPassword,
      },
    });
  }
}

async function main() {
  // ===== BLINDAJE 4: Requerir --create-demo para crear tenant demo =====
  // Buscar por slug (canónico), no por name
  const existingDemoTenant = await prisma.tenant.findUnique({ 
    where: { slug: DEMO_TENANT_SLUG },
    select: { id: true, name: true, slug: true },
  });

  if (existingDemoTenant) {
    if (existingDemoTenant.name !== DEMO_TENANT_NAME) {
      console.warn(`⚠️  WARNING: Tenant with slug "${DEMO_TENANT_SLUG}" exists but name is "${existingDemoTenant.name}" (expected "${DEMO_TENANT_NAME}")`);
      console.warn(`   No automatic changes will be made.`);
    }
    console.log(`✅ Demo tenant found: ${existingDemoTenant.name} (${existingDemoTenant.id}, slug: ${existingDemoTenant.slug})`);
  } else {
    if (!createDemo) {
      console.error("❌ Error: Demo tenant missing.");
      console.error(`   Tenant with slug "${DEMO_TENANT_SLUG}" does not exist.`);
      console.error("   Re-run with --create-demo if you really want to create it.");
      console.error("   Example: ALLOW_DEMO_SEED=1 ALLOW_SEED_WRITES=1 npx tsx scripts/seed-dev-users.ts --create-demo");
      process.exit(1);
    }
    
    console.log(`📝 PLAN: Creating demo tenant '${DEMO_TENANT_NAME}' (slug: '${DEMO_TENANT_SLUG}')...`);
  }

  // 1) Usa un tenant existente o crea uno de pruebas (solo si --create-demo)
  const tenant = existingDemoTenant ?? (createDemo ? await prisma.tenant.create({
    data: {
      name: DEMO_TENANT_NAME,
      slug: DEMO_TENANT_SLUG,
    },
  }) : null);

  if (!tenant) {
    console.error("❌ Error: No tenant available and --create-demo not provided");
    process.exit(1);
  }

  if (!existingDemoTenant && createDemo) {
    console.log(`✅ Tenant created: ${tenant.name} (${tenant.id}, slug: ${tenant.slug})`);
  }

  // 2) Crear usuarios por rol (solo roles válidos: OWNER, ADMIN, CLEANER, HANDYMAN)
  const plan: Array<{ role: Role; count: number }> = [
    { role: "OWNER", count: 1 },
    { role: "ADMIN", count: 2 },
    { role: "CLEANER", count: 8 },
  ];

  console.log();
  console.log("📝 PLAN: Creating/updating users:");
  for (const item of plan) {
    for (let i = 1; i <= item.count; i++) {
      const email = emailOf(item.role, i);
      console.log(`  - ${email} (${item.role})`);
    }
  }
  console.log();

  const created: string[] = [];
  const errors: string[] = [];

  for (const item of plan) {
    for (let i = 1; i <= item.count; i++) {
      const email = emailOf(item.role, i);
      try {
        await createOrUpdateUser({
          tenantId: tenant.id,
          role: item.role,
          email,
          password: DEFAULT_PASSWORD,
          force,
        });
        created.push(`${email} (${item.role})`);
      } catch (error: any) {
        const errorMsg = `${email} (${item.role}): ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ Error: ${errorMsg}`);
      }
    }
  }

  console.log();
  console.log("=".repeat(80));
  if (created.length > 0) {
    console.log("✅ Tenant:", tenant.name, tenant.id);
    console.log(`✅ Usuarios creados/actualizados (${created.length}):`);
    for (const line of created) console.log(" -", line);
  }
  if (errors.length > 0) {
    console.log(`⚠️  Errores (${errors.length}):`);
    for (const error of errors) console.log(" -", error);
  }
  console.log("=".repeat(80));

  // (Opcional) si ya tienes propiedades y quieres asignar cleaners automáticamente:
  // - buscar propiedades del tenant
  // - crear PropertyCleaner para algunos cleaners
  // NOTA: solo si tu flujo lo requiere para pruebas fuera de marketplace.
}

main()
  .catch((e) => {
    console.error("❌ Fatal error:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
