// scripts/check-and-fix-user.ts
// Script para verificar y crear/resetear usuario de prueba
// BLINDAJE: Requiere email explícito, no crea tenant demo automáticamente

import fs from "fs";
import dotenv from "dotenv";

if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
} else if (fs.existsSync(".env")) {
  dotenv.config({ path: ".env" });
}

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
  console.error("❌ Error: DATABASE_URL no está definido.");
  process.exit(1);
}

// ===== BLINDAJE: No permitir en producción =====
if (process.env.NODE_ENV === "production") {
  console.error("❌ Error: This script cannot run in production (NODE_ENV=production)");
  console.error("   This script is designed only for development.");
  process.exit(1);
}

// ===== Parsear argumentos =====
const args = process.argv.slice(2);
const force = args.includes("--force");
const createDemo = args.includes("--create-demo");

// Buscar --email=... o email como primer argumento posicional
let email: string | null = null;
let password: string = "Test123456";

for (const arg of args) {
  if (arg.startsWith("--email=")) {
    email = arg.substring("--email=".length);
  } else if (arg.startsWith("--password=")) {
    password = arg.substring("--password=".length);
  } else if (!arg.startsWith("--") && !email) {
    // Primer argumento posicional sin -- es el email
    email = arg;
  }
}

// Si hay segundo argumento posicional y no es flag, es password
const positionalArgs = args.filter(arg => !arg.startsWith("--"));
if (positionalArgs.length >= 2 && !email) {
  email = positionalArgs[0];
  password = positionalArgs[1];
} else if (positionalArgs.length >= 1 && !email) {
  email = positionalArgs[0];
}

// ===== BLINDAJE: Requerir email explícito =====
if (!email || email.trim() === "") {
  console.error("❌ Error: Email is required");
  console.error();
  console.error("Usage:");
  console.error("  npx tsx scripts/check-and-fix-user.ts <email> [password]");
  console.error("  npx tsx scripts/check-and-fix-user.ts --email=<email> [--password=<password>]");
  console.error();
  console.error("Options:");
  console.error("  --force              Allow creating/updating even if email exists in different tenant");
  console.error("  --create-demo        Allow creating 'Hausdame Demo' tenant if needed (requires ALLOW_DEMO_SEED=1)");
  console.error();
  console.error("Environment variables:");
  console.error("  ALLOW_SEED_WRITES=1 Required to write to database (create/update users)");
  console.error("  ALLOW_DEMO_SEED=1   Required only if using --create-demo");
  console.error();
  console.error("Examples:");
  console.error("  ALLOW_SEED_WRITES=1 npx tsx scripts/check-and-fix-user.ts cleaner2@hausdame.test");
  console.error("  ALLOW_SEED_WRITES=1 ALLOW_DEMO_SEED=1 npx tsx scripts/check-and-fix-user.ts cleaner2@hausdame.test --create-demo");
  process.exit(1);
}

email = email.trim().toLowerCase();

// ===== Constantes para tenant demo =====
const DEMO_TENANT_SLUG = "hausdame-demo";
const DEMO_TENANT_NAME = "Hausdame Demo";

// ===== Sanitizar DATABASE_URL para logs =====
function sanitizeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
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

// ===== Logs de inicio =====
const dbUrl = process.env.DATABASE_URL!;
const dbFingerprint = getDatabaseFingerprint(dbUrl);

console.log("=".repeat(80));
console.log("CHECK AND FIX USER - Modo Seguro");
console.log("=".repeat(80));
console.log(`Script: check-and-fix-user.ts`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || "undefined"}`);
console.log(`Database fingerprint:`);
console.log(`  Host: ${dbFingerprint.host}`);
console.log(`  Database: ${dbFingerprint.dbName}`);
console.log(`  Full URL (sanitized): ${sanitizeDatabaseUrl(dbUrl)}`);
console.log(`Email: ${email}`);
console.log(`Flags:`);
console.log(`  --force: ${force ? "✅ YES" : "❌ NO"}`);
console.log(`  --create-demo: ${createDemo ? "✅ YES" : "❌ NO"}`);
console.log(`Environment gates:`);
if (process.env.ALLOW_DEMO_SEED === "1") {
  console.log(`  ALLOW_DEMO_SEED: ✅ YES`);
}
if (process.env.ALLOW_SEED_WRITES === "1") {
  console.log(`  ALLOW_SEED_WRITES: ✅ YES`);
}
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

import { PrismaClient } from "../lib/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";

try {
  neonConfig.webSocketConstructor = ws;
} catch (error) {
  console.warn("Error configurando WebSocket para Neon:", error);
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter, log: ["error", "warn"] });

async function checkAndFixUser(email: string | null, password: string) {
  if (!email) {
    console.error("❌ Error: Email is null");
    process.exit(1);
  }
  try {
    // ===== BLINDAJE: Buscar TODOS los usuarios con este email (puede haber duplicados) =====
    const allUsersWithEmail = await prisma.user.findMany({
      where: { email },
      select: { 
        id: true, 
        email: true, 
        name: true, 
        role: true, 
        tenantId: true, 
        hashedPassword: true 
      },
    });

    if (allUsersWithEmail.length > 1) {
      console.error(`⚠️  DUPLICADO DETECTADO: Email "${email}" existe en ${allUsersWithEmail.length} usuarios:`);
      for (const u of allUsersWithEmail) {
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
      
      if (!force) {
        console.error("❌ Error: Cannot proceed with duplicate emails.");
        console.error("   Use --force to override (not recommended).");
        process.exit(1);
      } else {
        console.warn("⚠️  FORCE MODE: Proceeding despite duplicate emails");
      }
    }

    // Usar el primer usuario encontrado (o null si no existe)
    const user = allUsersWithEmail.length > 0 ? allUsersWithEmail[0] : null;

    if (!user) {
      console.log(`⚠️  Usuario no encontrado: ${email}`);
      console.log(`📝 PLAN: Creating new user...`);
      
      // ===== BLINDAJE: Requerir ALLOW_SEED_WRITES para escribir =====
      if (process.env.ALLOW_SEED_WRITES !== "1") {
        console.error("❌ Error: ALLOW_SEED_WRITES=1 is required to create users.");
        console.error("   This script will create a new user in the database.");
        console.error("   To run intentionally, set: ALLOW_SEED_WRITES=1");
        console.error("   Example: ALLOW_SEED_WRITES=1 npx tsx scripts/check-and-fix-user.ts <email>");
        process.exit(1);
      }
      
      // ===== BLINDAJE: NO crear tenant demo automáticamente =====
      // Buscar por slug (canónico), no por name
      let tenant = await prisma.tenant.findUnique({ 
        where: { slug: DEMO_TENANT_SLUG },
        select: { id: true, name: true, slug: true },
      });
      
      if (!tenant) {
        if (!createDemo) {
          console.error(`❌ Error: Demo tenant with slug "${DEMO_TENANT_SLUG}" does not exist.`);
          console.error("   This script will NOT create it automatically.");
          console.error("   Options:");
          console.error("     1. Create tenant manually first");
          console.error("     2. Use --create-demo flag (requires ALLOW_DEMO_SEED=1 and ALLOW_SEED_WRITES=1)");
          console.error("     3. Specify a different tenant ID");
          process.exit(1);
        }
        
        // Verificar flag ALLOW_DEMO_SEED
        if (process.env.ALLOW_DEMO_SEED !== "1") {
          console.error("❌ Error: --create-demo requires ALLOW_DEMO_SEED=1");
          console.error("   Example: ALLOW_DEMO_SEED=1 ALLOW_SEED_WRITES=1 npx tsx scripts/check-and-fix-user.ts <email> --create-demo");
          process.exit(1);
        }
        
        // Verificar ALLOW_SEED_WRITES también (para crear tenant)
        if (process.env.ALLOW_SEED_WRITES !== "1") {
          console.error("❌ Error: --create-demo requires ALLOW_SEED_WRITES=1 to create tenant.");
          console.error("   Example: ALLOW_DEMO_SEED=1 ALLOW_SEED_WRITES=1 npx tsx scripts/check-and-fix-user.ts <email> --create-demo");
          process.exit(1);
        }
        
        console.log(`📝 PLAN: Creating demo tenant '${DEMO_TENANT_NAME}' (slug: '${DEMO_TENANT_SLUG}')...`);
        tenant = await prisma.tenant.create({
          data: {
            name: DEMO_TENANT_NAME,
            slug: DEMO_TENANT_SLUG,
          },
        });
        console.log(`✅ Tenant creado: ${tenant.id} (slug: ${tenant.slug})`);
      } else {
        if (tenant.name !== DEMO_TENANT_NAME) {
          console.warn(`⚠️  WARNING: Tenant with slug "${DEMO_TENANT_SLUG}" exists but name is "${tenant.name}" (expected "${DEMO_TENANT_NAME}")`);
          console.warn(`   No automatic changes will be made.`);
        }
        console.log(`✅ Using existing demo tenant: ${tenant.name} (${tenant.id}, slug: ${tenant.slug})`);
      }

      // Hashear contraseña
      const hashedPassword = await bcrypt.hash(password, 10);

      // Crear usuario
      console.log(`📝 PLAN: Creating user ${email} in tenant ${tenant.id}...`);
      const newUser = await prisma.user.create({
        data: {
          email,
          role: "CLEANER",
          tenantId: tenant.id,
          hashedPassword,
        },
      });

      console.log(`✅ Usuario creado:`);
      console.log(`   Email: ${newUser.email}`);
      console.log(`   ID: ${newUser.id}`);
      console.log(`   Role: ${newUser.role}`);
      console.log(`   Tenant: ${tenant.name} (${tenant.slug})`);
      console.log(`   Password: ${password}`);
    } else {
      console.log(`✅ Usuario encontrado: ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Role: ${user.role}`);
      
      if (user.tenantId) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: user.tenantId },
          select: { name: true, slug: true },
        });
        console.log(`   Tenant: ${tenant?.name || user.tenantId} (${tenant?.slug || "unknown"})`);
      } else {
        console.log(`   Tenant: null (sin tenant asignado)`);
      }

      // Verificar contraseña
      if (user.hashedPassword) {
        const isValid = await bcrypt.compare(password, user.hashedPassword);
        if (isValid) {
          console.log(`✅ Contraseña correcta`);
        } else {
          // ===== BLINDAJE: Requerir ALLOW_SEED_WRITES para actualizar =====
          if (process.env.ALLOW_SEED_WRITES !== "1") {
            console.error("❌ Error: ALLOW_SEED_WRITES=1 is required to update user password.");
            console.error("   This script will update the user's password in the database.");
            console.error("   To run intentionally, set: ALLOW_SEED_WRITES=1");
            console.error("   Example: ALLOW_SEED_WRITES=1 npx tsx scripts/check-and-fix-user.ts <email>");
            process.exit(1);
          }
          
          console.log(`⚠️  Contraseña incorrecta. Reseteando...`);
          console.log(`📝 PLAN: Updating password for user ${user.id}...`);
          const hashedPassword = await bcrypt.hash(password, 10);
          // ===== NO usar update por email, usar por id =====
          await prisma.user.update({
            where: { id: user.id },
            data: { hashedPassword },
          });
          console.log(`✅ Contraseña reseteada a: ${password}`);
        }
      } else {
        // ===== BLINDAJE: Requerir ALLOW_SEED_WRITES para actualizar =====
        if (process.env.ALLOW_SEED_WRITES !== "1") {
          console.error("❌ Error: ALLOW_SEED_WRITES=1 is required to set user password.");
          console.error("   This script will update the user's password in the database.");
          console.error("   To run intentionally, set: ALLOW_SEED_WRITES=1");
          console.error("   Example: ALLOW_SEED_WRITES=1 npx tsx scripts/check-and-fix-user.ts <email>");
          process.exit(1);
        }
        
        console.log(`⚠️  Usuario sin contraseña. Estableciendo...`);
        console.log(`📝 PLAN: Setting password for user ${user.id}...`);
        const hashedPassword = await bcrypt.hash(password, 10);
        // ===== NO usar update por email, usar por id =====
        await prisma.user.update({
          where: { id: user.id },
          data: { hashedPassword },
        });
        console.log(`✅ Contraseña establecida a: ${password}`);
      }
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`🔍 Verificando usuario: ${email}`);
checkAndFixUser(email, password);
