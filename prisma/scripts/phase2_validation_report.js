// Script para reportar validaciones de FASE 2
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
    const tables = [
      'Reservation',
      'Cleaning',
      'Lock',
      'PropertyAdmin',
      'PropertyCleaner',
      'PropertyHandyman',
      'PropertyTeam',
      'PropertyChecklistItem',
    ];

    console.log('\n📊 REPORTE DE VALIDACIÓN FASE 2:');
    console.log('================================');
    
    for (const tableName of tables) {
      const nullCountResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM "${tableName}"
        WHERE "propertyNewId" IS NULL
      `);
      
      const nullCount = parseInt(nullCountResult[0].count);
      console.log(`${tableName}: ${nullCount} filas con propertyNewId NULL`);
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

