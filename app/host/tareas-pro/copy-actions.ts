"use server";

// app/host/tareas-pro/copy-actions.ts
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import storageProvider from "@/lib/storage";
import { randomUUID } from "crypto";

/**
 * Copia un TaskTemplate a otra propiedad del mismo tenant.
 *
 * Modos:
 *   "without_photos" — copia solo estructura/configuración, sin fotos de referencia.
 *   "with_photos"    — clona los archivos físicamente en storage y crea registros Asset
 *                      independientes. Editar/borrar fotos en origen o copia no afecta al otro.
 *
 * Qué se copia siempre:
 *   TaskTemplate → TaskTemplateSchedule → TaskSectionTemplate[]
 *   → TaskStepTemplate[] → TaskStepOption[]
 *
 * Qué se copia solo con "with_photos":
 *   TaskSectionReferenceAsset[] (fotos independientes por sección)
 *   TaskStepReferenceAsset[]    (fotos independientes por paso)
 *
 * Qué NUNCA se copia:
 *   TaskJob, TaskJobSection/Step, TaskRecurringDue, TaskCarryForward,
 *   respuestas, evidencias, logs.
 *
 * La copia siempre queda en status DRAFT.
 */

type CopyMode = "without_photos" | "with_photos";

/** Datos de un asset group clonado (pre-calculados antes de la transacción DB). */
type ClonedAssetRef = {
  order: number;
  caption: string | null;
  newGroupId: string;
  originalData: {
    key: string; publicUrl: string; mimeType: string;
    sizeBytes: number; width: number | null; height: number | null; bucket: string;
  };
  thumbData: {
    key: string; publicUrl: string; mimeType: string;
    sizeBytes: number; width: number | null; height: number | null; bucket: string;
  };
};

type PreClonedSection = { newSectionId: string; clonedRefs: ClonedAssetRef[] };
type PreClonedStep    = { newStepId: string;    clonedRefs: ClonedAssetRef[] };

export async function copyTaskTemplateToProperty(formData: FormData): Promise<{
  success: true;
  templateId: string;
  name: string;
}> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const sourceTemplateId = String(formData.get("sourceTemplateId") || "").trim();
  const targetPropertyId = String(formData.get("targetPropertyId") || "").trim();
  const customName       = String(formData.get("name") || "").trim() || null;
  const copyMode: CopyMode =
    formData.get("copyMode") === "with_photos" ? "with_photos" : "without_photos";

  if (!sourceTemplateId || !targetPropertyId) throw new Error("Parámetros incompletos");

  // ── 1. Cargar template origen (solo configuración, sin runtime) ─────────────
  const source = await prisma.taskTemplate.findFirst({
    where: { id: sourceTemplateId, tenantId, status: { not: "DELETED" } },
    include: {
      schedule: true,
      sections: {
        orderBy: { order: "asc" },
        include: {
          referenceAssets: { orderBy: { order: "asc" } },
          steps: {
            orderBy: { order: "asc" },
            include: {
              options:        { orderBy: { order: "asc" } },
              referenceAssets: { orderBy: { order: "asc" } },
            },
          },
        },
      },
    },
  });

  if (!source) throw new Error("Checklist de origen no encontrado");

  // ── 2. Verificar propiedad destino del mismo tenant ─────────────────────────
  const targetProperty = await prisma.property.findFirst({
    where: { id: targetPropertyId, tenantId },
    select: { id: true },
  });
  if (!targetProperty) throw new Error("Propiedad destino no encontrada en este tenant");

  if (targetPropertyId === source.propertyId) {
    throw new Error("La propiedad destino debe ser distinta a la propiedad de origen");
  }

  // ── 3. Resolver nombre (sin colisión) ───────────────────────────────────────
  const baseName  = customName || source.name;
  const finalName = await resolveUniqueName(tenantId, targetPropertyId, baseName);

  // ── 4. Pre-clone de storage (solo "with_photos") ────────────────────────────
  //
  // Estrategia de consistencia:
  //   a) Copiar archivos en Supabase ANTES de la transacción DB.
  //   b) Si la transacción falla, eliminar best-effort los archivos ya copiados.
  //   c) Si falla copyObject para cualquier asset, abortar y limpiar lo ya copiado.
  //
  // IDs pre-generados: el path de storage incluye stepId/sectionId, por eso se
  // pre-generan los IDs de entidades con fotos ANTES de la transacción.
  // En la transacción se pasa `id: preGeneratedId` al crear el registro.

  const copiedStorageKeys: Array<{ bucket: string; key: string }> = [];
  const sectionPreClones  = new Map<string, PreClonedSection>();
  const stepPreClones     = new Map<string, PreClonedStep>();

  if (copyMode === "with_photos") {
    // Batch: cargar todos los grupos de asset referenciados en una sola consulta
    const allThumbAssetIds = [
      ...source.sections.flatMap((s) => s.referenceAssets.map((r) => r.assetId)),
      ...source.sections.flatMap((s) => s.steps.flatMap((st) => st.referenceAssets.map((r) => r.assetId))),
    ];
    const uniqueThumbIds = [...new Set(allThumbAssetIds)];

    type GroupAsset = {
      id: string; groupId: string; variant: string;
      bucket: string; key: string; publicUrl: string | null;
      mimeType: string; sizeBytes: number; width: number | null; height: number | null;
    };

    const thumbIdToGroup = new Map<string, { original: GroupAsset; thumb: GroupAsset }>();

    if (uniqueThumbIds.length > 0) {
      // 1. Obtener groupId de cada thumb referenciado
      const thumbMeta = await prisma.asset.findMany({
        where: { id: { in: uniqueThumbIds }, tenantId },
        select: { id: true, groupId: true },
      });

      const groupIds = [...new Set(thumbMeta.map((a) => a.groupId))];

      // 2. Cargar ambas variantes de cada grupo
      const groupAssets = await prisma.asset.findMany({
        where: { groupId: { in: groupIds }, tenantId, deletedAt: null },
        select: { id: true, groupId: true, variant: true, bucket: true, key: true, publicUrl: true, mimeType: true, sizeBytes: true, width: true, height: true },
      }) as GroupAsset[];

      const byGroup = new Map<string, GroupAsset[]>();
      for (const a of groupAssets) {
        const arr = byGroup.get(a.groupId) ?? [];
        arr.push(a);
        byGroup.set(a.groupId, arr);
      }

      for (const { id: thumbId, groupId } of thumbMeta) {
        const group    = byGroup.get(groupId) ?? [];
        const original = group.find((a) => a.variant === "ORIGINAL");
        const thumb    = group.find((a) => a.variant === "THUMB_256");
        if (original && thumb) thumbIdToGroup.set(thumbId, { original, thumb });
      }
    }

    // Clonar un asset group individual: copia storage y prepara datos para la transacción
    const cloneRef = async (
      ref: { assetId: string; order: number; caption: string | null },
      newEntityId: string,
      entityType: "steps" | "sections"
    ): Promise<ClonedAssetRef | null> => {
      const group = thumbIdToGroup.get(ref.assetId);
      if (!group) return null; // asset eliminado en origen — saltar

      const newGroupId    = randomUUID();
      const origFilename  = group.original.key.split("/").pop()!;
      const thumbFilename = group.thumb.key.split("/").pop()!;

      const newOrigKey  = `${tenantId}/${entityType}/${newEntityId}/${newGroupId}/${origFilename}`;
      const newThumbKey = `${tenantId}/${entityType}/${newEntityId}/${newGroupId}/${thumbFilename}`;

      const [origResult, thumbResult] = await Promise.all([
        storageProvider.copyObject({ bucket: group.original.bucket, fromKey: group.original.key, toKey: newOrigKey }),
        storageProvider.copyObject({ bucket: group.thumb.bucket,    fromKey: group.thumb.key,    toKey: newThumbKey }),
      ]);

      copiedStorageKeys.push({ bucket: group.original.bucket, key: newOrigKey });
      copiedStorageKeys.push({ bucket: group.thumb.bucket,    key: newThumbKey });

      return {
        order: ref.order, caption: ref.caption, newGroupId,
        originalData: {
          key: newOrigKey, publicUrl: origResult.publicUrl,
          mimeType: group.original.mimeType, sizeBytes: group.original.sizeBytes,
          width: group.original.width, height: group.original.height,
          bucket: group.original.bucket,
        },
        thumbData: {
          key: newThumbKey, publicUrl: thumbResult.publicUrl,
          mimeType: group.thumb.mimeType, sizeBytes: group.thumb.sizeBytes,
          width: group.thumb.width, height: group.thumb.height,
          bucket: group.thumb.bucket,
        },
      };
    };

    // Clonar fotos de secciones (actualmente 0 en producción, correcto para el futuro)
    for (const section of source.sections) {
      if (section.referenceAssets.length === 0) continue;
      const newSectionId  = randomUUID();
      const clonedRefs: ClonedAssetRef[] = [];
      for (const ref of section.referenceAssets) {
        const cloned = await cloneRef(ref, newSectionId, "sections");
        if (cloned) clonedRefs.push(cloned);
      }
      sectionPreClones.set(section.id, { newSectionId, clonedRefs });
    }

    // Clonar fotos de pasos
    for (const section of source.sections) {
      for (const step of section.steps) {
        if (step.referenceAssets.length === 0) continue;
        const newStepId    = randomUUID();
        const clonedRefs: ClonedAssetRef[] = [];
        for (const ref of step.referenceAssets) {
          const cloned = await cloneRef(ref, newStepId, "steps");
          if (cloned) clonedRefs.push(cloned);
        }
        stepPreClones.set(step.id, { newStepId, clonedRefs });
      }
    }
  }

  // ── 5. Transacción atómica: crear todo o nada ───────────────────────────────
  let newTemplate;
  try {
    newTemplate = await prisma.$transaction(async (tx) => {
      // Template — siempre DRAFT
      const template = await tx.taskTemplate.create({
        data: {
          tenantId,
          propertyId: targetPropertyId,
          name:        finalName,
          description: source.description,
          status:      "DRAFT",
        },
      });

      // Schedule
      const sched = source.schedule;
      await tx.taskTemplateSchedule.create({
        data: {
          tenantId,
          templateId:              template.id,
          frequency:               sched?.frequency               ?? "MANUAL",
          carryForwardPolicy:      sched?.carryForwardPolicy      ?? "LIMITED",
          maxCarryForwardAttempts: sched?.maxCarryForwardAttempts ?? 2,
          anchorDayOfWeek:         sched?.anchorDayOfWeek         ?? null,
          anchorDayOfMonth:        sched?.anchorDayOfMonth        ?? null,
          timezone:                sched?.timezone                ?? null,
        },
      });

      // Secciones → pasos → opciones → fotos
      for (const section of source.sections) {
        const sectionPreClone = sectionPreClones.get(section.id);

        const newSection = await tx.taskSectionTemplate.create({
          data: {
            // Usar ID pre-generado si esta sección tiene fotos (storage path lo requiere)
            ...(sectionPreClone ? { id: sectionPreClone.newSectionId } : {}),
            tenantId,
            templateId:            template.id,
            name:                  section.name,
            description:           section.description,
            sectionType:           section.sectionType,
            order:                 section.order,
            requiresGlobalConfirm: section.requiresGlobalConfirm,
          },
        });

        // Fotos de referencia de la sección (solo con "with_photos")
        if (copyMode === "with_photos" && sectionPreClone) {
          for (const cloned of sectionPreClone.clonedRefs) {
            await tx.asset.create({
              data: {
                tenantId, type: "IMAGE", provider: "SUPABASE", variant: "ORIGINAL",
                bucket: cloned.originalData.bucket, key: cloned.originalData.key,
                publicUrl: cloned.originalData.publicUrl, mimeType: cloned.originalData.mimeType,
                sizeBytes: cloned.originalData.sizeBytes, width: cloned.originalData.width,
                height: cloned.originalData.height, groupId: cloned.newGroupId,
              },
            });
            const thumbAsset = await tx.asset.create({
              data: {
                tenantId, type: "IMAGE", provider: "SUPABASE", variant: "THUMB_256",
                bucket: cloned.thumbData.bucket, key: cloned.thumbData.key,
                publicUrl: cloned.thumbData.publicUrl, mimeType: cloned.thumbData.mimeType,
                sizeBytes: cloned.thumbData.sizeBytes, width: cloned.thumbData.width,
                height: cloned.thumbData.height, groupId: cloned.newGroupId,
              },
            });
            await tx.taskSectionReferenceAsset.create({
              data: {
                tenantId, sectionId: newSection.id,
                assetId: thumbAsset.id, caption: cloned.caption, order: cloned.order,
              },
            });
          }
        }

        // Pasos
        for (const step of section.steps) {
          const stepPreClone = stepPreClones.get(step.id);

          const newStep = await tx.taskStepTemplate.create({
            data: {
              // Usar ID pre-generado si este paso tiene fotos
              ...(stepPreClone ? { id: stepPreClone.newStepId } : {}),
              tenantId,
              sectionId:            newSection.id,
              name:                 step.name,
              description:          step.description,
              isRequired:           step.isRequired,
              blocksCompletion:     step.blocksCompletion,
              order:                step.order,
              capturesYesNo:        step.capturesYesNo,
              yesNoRequired:        step.yesNoRequired,
              capturesNumber:       step.capturesNumber,
              numberRequired:       step.numberRequired,
              numberMin:            step.numberMin,
              numberMax:            step.numberMax,
              capturesPhoto:        step.capturesPhoto,
              photoRequired:        step.photoRequired,
              capturesText:         step.capturesText,
              textRequired:         step.textRequired,
              captureVersion:       step.captureVersion,
              stepFrequency:        step.stepFrequency,
              stepAnchorDayOfWeek:  step.stepAnchorDayOfWeek,
              stepAnchorDayOfMonth: step.stepAnchorDayOfMonth,
              intervalDays:         step.intervalDays,
              startDate:            step.startDate,
            },
          });

          // Opciones de selección (siempre)
          for (const option of step.options) {
            await tx.taskStepOption.create({
              data: {
                tenantId,
                stepId: newStep.id,
                label:  option.label,
                order:  option.order,
              },
            });
          }

          // Fotos de referencia del paso (solo con "with_photos")
          if (copyMode === "with_photos" && stepPreClone) {
            for (const cloned of stepPreClone.clonedRefs) {
              await tx.asset.create({
                data: {
                  tenantId, type: "IMAGE", provider: "SUPABASE", variant: "ORIGINAL",
                  bucket: cloned.originalData.bucket, key: cloned.originalData.key,
                  publicUrl: cloned.originalData.publicUrl, mimeType: cloned.originalData.mimeType,
                  sizeBytes: cloned.originalData.sizeBytes, width: cloned.originalData.width,
                  height: cloned.originalData.height, groupId: cloned.newGroupId,
                },
              });
              const thumbAsset = await tx.asset.create({
                data: {
                  tenantId, type: "IMAGE", provider: "SUPABASE", variant: "THUMB_256",
                  bucket: cloned.thumbData.bucket, key: cloned.thumbData.key,
                  publicUrl: cloned.thumbData.publicUrl, mimeType: cloned.thumbData.mimeType,
                  sizeBytes: cloned.thumbData.sizeBytes, width: cloned.thumbData.width,
                  height: cloned.thumbData.height, groupId: cloned.newGroupId,
                },
              });
              await tx.taskStepReferenceAsset.create({
                data: {
                  tenantId, stepId: newStep.id,
                  assetId: thumbAsset.id, caption: cloned.caption, order: cloned.order,
                },
              });
            }
          }
        }
      }

      return template;
    });
  } catch (err) {
    // Limpiar archivos de storage copiados en la fase previa (best effort)
    if (copiedStorageKeys.length > 0) {
      await Promise.allSettled(
        copiedStorageKeys.map(({ bucket, key }) =>
          storageProvider.deleteObject({ bucket, key })
        )
      );
    }
    throw err;
  }

  revalidatePath("/host/tareas-pro");
  revalidatePath(`/host/tareas-pro/${newTemplate.id}`);

  return { success: true, templateId: newTemplate.id, name: finalName };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resuelve un nombre único dentro de la propiedad destino.
 * Estrategia: baseName → "baseName (copia)" → "baseName (copia 2)" → …
 */
async function resolveUniqueName(
  tenantId: string,
  propertyId: string,
  baseName: string
): Promise<string> {
  const candidates = [
    baseName,
    `${baseName} (copia)`,
    ...Array.from({ length: 8 }, (_, i) => `${baseName} (copia ${i + 2})`),
  ];

  for (const candidate of candidates) {
    const existing = await prisma.taskTemplate.findFirst({
      where: { tenantId, propertyId, name: candidate, status: { not: "DELETED" } },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  return `${baseName} (copia ${Date.now()})`;
}
