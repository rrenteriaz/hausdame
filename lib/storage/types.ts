// lib/storage/types.ts
/**
 * Interfaz para providers de almacenamiento (Supabase, AWS S3, etc.)
 * 
 * Principio: "Ingresar externo, vivir interno"
 * - La UI y lógica de negocio no dependen del provider específico
 * - Cambiar de Supabase a AWS solo requiere implementar un nuevo provider
 */

export interface PutPublicObjectParams {
  bucket: string;
  key: string;
  contentType: string;
  buffer: Buffer;
}

export interface PutPublicObjectResult {
  publicUrl: string;
}

export interface DeleteObjectParams {
  bucket: string;
  key: string;
}

export interface CopyObjectParams {
  bucket: string;
  fromKey: string;
  toKey: string;
}

export interface CopyObjectResult {
  publicUrl: string;
}

export interface StorageProvider {
  /**
   * Sube un objeto al storage con acceso público
   */
  putPublicObject(params: PutPublicObjectParams): Promise<PutPublicObjectResult>;

  /**
   * Elimina un objeto del storage
   */
  deleteObject(params: DeleteObjectParams): Promise<void>;

  /**
   * Copia un objeto dentro del mismo bucket (server-side, sin transferir bytes)
   * Retorna la URL pública del nuevo objeto.
   */
  copyObject(params: CopyObjectParams): Promise<CopyObjectResult>;
}

