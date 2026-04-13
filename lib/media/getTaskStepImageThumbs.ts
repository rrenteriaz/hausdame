// lib/media/getTaskStepImageThumbs.ts
import prisma from "@/lib/prisma";

/**
 * Obtiene las URLs de thumbnails para un TaskStepTemplate (hasta 3 imágenes, por order 1-3)
 */
export async function getTaskStepImageThumbs(
  stepId: string
): Promise<Array<string | null>> {
  const itemAssets = await prisma.taskStepReferenceAsset.findMany({
    where: { stepId },
    include: { asset: { select: { id: true, groupId: true, variant: true } } },
    orderBy: { order: "asc" },
  });

  if (itemAssets.length === 0) return [null, null, null];

  const groupIds = [...new Set(itemAssets.map((ia) => ia.asset.groupId))] as string[];

  const allAssets = await prisma.asset.findMany({
    where: { groupId: { in: groupIds }, variant: { in: ["THUMB_256", "ORIGINAL"] } },
    select: { id: true, groupId: true, variant: true, publicUrl: true },
    orderBy: { variant: "asc" },
  });

  const urlByGroupId = new Map<string, string>();
  const urlByAssetId = new Map<string, string>();
  for (const asset of allAssets) {
    if (!urlByGroupId.has(asset.groupId)) urlByGroupId.set(asset.groupId, asset.publicUrl || "");
    if (asset.publicUrl) urlByAssetId.set(asset.id, asset.publicUrl);
  }

  const result: Array<string | null> = [null, null, null];
  for (const itemAsset of itemAssets) {
    const order = itemAsset.order;
    if (order >= 1 && order <= 3) {
      result[order - 1] =
        urlByAssetId.get(itemAsset.assetId) ||
        urlByGroupId.get(itemAsset.asset.groupId) ||
        null;
    }
  }
  return result;
}

/**
 * Batch: obtiene thumbnails para múltiples TaskStepTemplate IDs
 */
export async function getTaskStepImageThumbsBatch(
  stepIds: string[]
): Promise<Map<string, Array<string | null>>> {
  const result = new Map<string, Array<string | null>>();
  if (stepIds.length === 0) return result;
  stepIds.forEach((id) => result.set(id, [null, null, null]));

  const itemAssets = await prisma.taskStepReferenceAsset.findMany({
    where: { stepId: { in: stepIds } },
    include: { asset: { select: { id: true, groupId: true, variant: true } } },
    orderBy: { order: "asc" },
  });

  if (itemAssets.length === 0) return result;

  const groupIds = [...new Set(itemAssets.map((ia) => ia.asset.groupId))] as string[];
  const allAssets = await prisma.asset.findMany({
    where: { groupId: { in: groupIds }, variant: { in: ["THUMB_256", "ORIGINAL"] } },
    select: { id: true, groupId: true, variant: true, publicUrl: true },
    orderBy: { variant: "asc" },
  });

  const urlByGroupId = new Map<string, string>();
  const urlByAssetId = new Map<string, string>();
  for (const asset of allAssets) {
    if (!urlByGroupId.has(asset.groupId)) urlByGroupId.set(asset.groupId, asset.publicUrl || "");
    if (asset.publicUrl) urlByAssetId.set(asset.id, asset.publicUrl);
  }

  const byStepId = new Map<string, typeof itemAssets>();
  for (const ia of itemAssets) {
    if (!byStepId.has(ia.stepId)) byStepId.set(ia.stepId, []);
    byStepId.get(ia.stepId)!.push(ia);
  }

  for (const [stepId, assets] of byStepId) {
    const thumbs: Array<string | null> = [null, null, null];
    for (const ia of assets) {
      if (ia.order >= 1 && ia.order <= 3) {
        thumbs[ia.order - 1] =
          urlByAssetId.get(ia.assetId) ||
          urlByGroupId.get(ia.asset.groupId) ||
          null;
      }
    }
    result.set(stepId, thumbs);
  }
  return result;
}
