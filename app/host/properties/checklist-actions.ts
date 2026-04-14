/**
 * Server Actions para gestionar el checklist de propiedades
 */

"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { ChecklistArea } from "@/lib/generated/prisma";
import { getChecklistItemImageThumbs } from "@/lib/media/getChecklistItemImageThumbs";

// Nota: estas actions se usan desde UI client-side (optimistic) y NO deben redirigir.

export async function createChecklistItem(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado.");

  const propertyId = formData.get("propertyId")?.toString();
  const area = formData.get("area")?.toString() as ChecklistArea | null;
  const title = formData.get("title")?.toString().trim();
  const requiresValue = formData.get("requiresValue")?.toString() === "true";
  const valueLabel = formData.get("valueLabel")?.toString().trim() || null;

  if (!propertyId || !area || !title) {
    throw new Error("Faltan datos para crear el item.");
  }

  // Verificar que la propiedad existe y pertenece al tenant
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
  
  if (!property) {
    console.error("[createChecklistItem] Property not found for propertyId:", propertyId);
    throw new Error("Propiedad no encontrada.");
  }

  // Obtener el máximo sortOrder para esta propiedad (usar propertyId)
  const maxSortOrder = await (prisma as any).propertyChecklistItem.findFirst({
    where: {
      propertyId: property.id,
      tenantId,
    },
    orderBy: {
      sortOrder: "desc",
    },
    select: {
      sortOrder: true,
    },
  });

  const nextSortOrder = (maxSortOrder?.sortOrder ?? -1) + 1;

  const created = await (prisma as any).propertyChecklistItem.create({
    data: {
      tenantId,
      propertyId: property.id,
      area,
      title,
      sortOrder: nextSortOrder,
      isActive: true,
      requiresValue,
      valueLabel,
    },
    select: {
      id: true,
      area: true,
      title: true,
      sortOrder: true,
      isActive: true,
      requiresValue: true,
      valueLabel: true,
    },
  });

  // Para alta optimista: revalidar solo la pantalla del checklist.
  revalidatePath(`/host/properties/${propertyId}/checklist`);

  return created as {
    id: string;
    area: ChecklistArea;
    title: string;
    sortOrder: number;
    isActive: boolean;
    requiresValue: boolean;
    valueLabel: string | null;
  };
}

export async function updateChecklistItem(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado.");

  const id = formData.get("id")?.toString();
  const propertyId = formData.get("propertyId")?.toString();
  const area = formData.get("area")?.toString() as ChecklistArea | null;
  const title = formData.get("title")?.toString().trim();
  const requiresValue = formData.get("requiresValue")?.toString() === "true";
  const valueLabel = formData.get("valueLabel")?.toString().trim() || null;

  if (!id || !propertyId || !area || !title) {
    throw new Error("Faltan datos para actualizar el item.");
  }

  // Verificar que el item existe y pertenece al tenant
  const item = await (prisma as any).propertyChecklistItem.findFirst({
    where: {
      id,
      tenantId,
      propertyId,
    },
  });

  if (!item) {
    throw new Error("Item no encontrado o no pertenece a tu cuenta.");
  }

  const updated = await (prisma as any).propertyChecklistItem.updateMany({
    where: {
      id,
      tenantId,
      propertyId,
    },
    data: {
      area,
      title,
      requiresValue,
      valueLabel,
    },
  });

  if (updated.count === 0) {
    throw new Error("No se pudo actualizar el item.");
  }

  revalidatePath(`/host/properties/${propertyId}/checklist`);

  return {
    id,
    area,
    title,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
    requiresValue,
    valueLabel,
  } as {
    id: string;
    area: ChecklistArea;
    title: string;
    sortOrder: number;
    isActive: boolean;
    requiresValue: boolean;
    valueLabel: string | null;
  };
}

export async function toggleChecklistItemActive(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado.");

  const id = formData.get("id")?.toString();
  const propertyId = formData.get("propertyId")?.toString();
  const isActiveStr = formData.get("isActive")?.toString();

  if (!id || !propertyId || isActiveStr === undefined) {
    throw new Error("Faltan datos para actualizar el item.");
  }

  const isActive = isActiveStr === "true";

  await (prisma as any).propertyChecklistItem.updateMany({
    where: {
      id,
      tenantId,
      propertyId,
    },
    data: {
      isActive: !isActive,
    },
  });

  revalidatePath(`/host/properties/${propertyId}/checklist`);
}

export async function deleteChecklistItem(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado.");

  const id = formData.get("id")?.toString();
  const propertyId = formData.get("propertyId")?.toString();

  if (!id || !propertyId) {
    throw new Error("Faltan datos para eliminar el item.");
  }

  const deleted = await (prisma as any).propertyChecklistItem.deleteMany({
    where: {
      id,
      tenantId,
      propertyId,
    },
  });

  if (deleted.count === 0) {
    throw new Error("No se pudo eliminar el item.");
  }

  revalidatePath(`/host/properties/${propertyId}/checklist`);
}

export async function deleteChecklistArea(propertyId: string, area: ChecklistArea) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado.");

  const deleted = await (prisma as any).propertyChecklistItem.deleteMany({
    where: {
      propertyId,
      tenantId,
      area,
    },
  });

  revalidatePath(`/host/properties/${propertyId}/checklist`);
}

export async function copyChecklistToProperties(
  sourcePropertyId: string,
  targetPropertyIds: string[]
): Promise<{ copied: number; errors: string[] }> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado.");

  const errors: string[] = [];
  let copied = 0;

  // Verificar que la propiedad origen existe y pertenece al tenant
  const sourceProperty = await prisma.property.findFirst({
    where: {
      id: sourcePropertyId,
      tenantId,
    },
    select: { id: true },
  });

  if (!sourceProperty) {
    throw new Error("Propiedad origen no encontrada.");
  }

  // Obtener items del checklist origen
  const sourceItems = await (prisma as any).propertyChecklistItem.findMany({
    where: {
      propertyId: sourceProperty.id,
      tenantId,
      isActive: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
  });

  if (sourceItems.length === 0) {
    return { copied: 0, errors: [] };
  }

  // Copiar a cada propiedad destino
  for (const targetPropertyId of targetPropertyIds) {
    try {
      // Verificar que la propiedad destino existe y pertenece al tenant
      const targetProperty = await prisma.property.findFirst({
        where: {
          id: targetPropertyId,
          tenantId,
        },
        select: { id: true },
      });

      if (!targetProperty) {
        errors.push(`Propiedad ${targetPropertyId} no encontrada`);
        continue;
      }

      // Eliminar items existentes del checklist destino
      await (prisma as any).propertyChecklistItem.deleteMany({
        where: {
          propertyId: targetProperty.id,
          tenantId,
        },
      });

      // Crear items copiados
      for (const item of sourceItems) {
        await (prisma as any).propertyChecklistItem.create({
          data: {
            tenantId,
            propertyId: targetProperty.id,
            area: item.area,
            title: item.title,
            sortOrder: item.sortOrder,
            isActive: true,
            requiresValue: item.requiresValue || false,
            valueLabel: item.valueLabel || null,
          },
        });
      }

      revalidatePath(`/host/properties/${targetPropertyId}/checklist`);
      copied++;
    } catch (error: any) {
      console.error(`[copyChecklistToProperties] Error copying to ${targetPropertyId}:`, error);
      errors.push(`Error al copiar a ${targetPropertyId}: ${error?.message || "Error desconocido"}`);
    }
  }

  return { copied, errors };
}

export async function createBaseChecklistTemplate(formData: FormData): Promise<{
  created: number;
  message: string;
  items?: Array<{
    id: string;
    area: ChecklistArea;
    title: string;
    sortOrder: number;
    isActive: boolean;
    requiresValue: boolean;
    valueLabel: string | null;
  }>;
}> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado.");

  const propertyId = formData.get("propertyId")?.toString();

  if (!propertyId) {
    return { created: 0, message: "No se pudo crear la plantilla (propiedad inválida).", items: [] };
  }

  // Verificar que la propiedad existe y pertenece al tenant
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });

  if (!property) {
    throw new Error("Propiedad no encontrada.");
  }

  // Verificar si ya hay items activos
  const existingActive = await (prisma as any).propertyChecklistItem.count({
    where: {
      propertyId: property.id,
      tenantId,
      isActive: true,
    },
  });

  if (existingActive > 0) {
    return {
      created: 0,
      message: "Ya existe un checklist activo para esta propiedad.",
    };
  }

  // Plantilla base de tareas comunes
  const baseTemplate = [
    { area: "SALA" as ChecklistArea, title: "Aspirar alfombras y tapetes", sortOrder: 0 },
    { area: "SALA" as ChecklistArea, title: "Limpiar muebles y superficies", sortOrder: 1 },
    { area: "SALA" as ChecklistArea, title: "Limpiar ventanas y espejos", sortOrder: 2 },
    { area: "COCINA" as ChecklistArea, title: "Limpiar estufa y horno", sortOrder: 0 },
    { area: "COCINA" as ChecklistArea, title: "Limpiar refrigerador por fuera", sortOrder: 1 },
    { area: "COCINA" as ChecklistArea, title: "Limpiar fregadero y grifos", sortOrder: 2 },
    { area: "COCINA" as ChecklistArea, title: "Limpiar gabinetes y superficies", sortOrder: 3 },
    { area: "BANOS" as ChecklistArea, title: "Limpiar sanitario", sortOrder: 0 },
    { area: "BANOS" as ChecklistArea, title: "Limpiar regadera y azulejos", sortOrder: 1 },
    { area: "BANOS" as ChecklistArea, title: "Limpiar espejo y grifos", sortOrder: 2 },
    { area: "BANOS" as ChecklistArea, title: "Reponer papel higiénico", sortOrder: 3, requiresValue: true, valueLabel: "Rollos" },
    { area: "HABITACIONES" as ChecklistArea, title: "Cambiar sábanas y fundas", sortOrder: 0 },
    { area: "HABITACIONES" as ChecklistArea, title: "Aspirar piso y alfombras", sortOrder: 1 },
    { area: "HABITACIONES" as ChecklistArea, title: "Limpiar muebles y superficies", sortOrder: 2 },
    { area: "HABITACIONES" as ChecklistArea, title: "Reponer toallas", sortOrder: 3, requiresValue: true, valueLabel: "Toallas" },
  ];

  const createdItems = [];

  for (const templateItem of baseTemplate) {
    const created = await (prisma as any).propertyChecklistItem.create({
      data: {
        tenantId,
        propertyId: property.id,
        area: templateItem.area,
        title: templateItem.title,
        sortOrder: templateItem.sortOrder,
        isActive: true,
        requiresValue: templateItem.requiresValue || false,
        valueLabel: templateItem.valueLabel || null,
      },
      select: {
        id: true,
        area: true,
        title: true,
        sortOrder: true,
        isActive: true,
        requiresValue: true,
        valueLabel: true,
      },
    });
    createdItems.push(created);
  }

  revalidatePath(`/host/properties/${propertyId}/checklist`);

  return {
    created: createdItems.length,
    message: `Plantilla base creada con ${createdItems.length} tareas.`,
    items: createdItems,
  };
}

/**
 * Server action para obtener thumbs de imágenes de un checklist item
 * (equivalente a getInventoryItemThumbsAction)
 */
export async function getChecklistItemThumbsAction(checklistItemId: string): Promise<Array<string | null>> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  // Verificar que el item existe y pertenece al tenant
  const item = await (prisma as any).propertyChecklistItem.findFirst({
    where: {
      id: checklistItemId,
      tenantId,
    },
  });

  if (!item) {
    throw new Error("PropertyChecklistItem no encontrado o no pertenece a tu cuenta");
  }

  return await getChecklistItemImageThumbs(checklistItemId);
}
