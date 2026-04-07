// lib/prisma.ts
import { PrismaClient } from './generated/prisma';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Configurar Neon para usar WebSocket en Node.js
// Solo configurar en el servidor (no en el navegador)
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
  console.error('DATABASE_URL no está definida. Variables de entorno disponibles:', {
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
  });
  throw new Error(
    'DATABASE_URL no está definida. Por favor, verifica tu archivo .env'
  );
}

// Log solo en desarrollo para verificar que se carga correctamente
if (process.env.NODE_ENV === 'development') {
  console.log('DATABASE_URL encontrada:', connectionString.substring(0, 30) + '...');
}

// Crear el adapter de Neon con la connection string directamente
const adapter = new PrismaNeon({ connectionString });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
