/**
 * Script de migración: Convierte workingDays + workingStartTime/workingEndTime
 * a TeamMemberScheduleDay (1 registro por día de la semana).
 * 
 * Ejecutar con: npx tsx prisma/migrate-schedules.ts
 * 
 * IMPORTANTE: Asegúrate de tener un archivo .env en la raíz del proyecto con DATABASE_URL
 */

// Cargar variables de entorno PRIMERO (antes de cualquier otra importación)
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";
import { PrismaClient } from "../lib/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Buscar el archivo .env en diferentes ubicaciones
const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local"),
  resolve(__dirname, "..", ".env"),
  resolve(__dirname, "..", ".env.local"),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    const result = config({ path: envPath });
    if (!result.error) {
      console.log(`✅ Variables de entorno cargadas desde: ${envPath}`);
      envLoaded = true;
      break;
    }
  }
}

if (!envLoaded) {
  console.warn("⚠️  No se encontró archivo .env, intentando cargar desde variables de entorno del sistema...");
  // Intentar cargar desde el directorio actual
  config();
}

// Verificar que DATABASE_URL esté disponible
if (!process.env.DATABASE_URL) {
  console.error("\n❌ Error: DATABASE_URL no está definida en las variables de entorno.");
  console.error("   Por favor, crea un archivo .env en la raíz del proyecto con:");
  console.error("   DATABASE_URL=tu_connection_string_aqui");
  console.error("\n   O ejecuta el script con:");
  console.error("   DATABASE_URL=tu_connection_string npx tsx prisma/migrate-schedules.ts");
  process.exit(1);
}

// Crear PrismaClient directamente (sin usar lib/prisma.ts para evitar validación temprana)
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Mapeo de días: JavaScript getDay() -> nombres
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

async function migrateSchedules() {
  console.log("🔄 Iniciando migración de horarios...");

  try {
    // Obtener todos los TeamMembers
    const members = await (prisma as any).teamMember.findMany({
      select: {
        id: true,
        tenantId: true,
        workingDays: true,
        workingStartTime: true,
        workingEndTime: true,
      },
    });

    console.log(`📋 Encontrados ${members.length} miembros para migrar`);

    let migrated = 0;
    let skipped = 0;

    for (const member of members) {
      // Verificar si ya tiene schedules (evitar duplicados)
      const existingSchedules = await (prisma as any).teamMemberScheduleDay.findMany({
        where: {
          memberId: member.id,
        },
      });

      if (existingSchedules.length > 0) {
        console.log(`⏭️  Miembro ${member.id} ya tiene schedules, omitiendo...`);
        skipped++;
        continue;
      }

      // Obtener workingDays (puede ser null, undefined, o array vacío)
      let workingDays: string[] = [];
      if (member.workingDays && Array.isArray(member.workingDays)) {
        workingDays = member.workingDays;
      }

      // Si no tiene workingDays, usar default: Lun-Vie
      if (workingDays.length === 0) {
        workingDays = ["MON", "TUE", "WED", "THU", "FRI"];
      }

      // Obtener horarios (con defaults)
      const startTime = member.workingStartTime || "08:00";
      const endTime = member.workingEndTime || "18:00";

      // Crear 7 registros (uno por cada día de la semana)
      const schedulesToCreate = [];

      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const dayName = DAY_NAMES[dayOfWeek];
        const isWorking = workingDays.includes(dayName);

        schedulesToCreate.push({
          tenantId: member.tenantId,
          memberId: member.id,
          dayOfWeek,
          isWorking,
          startTime: isWorking ? startTime : null,
          endTime: isWorking ? endTime : null,
        });
      }

      // Crear todos los schedules en una transacción
      await (prisma as any).teamMemberScheduleDay.createMany({
        data: schedulesToCreate,
        skipDuplicates: true,
      });

      migrated++;
      console.log(`✅ Migrado miembro ${member.id} (${workingDays.length} días activos)`);
    }

    console.log(`\n✨ Migración completada:`);
    console.log(`   - Migrados: ${migrated}`);
    console.log(`   - Omitidos: ${skipped}`);
    console.log(`   - Total: ${members.length}`);
  } catch (error) {
    console.error("❌ Error durante la migración:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar migración
migrateSchedules()
  .then(() => {
    console.log("\n🎉 Migración finalizada exitosamente");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error fatal:", error);
    process.exit(1);
  });

