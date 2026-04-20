"use server";

// app/host/tareas-pro/copy-actions.ts
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";

/**
 * Copia un TaskTemplate (solo configuración) a otra propiedad del mismo tenant.
 *
 * Qué se copia:
 *   TaskTemplate → TaskTemplateSchedule → TaskSectionTemplate[]
 *   → TaskSectionReferenceAsset[] → TaskStepTemplate[] → TaskStepOption[]
 *   → TaskStepReferenceAsset[]
 *
 * Qué NO se copia (nunca):
 *   TaskJob, TaskJobSection/Step, TaskRecurringDue, TaskCarryForward,
 *   respuestas, evidencias, logs.
 *
 * La copia siempre queda en status DRAFT para que el host la revise antes de activar.
 */
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
  const customName = String(formData.get("name") || "").trim() || null;

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
              options: { orderBy: { order: "asc" } },
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

  // Impedir copiar a la misma propiedad
  if (targetPropertyId === source.propertyId) {
    throw new Error("La propiedad destino debe ser distinta a la propiedad de origen");
  }

  // ── 3. Resolver nombre (sin colisión) ───────────────────────────────────────
  const baseName = customName || source.name;
  const finalName = await resolveUniqueName(tenantId, targetPropertyId, baseName);

  // ── 4. Transacción atómica: crear todo o nada ───────────────────────────────
  const newTemplate = await prisma.$transaction(async (tx) => {
    // Template — siempre DRAFT
    const template = await tx.taskTemplate.create({
      data: {
        tenantId,
        propertyId: targetPropertyId,
        name: finalName,
        description: source.description,
        status: "DRAFT",
      },
    });

    // Schedule (copiar configuración; si no existe en origen, crear default)
    const sched = source.schedule;
    await tx.taskTemplateSchedule.create({
      data: {
        tenantId,
        templateId: template.id,
        frequency: sched?.frequency ?? "MANUAL",
        carryForwardPolicy: sched?.carryForwardPolicy ?? "LIMITED",
        maxCarryForwardAttempts: sched?.maxCarryForwardAttempts ?? 2,
        anchorDayOfWeek: sched?.anchorDayOfWeek ?? null,
        anchorDayOfMonth: sched?.anchorDayOfMonth ?? null,
        timezone: sched?.timezone ?? null,
      },
    });

    // Secciones + assets + pasos + opciones + assets de pasos
    for (const section of source.sections) {
      const newSection = await tx.taskSectionTemplate.create({
        data: {
          tenantId,
          templateId: template.id,
          name: section.name,
          description: section.description,
          sectionType: section.sectionType,
          order: section.order,
          requiresGlobalConfirm: section.requiresGlobalConfirm,
        },
      });

      // Fotos de referencia de la sección (reutiliza el mismo Asset — solo copia el join)
      for (const asset of section.referenceAssets) {
        await tx.taskSectionReferenceAsset.create({
          data: {
            tenantId,
            sectionId: newSection.id,
            assetId: asset.assetId,
            caption: asset.caption,
            order: asset.order,
          },
        });
      }

      // Pasos
      for (const step of section.steps) {
        const newStep = await tx.taskStepTemplate.create({
          data: {
            tenantId,
            sectionId: newSection.id,
            name: step.name,
            description: step.description,
            isRequired: step.isRequired,
            blocksCompletion: step.blocksCompletion,
            order: step.order,
            // Capturas
            capturesYesNo: step.capturesYesNo,
            yesNoRequired: step.yesNoRequired,
            capturesNumber: step.capturesNumber,
            numberRequired: step.numberRequired,
            numberMin: step.numberMin,
            numberMax: step.numberMax,
            capturesPhoto: step.capturesPhoto,
            photoRequired: step.photoRequired,
            capturesText: step.capturesText,
            textRequired: step.textRequired,
            captureVersion: step.captureVersion,
            // Frecuencia por paso
            stepFrequency: step.stepFrequency,
            stepAnchorDayOfWeek: step.stepAnchorDayOfWeek,
            stepAnchorDayOfMonth: step.stepAnchorDayOfMonth,
            intervalDays: step.intervalDays,
            startDate: step.startDate,
          },
        });

        // Opciones de selección
        for (const option of step.options) {
          await tx.taskStepOption.create({
            data: {
              tenantId,
              stepId: newStep.id,
              label: option.label,
              order: option.order,
            },
          });
        }

        // Fotos de referencia del paso (mismo Asset, nuevo join)
        for (const asset of step.referenceAssets) {
          await tx.taskStepReferenceAsset.create({
            data: {
              tenantId,
              stepId: newStep.id,
              assetId: asset.assetId,
              caption: asset.caption,
              order: asset.order,
            },
          });
        }
      }
    }

    return template;
  });

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

  // Fallback extremo: nunca debería llegar aquí
  return `${baseName} (copia ${Date.now()})`;
}
