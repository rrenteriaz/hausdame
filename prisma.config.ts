// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Para migraciones, Neon requiere conexión directa (puerto 5432) en lugar del pooler (6543).
 * Esta función convierte automáticamente la URL del pooler a directa si es necesario,
 * preservando todos los parámetros de query y agregando connect_timeout para permitir
 * que la base de datos se active si está pausada.
 */
function getDirectConnectionUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  
  // Si ya es conexión directa (puerto 5432), retornar tal cual pero asegurar connect_timeout
  if (url.includes(":5432")) {
    const urlObj = new URL(url);
    if (!urlObj.searchParams.has("connect_timeout")) {
      urlObj.searchParams.set("connect_timeout", "30");
    }
    return urlObj.toString();
  }
  
  // Si no es pooler de Neon, retornar tal cual
  if (!url.includes("-pooler") || !url.includes(":6543")) {
    return url;
  }
  
  // Convertir pooler a directa: remover "-pooler" y cambiar puerto 6543 → 5432
  // Preservar parámetros existentes y agregar connect_timeout
  const urlObj = new URL(url);
  urlObj.hostname = urlObj.hostname.replace("-pooler", "");
  urlObj.port = "5432";
  
  // Agregar connect_timeout si no existe (permite que Neon se active si está pausada)
  // Neon puede tardar unos segundos en activarse si está pausada
  if (!urlObj.searchParams.has("connect_timeout")) {
    urlObj.searchParams.set("connect_timeout", "30");
  }
  
  return urlObj.toString();
}

// Obtener URLs de forma segura (permitir valores opcionales)
function getEnvOrUndefined(key: string): string | undefined {
  try {
    return env(key);
  } catch {
    return undefined;
  }
}

// Para migraciones, preferir MIGRATE_DATABASE_URL, luego DIRECT_URL, o convertir DATABASE_URL a directa
const databaseUrl =
  getEnvOrUndefined("MIGRATE_DATABASE_URL") ||
  getEnvOrUndefined("DIRECT_URL") ||
  getDirectConnectionUrl(getEnvOrUndefined("DATABASE_URL"));


const shadowUrl = getEnvOrUndefined("SHADOW_DATABASE_URL") || undefined;


export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: databaseUrl!,
    ...(shadowUrl && { shadowDatabaseUrl: shadowUrl }),
  },
});
