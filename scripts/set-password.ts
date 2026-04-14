// scripts/set-password.ts
// Script para establecer/actualizar contraseña de un usuario

// Cargar variables de entorno
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

import { PrismaClient } from "../lib/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";

// Configurar Neon
try {
  neonConfig.webSocketConstructor = ws;
} catch (error) {
  console.warn("Error configurando WebSocket para Neon:", error);
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter, log: ["error", "warn"] });

async function setPassword(email: string, password: string) {
  try {
    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      console.error(`❌ Usuario no encontrado: ${email}`);
      process.exit(1);
    }

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Actualizar usuario
    await prisma.user.update({
      where: { email },
      data: { hashedPassword },
    });

    console.log(`✅ Contraseña actualizada para: ${email}`);
    console.log(`   Nombre: ${user.name || "N/A"}`);
    console.log(`   ID: ${user.id}`);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Obtener email y password de argumentos de línea de comandos
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Uso: npm run set-password <email> <password>");
  console.error("Ejemplo: npm run set-password ranferi.ia@gmail.com MiPassword123");
  process.exit(1);
}

setPassword(email, password);

