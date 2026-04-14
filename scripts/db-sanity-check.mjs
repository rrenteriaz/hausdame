#!/usr/bin/env node
/**
 * DB Sanity Check - Valida estructuras críticas de la base de datos
 * 
 * Este script ejecuta validaciones READ-ONLY para detectar drift entre
 * el schema Prisma y la base de datos real.
 * 
 * Uso:
 *   npm run db:sanity
 * 
 * Exit codes:
 *   0: Todas las validaciones pasaron
 *   1: Falló alguna validación crítica
 */

import 'dotenv/config';
import { PrismaClient } from '../lib/generated/prisma';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configurar Neon para usar WebSocket en Node.js
if (typeof window === 'undefined') {
  try {
    neonConfig.webSocketConstructor = ws;
  } catch (error) {
    console.warn('⚠️  Error configurando WebSocket para Neon:', error.message);
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ ERROR: DATABASE_URL no está definida');
  process.exit(1);
}

// Censurar DATABASE_URL para logging seguro
function censorUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? ':' + urlObj.port : ''}${urlObj.pathname}`;
  } catch {
    return '***';
  }
}

console.log('🔍 DB Sanity Check - Iniciando validación...');
console.log(`📡 Conectando a: ${censorUrl(connectionString)}`);
console.log('');

// Crear adapter y cliente
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

let hasErrors = false;
let hasWarnings = false;
const isProduction = process.env.NODE_ENV === 'production';

async function checkTableExists(tableName) {
  try {
    const result = await prisma.$queryRaw`
      SELECT table_name::text as table_name
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name=${tableName};
    `;
    return Array.isArray(result) && result.length > 0;
  } catch (error) {
    console.error(`❌ Error verificando tabla ${tableName}:`, error.message);
    return false;
  }
}

async function checkColumnExists(tableName, columnName) {
  try {
    const result = await prisma.$queryRaw`
      SELECT column_name::text as column_name
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name=${tableName}
        AND column_name=${columnName};
    `;
    return Array.isArray(result) && result.length > 0;
  } catch (error) {
    console.error(`❌ Error verificando columna ${tableName}.${columnName}:`, error.message);
    return false;
  }
}

async function checkMigrationsHealth() {
  try {
    // Verificar si existe la tabla _prisma_migrations
    const migrationsTableExists = await checkTableExists('_prisma_migrations');
    
    if (!migrationsTableExists) {
      console.log('⚠️  WARNING: Tabla _prisma_migrations no existe');
      hasWarnings = true;
      return;
    }

    // Obtener últimas 10 migraciones
    const migrations = await prisma.$queryRaw`
      SELECT 
        migration_name::text as migration_name,
        finished_at,
        applied_steps_count
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 10;
    `;

    if (!Array.isArray(migrations) || migrations.length === 0) {
      console.log('⚠️  WARNING: No se encontraron migraciones aplicadas');
      hasWarnings = true;
      return;
    }

    // Verificar migraciones con applied_steps_count=0 pero finished_at no null
    const problematicMigrations = migrations.filter(
      m => m.finished_at !== null && m.applied_steps_count === 0
    );

    if (problematicMigrations.length > 0) {
      console.log('⚠️  WARNING: Migraciones marcadas como aplicadas pero con applied_steps_count=0:');
      problematicMigrations.forEach(m => {
        console.log(`   - ${m.migration_name} (finished_at: ${m.finished_at}, steps: ${m.applied_steps_count})`);
      });
      
      if (isProduction) {
        console.log('❌ ERROR: En producción, esto es crítico. Revisar inmediatamente.');
        hasErrors = true;
      } else {
        console.log('⚠️  En desarrollo, esto puede indicar drift. Revisar documentación.');
        hasWarnings = true;
      }
    } else {
      console.log('✅ Migraciones saludables (últimas 10 verificadas)');
    }
  } catch (error) {
    console.error('❌ Error verificando migraciones:', error.message);
    hasErrors = true;
  }
}

async function main() {
  try {
    // Validación A: TeamMembership existe
    console.log('📋 Validación A: Tabla TeamMembership');
    const teamMembershipExists = await checkTableExists('TeamMembership');
    if (teamMembershipExists) {
      console.log('   ✅ TeamMembership existe');
    } else {
      console.log('   ❌ TeamMembership NO existe');
      hasErrors = true;
    }
    console.log('');

    // Validación B: TeamInvite existe
    console.log('📋 Validación B: Tabla TeamInvite');
    const teamInviteExists = await checkTableExists('TeamInvite');
    if (teamInviteExists) {
      console.log('   ✅ TeamInvite existe');
    } else {
      console.log('   ❌ TeamInvite NO existe');
      hasErrors = true;
    }
    console.log('');

    // Validación C: Cleaning.assignedMembershipId existe
    console.log('📋 Validación C: Columna Cleaning.assignedMembershipId');
    const assignedMembershipIdExists = await checkColumnExists('Cleaning', 'assignedMembershipId');
    if (assignedMembershipIdExists) {
      console.log('   ✅ Cleaning.assignedMembershipId existe');
    } else {
      console.log('   ❌ Cleaning.assignedMembershipId NO existe');
      hasErrors = true;
    }
    console.log('');

    // Validación D: Salud de migraciones
    console.log('📋 Validación D: Salud de _prisma_migrations');
    await checkMigrationsHealth();
    console.log('');

    // Resumen
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (hasErrors) {
      console.log('❌ SANITY CHECK FALLÓ');
      console.log('   Revisar errores arriba y consultar docs/DB_MIGRATIONS.md');
      await prisma.$disconnect();
      process.exit(1);
    } else if (hasWarnings) {
      console.log('⚠️  SANITY CHECK PASÓ CON ADVERTENCIAS');
      console.log('   Revisar warnings arriba');
      await prisma.$disconnect();
      process.exit(0);
    } else {
      console.log('✅ SANITY CHECK PASÓ');
      console.log('   Todas las estructuras críticas están presentes');
      await prisma.$disconnect();
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Error fatal en sanity check:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
