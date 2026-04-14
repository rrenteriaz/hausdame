// FASE 1: Backfill de idOld y newId en Property
// Ejecutar con: node prisma/scripts/phase1_backfill_property_ids.js
// Requiere: npm install @paralleldrive/cuid2

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

// Usar cuid2 si está disponible, sino usar crypto.randomUUID como fallback
let createId;
try {
  createId = require('@paralleldrive/cuid2').createId;
} catch (e) {
  console.warn('⚠️  @paralleldrive/cuid2 no está instalado. Usando crypto.randomUUID como fallback.');
  const { randomUUID } = require('crypto');
  createId = () => randomUUID();
}

async function backfillPropertyIds() {
  console.log('🔄 Iniciando backfill de Property.idOld y Property.newId...');

  try {
    // Obtener todas las propiedades
    const properties = await prisma.property.findMany({
      select: {
        id: true,
        idOld: true,
        newId: true,
      },
    });

    console.log(`📊 Encontradas ${properties.length} propiedades`);

    let updated = 0;
    let skipped = 0;

    for (const property of properties) {
      const updates = {};

      // Si idOld es null, copiar el ID actual
      if (!property.idOld) {
        updates.idOld = property.id;
      }

      // Si newId es null, generar un nuevo cuid
      if (!property.newId) {
        updates.newId = createId();
      }

      if (Object.keys(updates).length > 0) {
        await prisma.property.update({
          where: { id: property.id },
          data: updates,
        });
        updated++;
      } else {
        skipped++;
      }
    }

    console.log(`✅ Actualizadas: ${updated} propiedades`);
    console.log(`⏭️  Omitidas (ya tenían valores): ${skipped} propiedades`);

    // Validaciones
    console.log('\n🔍 Ejecutando validaciones...');

    const nullIdOld = await prisma.property.count({
      where: { idOld: null },
    });
    const nullNewId = await prisma.property.count({
      where: { newId: null },
    });

    if (nullIdOld > 0) {
      console.error(`❌ ERROR: ${nullIdOld} propiedades tienen idOld NULL`);
      process.exit(1);
    }
    if (nullNewId > 0) {
      console.error(`❌ ERROR: ${nullNewId} propiedades tienen newId NULL`);
      process.exit(1);
    }

    // Verificar duplicados
    const idOldDuplicates = await prisma.$queryRaw`
      SELECT "idOld", COUNT(*) as count
      FROM "Property"
      GROUP BY "idOld"
      HAVING COUNT(*) > 1
    `;
    const newIdDuplicates = await prisma.$queryRaw`
      SELECT "newId", COUNT(*) as count
      FROM "Property"
      GROUP BY "newId"
      HAVING COUNT(*) > 1
    `;

    if (idOldDuplicates.length > 0) {
      console.error(`❌ ERROR: Se encontraron ${idOldDuplicates.length} idOld duplicados`);
      console.error(idOldDuplicates);
      process.exit(1);
    }
    if (newIdDuplicates.length > 0) {
      console.error(`❌ ERROR: Se encontraron ${newIdDuplicates.length} newId duplicados`);
      console.error(newIdDuplicates);
      process.exit(1);
    }

    console.log('✅ Validaciones pasadas:');
    console.log(`   - idOld: ${nullIdOld} nulls (debe ser 0)`);
    console.log(`   - newId: ${nullNewId} nulls (debe ser 0)`);
    console.log(`   - idOld duplicados: ${idOldDuplicates.length} (debe ser 0)`);
    console.log(`   - newId duplicados: ${newIdDuplicates.length} (debe ser 0)`);

    console.log('\n🎉 Backfill completado exitosamente!');
  } catch (error) {
    console.error('❌ Error durante el backfill:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backfillPropertyIds();

