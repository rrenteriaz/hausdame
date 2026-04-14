// scripts/debug/diagnose-demo-tenant-origin.ts
// Script de diagnóstico SOLO LECTURA para investigar origen de tenant/usuario duplicado

import fs from "fs";
import dotenv from "dotenv";

// Cargar variables de entorno
if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
} else if (fs.existsSync(".env")) {
  dotenv.config({ path: ".env" });
}

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
  console.error("❌ Error: DATABASE_URL no está definido.");
  process.exit(1);
}

import { PrismaClient } from "../../lib/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

try {
  neonConfig.webSocketConstructor = ws;
} catch (error) {
  console.warn("Error configurando WebSocket para Neon:", error);
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter, log: ["error", "warn"] });

async function diagnose() {
  console.log("=".repeat(80));
  console.log("DIAGNÓSTICO: Origen de Tenant 'Hausdame Demo' y Usuario Duplicado");
  console.log("=".repeat(80));
  console.log();

  // ===== CONTEXT: Conteos globales =====
  console.log("📊 CONTEXTO: Conteos globales");
  console.log("-".repeat(80));
  const tenantCount = await prisma.tenant.count();
  const userCount = await prisma.user.count();
  console.log(`Total Tenants: ${tenantCount}`);
  console.log(`Total Users: ${userCount}`);
  console.log();

  // ===== TENANTS: Buscar tenants específicos =====
  console.log("🏢 TENANTS: Buscando tenants específicos");
  console.log("-".repeat(80));
  const targetTenantSlugs = [
    "hausdame-demo",
    "services-licha",
    "services-itzel",
    "host-ranferi",
  ];

  const tenants = await prisma.tenant.findMany({
    where: {
      slug: { in: targetTenantSlugs },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (tenants.length === 0) {
    console.log("⚠️  No se encontraron tenants con los slugs buscados.");
  } else {
    for (const tenant of tenants) {
      console.log(`\nTenant: ${tenant.name}`);
      console.log(`  ID: ${tenant.id}`);
      console.log(`  Slug: ${tenant.slug}`);
      console.log(`  Creado: ${tenant.createdAt.toISOString()}`);
      console.log(`  Actualizado: ${tenant.updatedAt.toISOString()}`);
    }
  }
  console.log();

  // ===== USERS: Buscar usuarios específicos =====
  console.log("👤 USERS: Buscando usuarios específicos");
  console.log("-".repeat(80));
  const targetEmails = [
    "cleaner2@hausdame.test",
    "cleaner1@hausdame.test",
    "ranferi.ia@gmail.com",
  ];

  const users = await prisma.user.findMany({
    where: {
      email: { in: targetEmails },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (users.length === 0) {
    console.log("⚠️  No se encontraron usuarios con los emails buscados.");
  } else {
    // Agrupar por email para detectar duplicados
    const usersByEmail = new Map<string, typeof users>();
    for (const user of users) {
      if (!usersByEmail.has(user.email)) {
        usersByEmail.set(user.email, []);
      }
      usersByEmail.get(user.email)!.push(user);
    }

    for (const [email, emailUsers] of usersByEmail.entries()) {
      console.log(`\nEmail: ${email}`);
      if (emailUsers.length > 1) {
        console.log(`  ⚠️  DUPLICADO: ${emailUsers.length} usuarios con este email`);
      }
      for (const user of emailUsers) {
        console.log(`  - ID: ${user.id}`);
        console.log(`    Nombre: ${user.name || "(null)"}`);
        console.log(`    Rol: ${user.role}`);
        console.log(`    Tenant ID: ${user.tenantId}`);
        
        // Guard clause: saltar si user no tiene tenantId
        if (!user.tenantId) {
          console.log(`    ⚠️ User sin tenantId (null): ${user.id} (${user.email ?? "sin email"})`);
          console.log(`    Creado: ${user.createdAt.toISOString()}`);
          console.log(`    Actualizado: ${user.updatedAt.toISOString()}`);
          continue;
        }
        
        // Obtener nombre del tenant
        const tenant = await prisma.tenant.findUnique({
          where: { id: user.tenantId },
          select: { name: true, slug: true },
        });
        if (tenant) {
          console.log(`    Tenant: ${tenant.name} (${tenant.slug})`);
        } else {
          console.log(`    Tenant: ⚠️  NO ENCONTRADO (tenantId: ${user.tenantId})`);
        }
        console.log(`    Creado: ${user.createdAt.toISOString()}`);
        console.log(`    Actualizado: ${user.updatedAt.toISOString()}`);
      }
    }
  }
  console.log();

  // ===== ANÁLISIS: Detectar problemas =====
  console.log("🔍 ANÁLISIS: Detección de problemas");
  console.log("-".repeat(80));

  // Verificar si hay múltiples tenants "Hausdame Demo"
  const demoTenants = tenants.filter((t) => t.slug === "hausdame-demo");
  if (demoTenants.length > 1) {
    console.log(`⚠️  PROBLEMA: ${demoTenants.length} tenants con slug "hausdame-demo"`);
    for (const t of demoTenants) {
      console.log(`  - ${t.id} creado en ${t.createdAt.toISOString()}`);
    }
  } else if (demoTenants.length === 1) {
    console.log(`✅ Un solo tenant "hausdame-demo" encontrado: ${demoTenants[0].id}`);
  } else {
    console.log(`⚠️  No se encontró tenant "hausdame-demo"`);
  }

  // Verificar usuarios duplicados
  const cleaner2Users = users.filter((u) => u.email === "cleaner2@hausdame.test");
  if (cleaner2Users.length > 1) {
    console.log(`\n⚠️  PROBLEMA: ${cleaner2Users.length} usuarios con email "cleaner2@hausdame.test"`);
    for (const u of cleaner2Users) {
      // Guard clause: saltar si user no tiene tenantId
      if (!u.tenantId) {
        console.log(`  - ${u.id} ⚠️ sin tenantId (creado: ${u.createdAt.toISOString()})`);
        continue;
      }
      
      const tenant = await prisma.tenant.findUnique({
        where: { id: u.tenantId },
        select: { slug: true },
      });
      console.log(`  - ${u.id} en tenant ${tenant?.slug || u.tenantId} (creado: ${u.createdAt.toISOString()})`);
    }
  } else if (cleaner2Users.length === 1) {
    console.log(`✅ Un solo usuario "cleaner2@hausdame.test" encontrado`);
  } else {
    console.log(`⚠️  No se encontró usuario "cleaner2@hausdame.test"`);
  }

  console.log();
  console.log("=".repeat(80));
  console.log("FIN DEL DIAGNÓSTICO");
  console.log("=".repeat(80));
}

diagnose()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

