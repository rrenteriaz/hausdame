// FASE 2: Backfill de propertyNewId en todas las tablas dependientes
// Ejecutar con: node prisma/scripts/phase2_backfill_property_new_id.js

// Cargar variables de entorno
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { PrismaClient } = require('../../lib/generated/prisma');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

// Configurar Neon para usar WebSocket en Node.js
if (typeof window === 'undefined') {
  try {
    neonConfig.webSocketConstructor = ws;
  } catch (error) {
    console.warn('Error configurando WebSocket para Neon:', error);
  }
}

// Obtener la connection string de la variable de entorno
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL no está definida. Por favor, verifica tu archivo .env');
  process.exit(1);
}

// Crear el adapter de Neon
const adapter = new PrismaNeon({ connectionString });

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

async function backfillPropertyNewId() {
  console.log('🔄 Iniciando backfill de propertyNewId en tablas dependientes...');

  try {
    // Tablas a procesar con sus modelos Prisma
    const tables = [
      { name: 'Reservation', model: prisma.reservation, countField: 'propertyId' },
      { name: 'Cleaning', model: prisma.cleaning, countField: 'propertyId' },
      { name: 'Lock', model: prisma.lock, countField: 'propertyId' },
      { name: 'PropertyAdmin', model: prisma.propertyAdmin, countField: 'propertyId' },
      { name: 'PropertyCleaner', model: prisma.propertyCleaner, countField: 'propertyId' },
      { name: 'PropertyHandyman', model: prisma.propertyHandyman, countField: 'propertyId' },
      { name: 'PropertyTeam', model: prisma.propertyTeam, countField: 'propertyId' },
      { name: 'PropertyChecklistItem', model: prisma.propertyChecklistItem, countField: 'propertyId' },
    ];

    for (const table of tables) {
      console.log(`\n📊 Procesando tabla: ${table.name}...`);

      // Usar SQL raw porque propertyNewId aún no está en el schema de Prisma
      const tableName = table.name;
      
      // Obtener todas las filas que necesitan actualización
      const rowsToUpdate = await prisma.$queryRawUnsafe(`
        SELECT id, "${table.countField}" as property_id
        FROM "${tableName}"
        WHERE "propertyNewId" IS NULL
      `);

      console.log(`   Encontradas ${rowsToUpdate.length} filas para actualizar`);

      let updated = 0;
      let orphaned = 0;

      for (const row of rowsToUpdate) {
        // Buscar la propiedad correspondiente
        const property = await prisma.property.findUnique({
          where: { id: row.property_id },
          select: { newId: true },
        });

        if (!property || !property.newId) {
          console.warn(`   ⚠️  Orphaned row: ${tableName}.id = ${row.id}, propertyId = ${row.property_id} (property no encontrada o sin newId)`);
          orphaned++;
          continue;
        }

        // Actualizar propertyNewId usando SQL raw
        await prisma.$executeRawUnsafe(`
          UPDATE "${tableName}"
          SET "propertyNewId" = $1
          WHERE id = $2
        `, property.newId, row.id);
        
        updated++;
      }

      console.log(`   ✅ Actualizadas: ${updated} filas`);
      if (orphaned > 0) {
        console.warn(`   ⚠️  Orphaned: ${orphaned} filas (requieren atención)`);
      }

      // Validación: verificar que no hay nulls (salvo huérfanos)
      const nullCountResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM "${tableName}"
        WHERE "propertyNewId" IS NULL
      `);
      
      const nullCount = parseInt(nullCountResult[0].count);

      if (nullCount > 0) {
        console.error(`   ❌ ERROR: ${nullCount} filas tienen propertyNewId NULL (deben ser 0 o solo huérfanos)`);
      } else {
        console.log(`   ✅ Validación: No hay nulls (excepto huérfanos)`);
      }
    }

    console.log('\n🎉 Backfill completado!');
    console.log('\n📋 Resumen de validaciones:');
    
    // Validación final: contar totales usando SQL raw
    for (const table of tables) {
      const tableName = table.name;
      const totalResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as total
        FROM "${tableName}"
      `);
      const withNewIdResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM "${tableName}"
        WHERE "propertyNewId" IS NOT NULL
      `);
      
      const total = parseInt(totalResult[0].total);
      const withNewId = parseInt(withNewIdResult[0].count);
      const nulls = total - withNewId;
      
      console.log(`   ${tableName}: ${withNewId}/${total} con propertyNewId${nulls > 0 ? ` (${nulls} nulls - posiblemente huérfanos)` : ''}`);
    }

  } catch (error) {
    console.error('❌ Error durante el backfill:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backfillPropertyNewId();

