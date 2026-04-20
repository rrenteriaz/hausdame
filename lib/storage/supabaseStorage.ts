// lib/storage/supabaseStorage.ts
/**
 * Implementación de StorageProvider usando Supabase Storage
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider, PutPublicObjectParams, PutPublicObjectResult, DeleteObjectParams, CopyObjectParams, CopyObjectResult } from "./types";

// Server-only: no usar NEXT_PUBLIC_ para credenciales sensibles
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("[SupabaseStorage] Missing environment variables. Upload functionality will not work.");
}

/**
 * Crea un cliente de Supabase con permisos de service role (si está disponible)
 * o anon key (para acceso público)
 */
function getSupabaseClient() {
  const supabaseUrlRaw = process.env.SUPABASE_URL;
  const supabaseServiceKeyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrlRaw || !supabaseServiceKeyRaw) {
    throw new Error("Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-only, do not use NEXT_PUBLIC_)");
  }

  // Sanitizar: eliminar comillas si existen (común en algunos entornos de Windows/.env)
  const sanitize = (s: string) => s.replace(/^["']|["']$/g, "").trim();
  const url = sanitize(supabaseUrlRaw);
  const key = sanitize(supabaseServiceKeyRaw);

  console.log(`[SupabaseStorage] Initializing client for: ${url.replace(/https:\/\/(.*)\.supabase\.co/, "$1.supabase.co")}`);
  
  return createClient(url, key);
}

export class SupabaseStorageProvider implements StorageProvider {
  private async ensureBucketExists(supabase: SupabaseClient<any, any, any, any>, bucket: string) {
    const { error } = await supabase.storage.createBucket(bucket, { public: true });
    // Si el bucket ya existe, createBucket puede devolver error; ignorar si es "already exists"
    if (error && !error.message?.toLowerCase().includes("already exists")) {
      throw new Error(`Failed to create bucket "${bucket}": ${error.message}`);
    }
  }

  async putPublicObject(params: PutPublicObjectParams): Promise<PutPublicObjectResult> {
    const { bucket, key, contentType, buffer } = params;
    const supabase = getSupabaseClient();

    // Subir archivo al bucket
    let result = await supabase.storage
      .from(bucket)
      .upload(key, buffer, {
        contentType,
        upsert: true,
      });

    // Si el bucket no existe, crearlo y reintentar
    if (result.error?.message?.toLowerCase().includes("not found") || result.error?.message?.toLowerCase().includes("bucket")) {
      await this.ensureBucketExists(supabase, bucket);
      result = await supabase.storage.from(bucket).upload(key, buffer, {
        contentType,
        upsert: true,
      });
    }

    if (result.error) {
      console.error("[SupabaseStorage] Upload error:", {
        message: result.error.message,
        error: result.error,
        bucket,
        key
      });
      throw new Error(`Failed to upload to Supabase: ${result.error.message}`);
    }

    // Obtener URL pública
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(key);

    if (!publicUrlData?.publicUrl) {
      throw new Error("Failed to get public URL from Supabase");
    }

    return {
      publicUrl: publicUrlData.publicUrl,
    };
  }

  async deleteObject(params: DeleteObjectParams): Promise<void> {
    const { bucket, key } = params;
    const supabase = getSupabaseClient();

    const { error } = await supabase.storage
      .from(bucket)
      .remove([key]);

    if (error) {
      // No lanzar error si el archivo no existe (idempotente)
      console.warn(`Failed to delete from Supabase (may not exist): ${error.message}`);
    }
  }

  async copyObject(params: CopyObjectParams): Promise<CopyObjectResult> {
    const { bucket, fromKey, toKey } = params;
    const supabase = getSupabaseClient();

    const { error } = await supabase.storage.from(bucket).copy(fromKey, toKey);
    if (error) throw new Error(`Failed to copy object in Supabase: ${error.message}`);

    const { data } = supabase.storage.from(bucket).getPublicUrl(toKey);
    return { publicUrl: data.publicUrl };
  }
}

