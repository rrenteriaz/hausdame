// lib/media/getInventoryLineImageThumbs.ts
/**
 * Fase 11: Helpers para obtener thumbnails de imágenes a nivel InventoryLine.
 *
 * Lógica de prioridad:
 *   1. InventoryLineAsset (imágenes propias de la línea) → source of truth
 *   2. Fallback: InventoryItemAsset (imágenes del catálogo del ítem)
 *
 * Esto garantiza backward compatibility total: líneas sin imágenes propias
 * siguen mostrando las imágenes del InventoryItem.
 */

import prisma from "@/lib/prisma";
import { getInventoryItemImageThumbs } from "./getInventoryItemImageThumbs";

/**
 * Resuelve los thumbs para un grupo de assets (InventoryLineAsset o InventoryItemAsset).
 * Reutilizable internamente.
 */
async function resolveThumbsFromAssets(
  itemAssets: Array<{ position: number; assetId: string; asset: { groupId: string | null; variant: string } }>
): Promise<Array<string | null>> {
  if (itemAssets.length === 0) return [null, null, null];

  const groupIds = [...new Set(itemAssets.map((ia) => ia.asset.groupId).filter(Boolean))] as string[];

  const allAssets = await prisma.asset.findMany({
    where: {
      groupId: { in: groupIds },
      variant: { in: ["THUMB_256", "ORIGINAL"] },
    },
    select: { id: true, groupId: true, variant: true, publicUrl: true },
    orderBy: { variant: "asc" }, // THUMB_256 antes que ORIGINAL
  });

  const urlByGroupId = new Map<string, string>();
  const urlByAssetId = new Map<string, string>();
  for (const asset of allAssets) {
    if (asset.publicUrl) {
      urlByAssetId.set(asset.id, asset.publicUrl);
      if (asset.groupId && !urlByGroupId.has(asset.groupId)) {
        urlByGroupId.set(asset.groupId, asset.publicUrl);
      }
    }
  }

  const result: Array<string | null> = [null, null, null];
  for (const ia of itemAssets) {
    const pos = ia.position;
    if (pos >= 1 && pos <= 3) {
      const url =
        urlByAssetId.get(ia.assetId) ||
        (ia.asset.groupId ? urlByGroupId.get(ia.asset.groupId) : undefined) ||
        null;
      result[pos - 1] = url;
    }
  }
  return result;
}

/**
 * Obtiene las URLs de thumbnails para una InventoryLine.
 * Prioridad: imágenes propias de la línea → fallback al InventoryItem.
 *
 * @param lineId  - ID de la InventoryLine
 * @param itemId  - ID del InventoryItem (para fallback)
 */
export async function getInventoryLineImageThumbs(
  lineId: string,
  itemId: string
): Promise<Array<string | null>> {
  const lineAssets = await prisma.inventoryLineAsset.findMany({
    where: { lineId },
    include: {
      asset: { select: { id: true, groupId: true, variant: true } },
    },
    orderBy: { position: "asc" },
  });

  if (lineAssets.length > 0) {
    return resolveThumbsFromAssets(lineAssets);
  }

  // Fallback al item
  return getInventoryItemImageThumbs(itemId);
}

/**
 * Batch: obtiene thumbnails para múltiples InventoryLines.
 * Retorna Map<lineId, Array<string | null>>.
 * Prioridad: imágenes propias de línea → fallback al InventoryItem.
 *
 * @param lines - Array de { id: lineId, itemId }
 */
export async function getInventoryLineImageThumbsBatch(
  lines: Array<{ id: string; itemId: string }>
): Promise<Map<string, Array<string | null>>> {
  const result = new Map<string, Array<string | null>>();
  if (lines.length === 0) return result;

  lines.forEach((l) => result.set(l.id, [null, null, null]));

  // Cargar todos los InventoryLineAsset del lote
  const lineIds = lines.map((l) => l.id);
  const allLineAssets = await prisma.inventoryLineAsset.findMany({
    where: { lineId: { in: lineIds } },
    include: {
      asset: { select: { id: true, groupId: true, variant: true } },
    },
    orderBy: { position: "asc" },
  });

  // Agrupar por lineId
  const lineAssetsByLineId = new Map<string, typeof allLineAssets>();
  for (const la of allLineAssets) {
    if (!lineAssetsByLineId.has(la.lineId)) lineAssetsByLineId.set(la.lineId, []);
    lineAssetsByLineId.get(la.lineId)!.push(la);
  }

  // Líneas con imágenes propias → resolver
  const linesWithOwnImages: Array<{ id: string; itemId: string }> = [];
  const linesNeedingFallback: Array<{ id: string; itemId: string }> = [];

  for (const line of lines) {
    if (lineAssetsByLineId.has(line.id)) {
      linesWithOwnImages.push(line);
    } else {
      linesNeedingFallback.push(line);
    }
  }

  // Resolver imágenes propias via groupId batch
  if (linesWithOwnImages.length > 0) {
    const allGroupIds = [...new Set(
      linesWithOwnImages
        .flatMap((l) => lineAssetsByLineId.get(l.id)!.map((a) => a.asset.groupId))
        .filter(Boolean)
    )] as string[];

    const allAssets = await prisma.asset.findMany({
      where: {
        groupId: { in: allGroupIds },
        variant: { in: ["THUMB_256", "ORIGINAL"] },
      },
      select: { id: true, groupId: true, variant: true, publicUrl: true },
      orderBy: { variant: "asc" },
    });

    const urlByGroupId = new Map<string, string>();
    const urlByAssetId = new Map<string, string>();
    for (const asset of allAssets) {
      if (asset.publicUrl) {
        urlByAssetId.set(asset.id, asset.publicUrl);
        if (asset.groupId && !urlByGroupId.has(asset.groupId)) {
          urlByGroupId.set(asset.groupId, asset.publicUrl);
        }
      }
    }

    for (const line of linesWithOwnImages) {
      const assets = lineAssetsByLineId.get(line.id)!;
      const thumbs: Array<string | null> = [null, null, null];
      for (const la of assets) {
        const pos = la.position;
        if (pos >= 1 && pos <= 3) {
          const url =
            urlByAssetId.get(la.assetId) ||
            (la.asset.groupId ? urlByGroupId.get(la.asset.groupId) : undefined) ||
            null;
          thumbs[pos - 1] = url;
        }
      }
      result.set(line.id, thumbs);
    }
  }

  // Fallback: líneas sin imágenes propias → cargar thumbs del item
  if (linesNeedingFallback.length > 0) {
    // Importar la función batch de item (sin duplicar lógica)
    const { getInventoryItemImageThumbsBatch } = await import("./getInventoryItemImageThumbs");
    const itemIds = [...new Set(linesNeedingFallback.map((l) => l.itemId))];
    const itemThumbsMap = await getInventoryItemImageThumbsBatch(itemIds);

    for (const line of linesNeedingFallback) {
      result.set(line.id, itemThumbsMap.get(line.itemId) ?? [null, null, null]);
    }
  }

  return result;
}
