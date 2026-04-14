// Script para reportar validaciones de FASE 1
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { PrismaClient } = require('../../lib/generated/prisma');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

if (typeof window === 'undefined') {
  try {
    neonConfig.webSocketConstructor = ws;
  } catch (error) {
    console.warn('Error configurando WebSocket para Neon:', error);
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL no está definida.');
  process.exit(1);
}

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] });

async function reportValidation() {
  try {
    const total = await prisma.property.count();
    const nullIdOld = await prisma.property.count({ where: { idOld: null } });
    const nullNewId = await prisma.property.count({ where: { newId: null } });
    
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

    console.log('\n📊 REPORTE DE VALIDACIÓN FASE 1:');
    console.log('================================');
    console.log(`Property total: ${total}`);
    console.log(`Property con idOld NULL: ${nullIdOld}`);
    console.log(`Property con newId NULL: ${nullNewId}`);
    console.log(`Duplicados en idOld: ${idOldDuplicates.length}`);
    if (idOldDuplicates.length > 0) {
      console.log('  Detalles:', idOldDuplicates);
    }
    console.log(`Duplicados en newId: ${newIdDuplicates.length}`);
    if (newIdDuplicates.length > 0) {
      console.log('  Detalles:', newIdDuplicates);
    }
    console.log('================================\n');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

reportValidation();

