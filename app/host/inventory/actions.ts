"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import {
  createInventoryLine,
  updateInventoryLine,
  deleteInventoryLine,
  deleteInventoryArea,
  listInventoryCatalogByCategory,
  listInventorySiblings,
  getInventoryLineById,
  updateInventoryItem,
  deleteInventoryItem,
  copyInventoryBetweenProperties,
  checkDuplicateInventoryLine,
  searchInventoryCatalog,
  getFrequentInventoryItems,
  searchGlobalCatalogItems,
  ensureTenantCatalogItemFromGlobal,
} from "@/lib/inventory";
import { getInventoryItemImageThumbs } from "@/lib/media/getInventoryItemImageThumbs";
import {
  InventoryCategory,
  InventoryCondition,
  InventoryPriority,
} from "@prisma/client";
import {
  serializeDefaultVariantOptions,
  parseDefaultVariantOptions,
  parseDefaultVariantGroups,
  serializeDefaultVariantGroups,
  normalizeVariantKey,
  type VariantGroupData,
} from "@/lib/variant-group";

function redirectBack(formData: FormData) {
  const propertyId = formData.get("propertyId")?.toString();
  if (propertyId) {
    redirect(`/host/properties/${propertyId}/inventory`);
  }
  redirect("/host/properties");
}

export async function createInventoryLineAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const propertyId = formData.get("propertyId")?.toString();
  if (!propertyId) {
    throw new Error("No se encontró la propiedad");
  }

  // Phase 7.1: propertyZoneId es obligatorio — no se acepta area como fallback
  const propertyZoneId = formData.get("propertyZoneId")?.toString() || null;
  if (!propertyZoneId) {
    throw new Error("La zona es obligatoria");
  }

  const category = formData.get("category")?.toString() as InventoryCategory | null;
  if (!category || !Object.values(InventoryCategory).includes(category)) {
    throw new Error("La categoría es obligatoria y debe ser válida");
  }

  const itemId = formData.get("itemId")?.toString() || null;
  const itemNameRaw = formData.get("itemName")?.toString() || "";
  const itemName = itemNameRaw.trim() || null;

  if (!itemId && !itemName) {
    throw new Error("Debes seleccionar un ítem o ingresar un nombre");
  }

  if (itemName && itemName.length === 0) {
    throw new Error("El nombre del ítem es obligatorio");
  }

  if (itemName && itemName.length > 120) {
    throw new Error("El nombre del ítem no puede tener más de 120 caracteres");
  }

  const expectedQtyStr = formData.get("expectedQty")?.toString();
  const expectedQty = expectedQtyStr ? parseInt(expectedQtyStr, 10) : 1;

  if (!expectedQty || isNaN(expectedQty) || expectedQty <= 0) {
    throw new Error("La cantidad debe ser mayor a 0");
  }

  // Variantes comerciales
  const variantKey = formData.get("variantKey")?.toString().trim() || null;
  const variantValue = formData.get("variantValue")?.toString().trim() || null;
  const defaultVariantKey = formData.get("defaultVariantKey")?.toString().trim() || null;

  // Validar: si hay variantKey, debe haber variantValue
  if (variantKey && !variantValue) {
    throw new Error("Si se especifica una variante, debe tener un valor");
  }

  // Campos opcionales avanzados
  const brand = formData.get("brand")?.toString().trim() || null;
  const model = formData.get("model")?.toString().trim() || null;
  const serialNumber = formData.get("serialNumber")?.toString().trim() || null;
  const color = formData.get("color")?.toString().trim() || null;
  const size = formData.get("size")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;
  
  // Validar y obtener condition
  const conditionRaw = formData.get("condition")?.toString();
  let condition: InventoryCondition = InventoryCondition.USED_LT_1Y; // Default
  if (conditionRaw && Object.values(InventoryCondition).includes(conditionRaw as InventoryCondition)) {
    condition = conditionRaw as InventoryCondition;
  }
  
  // Validar y obtener priority
  const priorityRaw = formData.get("priority")?.toString();
  let priority: InventoryPriority = InventoryPriority.MEDIUM; // Default
  if (priorityRaw && Object.values(InventoryPriority).includes(priorityRaw as InventoryPriority)) {
    priority = priorityRaw as InventoryPriority;
  }

  // Leer allowDuplicate del FormData
  const allowDuplicate = formData.get("allowDuplicate") === "true";
  console.log("[createInventoryLineAction] allowDuplicate:", allowDuplicate);

  try {
    const result = await createInventoryLine(tenantId, propertyId, {
      propertyZoneId,
      category,
      itemId: itemId || undefined,
      itemName: itemName || undefined,
      expectedQty,
      condition,
      priority,
      brand,
      model,
      serialNumber,
      color,
      size,
      notes,
      variantKey: variantKey || undefined,
      variantValue: variantValue || undefined,
      defaultVariantKey: defaultVariantKey || undefined,
      allowDuplicate, // Pasar el flag
    });

    // Obtener el nombre del item para el modal de confirmación
    // result.itemId siempre debería existir porque createInventoryLine lo retorna
    const finalItemId = result.itemId;
    let finalItemName = itemName || null;
    
    // Si se usó itemId existente, obtener el nombre del item (scoped por tenant)
    if (itemId && !finalItemName) {
      const item = await prisma.inventoryItem.findFirst({
        where: { id: itemId, tenantId },
        select: { name: true },
      });
      if (item) {
        finalItemName = item.name;
      }
    }
    
    // Si aún no tenemos nombre y tenemos itemId, obtenerlo de la BD (scoped por tenant)
    if (finalItemId && !finalItemName) {
      const item = await prisma.inventoryItem.findFirst({
        where: { id: finalItemId, tenantId },
        select: { name: true },
      });
      if (item) {
        finalItemName = item.name;
      }
    }

    console.log("[createInventoryLineAction] Retornando:", { itemId: finalItemId, itemName: finalItemName });

    revalidatePath(`/host/properties/${propertyId}/inventory`);
    
    // Retornar itemId y nombre para el modal de confirmación
    return {
      itemId: finalItemId,
      itemName: finalItemName,
    };
  } catch (error: any) {
    console.error("[createInventoryLineAction] Error:", error);
    // Re-lanzar errores de validación y duplicados con mensajes amigables
    if (error?.message) {
      throw error;
    }
    throw new Error("Ocurrió un error al crear el item. Por favor, intenta de nuevo.");
  }
}

/**
 * Verifica si ya existe un item duplicado antes de crear.
 * Si no hay itemId pero hay itemName, busca el item primero por nombre normalizado.
 */
export async function checkDuplicateInventoryLineAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return { exists: false };

  const propertyId = formData.get("propertyId")?.toString();
  if (!propertyId) {
    return { exists: false };
  }

  // Phase 7.1: propertyZoneId es obligatorio — no se resuelve desde area
  const propertyZoneId = formData.get("propertyZoneId")?.toString() || null;
  if (!propertyZoneId) {
    return { exists: false };
  }

  let itemId = formData.get("itemId")?.toString() || null;
  
  // Si no hay itemId pero hay itemName, buscar el item por nombre normalizado
  if (!itemId) {
    const itemNameRaw = formData.get("itemName")?.toString() || "";
    const itemName = itemNameRaw.trim();
    const category = formData.get("category")?.toString() as InventoryCategory | null;
    
    if (itemName && category && Object.values(InventoryCategory).includes(category)) {
      const { normalizeName } = await import("@/lib/inventory-normalize");
      const nameNormalized = normalizeName(itemName);
      
      // Buscar por nameNormalized únicamente (category is classification, not identity - CATALOG_ITEMS_V1 §4.3)
      // Usar findFirst con ordenamiento determinístico hasta que se regenere el cliente de Prisma
      // después de aplicar la migración del compound unique
      const existingItem = await prisma.inventoryItem.findFirst({
        where: {
          tenantId: tenantId,
          nameNormalized,
          archivedAt: null, // Solo items activos
        },
        select: {
          id: true,
          name: true,
          category: true, // Para logging/debugging
          defaultVariantKey: true,
          defaultVariantLabel: true,
          defaultVariantOptions: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], // Determinístico: más antiguo primero
      });
      
      if (existingItem) {
        itemId = existingItem.id;
        console.log("[checkDuplicateInventoryLineAction] Item encontrado por nombre:", itemId, "categoría original:", existingItem.category);
      } else {
        // Si el item no existe, no puede haber duplicado
        console.log("[checkDuplicateInventoryLineAction] Item no existe aún, no hay duplicado");
        return { exists: false };
      }
    } else {
      console.log("[checkDuplicateInventoryLineAction] No hay itemName para buscar");
      return { exists: false };
    }
  }

  if (!itemId) {
    console.log("[checkDuplicateInventoryLineAction] No hay itemId disponible");
    return { exists: false };
  }

  console.log("[checkDuplicateInventoryLineAction] Verificando duplicado con itemId:", itemId, "zoneId:", propertyZoneId);

  const variantKey = formData.get("variantKey")?.toString().trim() || null;
  const variantValue = formData.get("variantValue")?.toString().trim() || null;

  try {
    const result = await checkDuplicateInventoryLine(tenantId, propertyId, {
      propertyZoneId,
      itemId,
      variantKey,
      variantValue,
    });

    return result || { exists: false };
  } catch (error: any) {
    console.error("[checkDuplicateInventoryLineAction] Error:", error);
    return { exists: false };
  }
}

export async function deleteInventoryLineAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const lineId = formData.get("lineId")?.toString();
  const propertyId = formData.get("propertyId")?.toString();

  if (!lineId) {
    throw new Error("No se encontró la línea de inventario");
  }

  try {
    await deleteInventoryLine(tenantId, lineId);
    if (propertyId) {
      revalidatePath(`/host/properties/${propertyId}/inventory`);
    }
    // No redirigir aquí - el componente cliente maneja el refresh
  } catch (error) {
    console.error("[deleteInventoryLineAction] Error:", error);
    throw error;
  }
}

/**
 * Elimina un área completa y todos sus items (soft delete).
 */
export async function deleteInventoryAreaAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const propertyId = formData.get("propertyId")?.toString();
  const propertyZoneId = formData.get("propertyZoneId")?.toString();

  if (!propertyId) {
    throw new Error("No se encontró la propiedad");
  }
  if (!propertyZoneId) {
    throw new Error("La zona es obligatoria");
  }

  const { count } = await deleteInventoryArea(tenantId, propertyId, propertyZoneId);
  revalidatePath(`/host/properties/${propertyId}/inventory`);
  return { count };
}

/**
 * Obtiene el catálogo de items por categoría para el modal.
 */
export async function getCatalogByCategory(category: InventoryCategory) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return [];

  try {
    return await listInventoryCatalogByCategory(tenantId, category, 200);
  } catch (error) {
    console.error("[getCatalogByCategory] Error:", error);
    return [];
  }
}

/**
 * Actualiza una línea de inventario.
 */
export async function updateInventoryLineAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const lineId = formData.get("lineId")?.toString();
  if (!lineId) {
    throw new Error("No se encontró la línea de inventario");
  }

  const propertyId = formData.get("propertyId")?.toString();
  if (!propertyId) {
    throw new Error("No se encontró la propiedad");
  }

  // Phase 7.1: propertyZoneId es obligatorio — no se acepta area como fallback
  const propertyZoneId = formData.get("propertyZoneId")?.toString() || null;
  if (!propertyZoneId) {
    throw new Error("La zona es obligatoria");
  }

  const expectedQtyStr = formData.get("expectedQty")?.toString();
  const expectedQty = expectedQtyStr ? parseInt(expectedQtyStr, 10) : 1;

  if (!expectedQty || isNaN(expectedQty) || expectedQty <= 0) {
    throw new Error("La cantidad debe ser mayor a 0");
  }

  // Variantes comerciales
  const clearVariant = formData.get("clearVariant") === "true";
  const variantKeyRaw = formData.get("variantKey")?.toString().trim();
  const variantValueRaw = formData.get("variantValue")?.toString().trim();
  const variantKey = clearVariant ? null : (variantKeyRaw || null);
  const variantValue = clearVariant ? null : (variantValueRaw || null);

  // Validar: si hay variantKey, debe haber variantValue
  if (variantKey && !variantValue) {
    throw new Error("Si se especifica una variante, debe tener un valor");
  }

  // Campos opcionales avanzados
  const brand = formData.get("brand")?.toString().trim() || null;
  const model = formData.get("model")?.toString().trim() || null;
  const serialNumber = formData.get("serialNumber")?.toString().trim() || null;
  const color = formData.get("color")?.toString().trim() || null;
  const size = formData.get("size")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;
  
  // Validar y obtener condition
  const conditionRaw = formData.get("condition")?.toString();
  let condition: InventoryCondition = InventoryCondition.USED_LT_1Y; // Default
  if (conditionRaw && Object.values(InventoryCondition).includes(conditionRaw as InventoryCondition)) {
    condition = conditionRaw as InventoryCondition;
  }
  
  // Validar y obtener priority
  const priorityRaw = formData.get("priority")?.toString();
  let priority: InventoryPriority = InventoryPriority.MEDIUM; // Default
  if (priorityRaw && Object.values(InventoryPriority).includes(priorityRaw as InventoryPriority)) {
    priority = priorityRaw as InventoryPriority;
  }

  try {
    // Si se guarda con variantKey="bed_size", no enviar size (se limpiará en el servidor)
    const finalSize = variantKey === "bed_size" ? null : size;

    // Cuando clearVariant: pasar null explícitamente para limpiar. Si no, undefined = no actualizar.
    const lineVariantKey = clearVariant ? null : (variantKey || undefined);
    const lineVariantValue = clearVariant ? null : (variantValue || undefined);

    await updateInventoryLine(tenantId, lineId, {
      propertyZoneId,
      expectedQty,
      condition,
      priority,
      brand,
      model,
      serialNumber,
      color,
      size: finalSize,
      notes,
      variantKey: lineVariantKey,
      variantValue: lineVariantValue,
    });

    const itemId = formData.get("itemId")?.toString();

    if (clearVariant) {
      // Si se desmarcó variantes, limpiar también el grupo de variantes del ítem
      if (itemId) {
        await updateInventoryItem(tenantId, itemId, {
          defaultVariantKey: null,
          defaultVariantLabel: null,
          defaultVariantOptions: null,
        });
        // Desactivar links a VariantGroup en DB (no borrar; mantener integridad histórica)
        await prisma.inventoryItemVariantGroup.updateMany({
          where: {
            itemId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
      }
    }
    // No reactivar automáticamente al guardar con checkbox ON: solo reactivar cuando
    // el usuario usa "Agregar grupo" (attachVariantGroupToItemByKeyAction).

    revalidatePath(`/host/properties/${propertyId}/inventory`);
    // No redirigir aquí - el componente cliente maneja el cierre del modal
  } catch (error: any) {
    console.error("[updateInventoryLineAction] Error:", error);
    if (error?.message) {
      throw error;
    }
    throw new Error("Ocurrió un error al actualizar el item. Por favor, intenta de nuevo.");
  }
}

/**
 * Obtiene una línea de inventario por ID (para edición).
 */
/**
 * Crea un item en el catálogo sin crear una línea de inventario.
 * Útil para cuando el usuario crea un item personalizado desde "Otro..."
 */
export async function createInventoryItemAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const category = formData.get("category")?.toString() as InventoryCategory | null;
  if (!category || !Object.values(InventoryCategory).includes(category)) {
    throw new Error("La categoría es obligatoria y debe ser válida");
  }

  const itemNameRaw = formData.get("itemName")?.toString() || "";
  const itemName = itemNameRaw.trim();

  if (!itemName || itemName.length === 0) {
    throw new Error("El nombre del ítem es obligatorio");
  }

  if (itemName.length > 120) {
    throw new Error("El nombre del ítem no puede tener más de 120 caracteres");
  }

  const variantKey = formData.get("variantKey")?.toString().trim() || null;
  const variantLabel = formData.get("variantLabel")?.toString().trim() || null;
  const variantOptionsRaw = formData.get("variantOptions")?.toString();
  let variantOptions: any = null;
  
  if (variantOptionsRaw) {
    try {
      variantOptions = JSON.parse(variantOptionsRaw);
    } catch (e) {
      console.error("[createInventoryItemAction] Error parsing variantOptions:", e);
      throw new Error("Las opciones de variante tienen un formato inválido");
    }
  }

  try {
    const { normalizeName, capitalizeFirst } = await import("@/lib/inventory-normalize");
    const nameNormalized = normalizeName(itemName);
    const itemNameCapitalized = capitalizeFirst(itemName); // Capitalizar primera letra para display

    // Buscar si ya existe por nameNormalized únicamente (category is classification, not identity - CATALOG_ITEMS_V1 §4.3)
    // Usar findFirst con ordenamiento determinístico (más robusto hasta que se ejecute la migración)
    // Solo considerar items activos (archivedAt: null)
    const existingItem = await prisma.inventoryItem.findFirst({
      where: {
        tenantId: tenantId,
        nameNormalized,
        archivedAt: null, // Solo items activos
      },
      select: {
        id: true,
        name: true,
        category: true, // Para logging/debugging
        defaultVariantKey: true,
        defaultVariantLabel: true,
        defaultVariantOptions: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], // Determinístico: más antiguo primero
    });

    if (existingItem) {
      // Reutilizar item existente y conservar su categoría original (CATALOG_ITEMS_V1 §4.3)
      return {
        id: existingItem.id,
        name: existingItem.name,
        defaultVariantKey: existingItem.defaultVariantKey,
        // Los campos pueden no existir si la migración no se ha aplicado
        defaultVariantLabel: (existingItem as any).defaultVariantLabel || null,
        defaultVariantOptions: (existingItem as any).defaultVariantOptions || null,
      };
    }

    // Crear nuevo item usando create (upsert no disponible hasta que se ejecute la migración)
    // El manejo de race conditions se hace con try/catch de P2002
    const itemData: any = {
      tenantId: tenantId,
      category,
      name: itemNameCapitalized, // Capitalizar primera letra para consistencia visual
      nameNormalized, // nameNormalized sin capitalizar (normalización canónica)
      defaultVariantKey: variantKey,
    };
    
    // Solo agregar estos campos si tienen valores
    if (variantLabel !== null && variantLabel !== undefined && variantLabel.trim() !== "") {
      itemData.defaultVariantLabel = variantLabel;
      console.log("[createInventoryItemAction] Agregando defaultVariantLabel:", variantLabel);
    }
    if (variantOptions !== null && variantOptions !== undefined) {
      itemData.defaultVariantOptions = variantOptions;
      console.log("[createInventoryItemAction] Agregando defaultVariantOptions:", variantOptions);
    }
    
    console.log("[createInventoryItemAction] Creando item con data:", itemData);
    let item;
    try {
      item = await prisma.inventoryItem.create({
        data: itemData,
      });
      console.log("[createInventoryItemAction] Item creado:", item);
    } catch (createError: any) {
      console.error("[createInventoryItemAction] Error al crear item con variantes:", createError);
      console.error("[createInventoryItemAction] Error code:", createError?.code);
      console.error("[createInventoryItemAction] Error message:", createError?.message);
      
      // Si falla porque los campos no existen, intentar sin esos campos
      if (createError?.code === "P2021" || 
          createError?.message?.includes("Unknown column") || 
          createError?.message?.includes("does not exist") || 
          createError?.message?.includes("Unknown field") ||
          createError?.message?.includes("column") && createError?.message?.includes("does not exist")) {
        console.warn("[createInventoryItemAction] Campos de variantes personalizadas no existen, creando sin ellos");
        item = await prisma.inventoryItem.create({
          data: {
            tenantId: tenantId,
            category,
            name: itemNameCapitalized, // Capitalizar primera letra para consistencia visual
            nameNormalized, // nameNormalized sin capitalizar (normalización canónica)
            defaultVariantKey: variantKey,
          },
        });
      } else {
        // Si es otro error, lanzarlo para que se maneje arriba
        throw createError;
      }
    }
    
    // Retornar solo los campos que sabemos que existen
    return {
      id: item.id,
      name: item.name,
      defaultVariantKey: item.defaultVariantKey,
      defaultVariantLabel: (item as any).defaultVariantLabel || null,
      defaultVariantOptions: (item as any).defaultVariantOptions || null,
    };
  } catch (error: any) {
    console.error("[createInventoryItemAction] Error:", error);
    console.error("[createInventoryItemAction] Error details:", {
      code: error?.code,
      message: error?.message,
      meta: error?.meta,
    });
    if (error?.code === "P2002") {
      // Duplicado único - buscar el existente por nameNormalized únicamente (CATALOG_ITEMS_V1 §4.3)
      // category is classification, not identity
      const { normalizeName, capitalizeFirst } = await import("@/lib/inventory-normalize");
      const nameNormalized = normalizeName(itemName);
      const itemNameCapitalized = capitalizeFirst(itemName); // Capitalizar primera letra para display (aunque no se use si existe)
      
      // Usar findFirst con ordenamiento determinístico (más robusto hasta que se ejecute la migración)
      // Solo considerar items activos (archivedAt: null)
      const existingItem = await prisma.inventoryItem.findFirst({
        where: {
          tenantId: tenantId,
          nameNormalized,
          archivedAt: null, // Solo items activos
        },
        select: {
          id: true,
          name: true,
          category: true, // Para logging/debugging
          defaultVariantKey: true,
          defaultVariantLabel: true,
          defaultVariantOptions: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], // Determinístico: más antiguo primero
      });
      
      if (existingItem) {
        // Reutilizar item existente y conservar su categoría original (CATALOG_ITEMS_V1 §4.3)
        return {
          id: existingItem.id,
          name: existingItem.name,
          defaultVariantKey: existingItem.defaultVariantKey,
          defaultVariantLabel: (existingItem as any).defaultVariantLabel || null,
          defaultVariantOptions: (existingItem as any).defaultVariantOptions || null,
        };
      }
    }
    // Si el error es porque los campos no existen, dar un mensaje más específico
    if (error?.code === "P2021" || error?.message?.includes("Unknown column") || error?.message?.includes("does not exist")) {
      throw new Error("Los campos de variantes personalizadas no existen en la base de datos. Por favor, ejecuta la migración de Prisma: npx prisma migrate dev");
    }
    throw new Error(error?.message || "Ocurrió un error al crear el item. Por favor, intenta de nuevo.");
  }
}

/**
 * Actualiza un item del catálogo (InventoryItem).
 */
export async function updateInventoryItemAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const itemId = formData.get("itemId")?.toString();
  if (!itemId) {
    throw new Error("No se encontró el item");
  }

  const itemNameRaw = formData.get("itemName")?.toString() || "";
  const itemName = itemNameRaw.trim();

  if (!itemName || itemName.length === 0) {
    throw new Error("El nombre del ítem es obligatorio");
  }

  if (itemName.length > 120) {
    throw new Error("El nombre del ítem no puede tener más de 120 caracteres");
  }

  const variantKey = formData.get("variantKey")?.toString().trim() || null;
  const variantLabel = formData.get("variantLabel")?.toString().trim() || null;
  const variantOptionsRaw = formData.get("variantOptions")?.toString();
  let variantOptions: any = null;
  
  if (variantOptionsRaw) {
    try {
      variantOptions = JSON.parse(variantOptionsRaw);
    } catch (e) {
      console.error("[updateInventoryItemAction] Error parsing variantOptions:", e);
      throw new Error("Las opciones de variante tienen un formato inválido");
    }
  }

  try {
    // Aplicar capitalización de primera letra para consistencia visual (MUST)
    const { capitalizeFirst } = await import("@/lib/inventory-normalize");
    const itemNameCapitalized = capitalizeFirst(itemName);
    
    console.log("[updateInventoryItemAction] Actualizando item:", {
      itemId,
      itemName: itemNameCapitalized,
      variantKey,
      variantLabel,
      variantOptions,
    });
    await updateInventoryItem(tenantId, itemId, {
      name: itemNameCapitalized, // Capitalizar primera letra para consistencia visual
      defaultVariantKey: variantKey || null,
      defaultVariantLabel: variantLabel || null,
      defaultVariantOptions: variantOptions,
    });
    console.log("[updateInventoryItemAction] Item actualizado correctamente");
  } catch (error: any) {
    console.error("[updateInventoryItemAction] Error:", error);
    console.error("[updateInventoryItemAction] Error details:", {
      code: error?.code,
      message: error?.message,
      meta: error?.meta,
    });
    if (error?.code === "P2025") {
      throw new Error("El item no existe o no tienes permisos para editarlo");
    }
    // Si el error es porque los campos no existen, dar un mensaje más específico
    if (error?.code === "P2021" || error?.message?.includes("Unknown column") || error?.message?.includes("does not exist") || error?.message?.includes("Unknown field")) {
      throw new Error("Los campos de variantes personalizadas no existen en la base de datos. Por favor, ejecuta la migración de Prisma: npx prisma migrate dev");
    }
    throw new Error(error?.message || "Ocurrió un error al actualizar el item. Por favor, intenta de nuevo.");
  }
}

/**
 * Elimina un item del catálogo.
 */
export async function deleteInventoryItemAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const itemId = formData.get("itemId")?.toString();
  if (!itemId) {
    throw new Error("No se encontró el item");
  }

  console.log("[deleteInventoryItemAction] Iniciando eliminación:", {
    tenantId: tenantId,
    itemId,
    timestamp: new Date().toISOString(),
  });

  try {
    await deleteInventoryItem(tenantId, itemId);
    console.log("[deleteInventoryItemAction] Eliminación exitosa:", { itemId });
  } catch (error: any) {
    console.error("[deleteInventoryItemAction] Error al eliminar:", {
      itemId,
      errorMessage: error?.message,
      errorCode: error?.code,
      error: error,
    });
    // Re-lanzar el error con el mensaje original para que la UI lo muestre
    if (error?.message) {
      throw error;
    }
    throw new Error("Ocurrió un error al eliminar el item. Por favor, intenta de nuevo.");
  }
}

export async function getInventoryLine(lineId: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  try {
    return await getInventoryLineById(tenantId, lineId);
  } catch (error) {
    console.error("[getInventoryLine] Error:", error);
    return null;
  }
}

/**
 * Carga en un solo round-trip: línea, siblings, variantGroup y variantGroups.
 * Optimiza la apertura del editor de inventario.
 */
export async function getInventoryLineForEditAction(
  lineId: string,
  propertyId: string
): Promise<{
  line: NonNullable<Awaited<ReturnType<typeof getInventoryLineById>>>;
  siblings: Awaited<ReturnType<typeof listInventorySiblings>>;
  variantGroup: Awaited<ReturnType<typeof getInventoryItemVariantGroupAction>>;
  variantGroups: VariantGroupData[];
} | null> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  try {
    const line = await getInventoryLineById(tenantId, lineId);
    if (!line) return null;

    const zoneId = (line as { propertyZoneId?: string | null }).propertyZoneId ?? "";

    const lineVariantKey = (line as { variantKey?: string | null }).variantKey;
    const [siblings, variantGroup, variantGroups] = await Promise.all([
      listInventorySiblings(tenantId, propertyId, zoneId, line.item.id),
      getInventoryItemVariantGroupAction(line.item.id, lineVariantKey),
      getInventoryItemVariantGroupsAction(line.item.id),
    ]);

    return { line, siblings, variantGroup, variantGroups };
  } catch (error) {
    console.error("[getInventoryLineForEditAction] Error:", error);
    return null;
  }
}

/**
 * Lista líneas hermanas (variantes) para mismo (propertyId, propertyZoneId, itemId).
 */
export async function getInventoryLineSiblingsAction(
  propertyId: string,
  propertyZoneId: string,
  itemId: string
) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return [];

  try {
    return await listInventorySiblings(
      tenantId,
      propertyId,
      propertyZoneId,
      itemId
    );
  } catch (error) {
    console.error("[getInventoryLineSiblingsAction] Error:", error);
    return [];
  }
}

export interface VariantGroupPayload {
  key: string;
  label?: string | null;
  options: Array<{ value: string }>;
}

/**
 * Actualiza el grupo de variantes de un InventoryItem.
 * Si ya existen otros grupos, los conserva y actualiza solo este.
 */
export async function updateInventoryItemVariantGroupAction(
  itemId: string,
  payload: VariantGroupPayload
) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const key = normalizeVariantKey(payload.key);
  if (!key) {
    throw new Error("El key del grupo es obligatorio");
  }

  const optionsJson = serializeDefaultVariantOptions(payload.options);
  if (optionsJson.options.length < 2) {
    throw new Error("Se requieren al menos 2 opciones");
  }

  const groups = await getInventoryItemVariantGroupsAction(itemId);
  const updatedGroup = {
    key,
    label: payload.label?.trim() || null,
    options: optionsJson.options.map((o) => ({ value: o.value })),
  };

  const otherGroups = groups.filter((g) => g.key !== key);
  const newGroups = [...otherGroups, updatedGroup];
  const serialized = serializeDefaultVariantGroups(
    newGroups.map((g) => ({
      key: g.key,
      label: g.label,
      options: g.options.map((o) => ({ value: o.value })),
    }))
  );

  await updateInventoryItem(tenantId, itemId, {
    defaultVariantKey: (newGroups[0]?.key ?? key),
    defaultVariantLabel: (newGroups[0]?.label ?? payload.label?.trim()) || null,
    defaultVariantOptions: serialized as unknown,
  });
}

/**
 * Agrega un nuevo grupo de variantes a un InventoryItem.
 */
export async function addInventoryItemVariantGroupAction(
  itemId: string,
  payload: VariantGroupPayload
) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const key = normalizeVariantKey(payload.key);
  if (!key) {
    throw new Error("El nombre del grupo es obligatorio");
  }

  const optionsJson = serializeDefaultVariantOptions(payload.options);
  if (optionsJson.options.length < 2) {
    throw new Error("Se requieren al menos 2 opciones");
  }

  const groups = await getInventoryItemVariantGroupsAction(itemId);
  if (groups.some((g) => g.key === key)) {
    throw new Error(`El grupo "${key}" ya existe`);
  }

  // Si key es canónica y el tenant ya tiene ese grupo: usar "Agregar grupo", no crear
  const canonicalKeys = ["bed_size", "material", "use"];
  if (canonicalKeys.includes(key)) {
    const existingGroup = await prisma.variantGroup.findUnique({
      where: { tenantId_key: { tenantId: tenantId, key } },
    });
    if (existingGroup) {
      throw new Error(
        `El grupo "${key}" ya existe. Usa "Agregar grupo" para asociarlo al ítem.`
      );
    }
  }

  const newGroup = {
    key,
    label: payload.label?.trim() || null,
    options: optionsJson.options.map((o) => ({ value: o.value })),
  };
  const newGroups = [...groups.map((g) => ({
    key: g.key,
    label: g.label,
    options: g.options.map((o) => ({ value: o.value })),
  })), newGroup];

  const serialized = serializeDefaultVariantGroups(newGroups);

  await updateInventoryItem(tenantId, itemId, {
    defaultVariantKey: groups.length > 0 ? groups[0].key : key,
    defaultVariantLabel: groups.length > 0 ? groups[0].label : payload.label?.trim() || null,
    defaultVariantOptions: serialized as unknown,
  });
}

/**
 * Obtiene todos los grupos de variantes de un InventoryItem.
 * Prefiere VariantGroups DB si el ítem tiene links; fallback a variantes embebidas (legacy).
 */
export async function getInventoryItemVariantGroupsAction(
  itemId: string
): Promise<VariantGroupData[]> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return [];

  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, tenantId: tenantId },
    select: {
      defaultVariantKey: true,
      defaultVariantLabel: true,
      defaultVariantOptions: true,
      variantGroupLinks: {
        where: { isActive: true },
        include: {
          group: {
            include: {
              options: {
                where: { isArchived: false },
                orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!item) return [];

  if (
    item.variantGroupLinks &&
    item.variantGroupLinks.length > 0
  ) {
    return item.variantGroupLinks.map((link) => {
      let options = link.group.options.map((o) => ({
        value: o.label,
        valueNormalized: o.valueNormalized,
      }));
      // optionAllowlist: filtrar opciones visibles (ej. Vaso solo Vidrio/Plástico, no MDF/Tela)
      const allowlist = link.optionAllowlist;
      if (
        Array.isArray(allowlist) &&
        allowlist.length > 0
      ) {
        const allowSet = new Set(allowlist as string[]);
        options = options.filter((o) => allowSet.has(o.valueNormalized));
      }
      return {
        key: link.group.key,
        label: link.group.label,
        options,
      };
    });
  }

  return parseDefaultVariantGroups(item);
}

/**
 * Obtiene el grupo de variantes de un InventoryItem.
 * Si variantKey se proporciona, devuelve ese grupo; si no, el primero (o el que coincida con la línea en edición).
 */
export async function getInventoryItemVariantGroupAction(
  itemId: string,
  preferredVariantKey?: string | null
) {
  const groups = await getInventoryItemVariantGroupsAction(itemId);
  if (groups.length === 0) return null;
  if (preferredVariantKey) {
    const keyNorm = normalizeVariantKey(preferredVariantKey);
    const found = groups.find((g) => g.key === keyNorm);
    if (found) return found;
  }
  return groups[0];
}

/**
 * Reactiva links inactivos de VariantGroup para un ítem.
 * Solo reactiva existentes (isActive=false -> true); no crea nuevos.
 * Útil cuando el usuario vuelve a marcar "Este ítem tiene variantes".
 */
export async function reactivateItemVariantGroupsAction(itemId: string): Promise<{
  reactivatedCount: number;
}> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, tenantId: tenantId },
    select: { id: true },
  });
  if (!item) {
    throw new Error("Ítem no encontrado");
  }

  const result = await prisma.inventoryItemVariantGroup.updateMany({
    where: {
      itemId,
      isActive: false,
    },
    data: { isActive: true },
  });

  return { reactivatedCount: result.count };
}

/**
 * Desactiva una línea de inventario (isActive=false).
 * Reutilizado para "remover variante" sin eliminar físicamente.
 */
export async function setInventoryLineActiveAction(
  lineId: string,
  propertyId: string,
  isActive: boolean
) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  await updateInventoryLine(tenantId, lineId, { isActive });
  revalidatePath(`/host/properties/${propertyId}/inventory`);
}

/**
 * Actualiza solo la cantidad esperada de una línea.
 */
export async function updateInventoryLineExpectedQtyAction(
  lineId: string,
  propertyId: string,
  expectedQtyRaw: number | string
) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const expectedQty =
    typeof expectedQtyRaw === "number" ? expectedQtyRaw : parseInt(String(expectedQtyRaw), 10);

  if (
    !Number.isFinite(expectedQty) ||
    !Number.isInteger(expectedQty) ||
    expectedQty <= 0
  ) {
    throw new Error("Cantidad inválida. Debe ser un entero mayor a 0.");
  }

  await updateInventoryLine(tenantId, lineId, { expectedQty });
  revalidatePath(`/host/properties/${propertyId}/inventory`);
}

/**
 * Busca items en el catálogo por nombre (búsqueda global).
 * @deprecated Usar searchGlobalCatalogItemsAction para autocomplete Step 1
 */
export async function searchCatalogAction(searchTerm: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return [];

  try {
    return await searchInventoryCatalog(tenantId, searchTerm);
  } catch (error) {
    console.error("[searchCatalogAction] Error:", error);
    return [];
  }
}

/**
 * Busca items en el Catálogo Global (fuente primaria para autocomplete Step 1).
 */
export async function searchGlobalCatalogItemsAction(searchTerm: string) {
  try {
    return await searchGlobalCatalogItems(searchTerm, "es-MX", 20);
  } catch (error) {
    console.error("[searchGlobalCatalogItemsAction] Error:", error);
    return [];
  }
}

/**
 * Asegura que existe un InventoryItem del tenant basado en un GlobalCatalogItem.
 * Lazy copy: busca primero, crea solo si no existe.
 */
export async function ensureTenantCatalogItemFromGlobalAction(globalCatalogItemId: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  try {
    return await ensureTenantCatalogItemFromGlobal(tenantId, globalCatalogItemId);
  } catch (error) {
    console.error("[ensureTenantCatalogItemFromGlobalAction] Error:", error);
    throw error;
  }
}

/**
 * Obtiene items frecuentes del catálogo (para mostrar cuando no hay búsqueda).
 */
export async function getFrequentItemsAction() {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return [];

  try {
    return await getFrequentInventoryItems(tenantId);
  } catch (error) {
    console.error("[getFrequentItemsAction] Error:", error);
    return [];
  }
}

/**
 * Phase 7: Obtiene las zonas OPERATIONAL activas de una propiedad, ordenadas por sortOrder.
 * Reemplaza getExistingAreas en los formularios de creación/edición.
 * Phase 12: Incluye operationalCategory.
 */
export async function getPropertyZones(propertyId: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return [];

  try {
    const zones = await prisma.propertyZone.findMany({
      where: {
        tenantId,
        propertyId,
        zoneType: "OPERATIONAL",
        isActive: true,
      },
      select: { id: true, name: true, sortOrder: true, operationalCategory: true },
      orderBy: { sortOrder: "asc" },
    });
    return zones;
  } catch (error) {
    console.error("[getPropertyZones] Error:", error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Phase 12: Gestión manual de zonas (PropertyZone)
// ─────────────────────────────────────────────────────────────

import { normalizeName as _normalizeName } from "@/lib/inventory-normalize";
import { deactivatePropertyZone, copyInventoryBetweenZones } from "@/lib/inventory";
import type { PropertyZoneOperationalCategory } from "@prisma/client";

/**
 * Phase 12: Crea una nueva zona OPERATIONAL para una propiedad.
 * sortOrder = max(sortOrder existente) + 10, o 10 si no hay zonas.
 */
export async function createPropertyZoneAction(
  propertyId: string,
  name: string,
  operationalCategory: PropertyZoneOperationalCategory | null
) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre del área es obligatorio");

  const normalizedName = _normalizeName(trimmed);

  // Calcular sortOrder
  const existing = await prisma.propertyZone.findFirst({
    where: { tenantId, propertyId, zoneType: "OPERATIONAL" },
    select: { sortOrder: true },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (existing?.sortOrder ?? 0) + 10;

  try {
    const zone = await prisma.propertyZone.create({
      data: {
        tenantId,
        propertyId,
        name: trimmed,
        normalizedName,
        zoneType: "OPERATIONAL",
        virtualKind: null,
        operationalCategory: operationalCategory ?? null,
        sortOrder,
        isActive: true,
      },
      select: { id: true, name: true, sortOrder: true, operationalCategory: true },
    });
    return zone;
  } catch (error: any) {
    if (error?.code === "P2002") {
      throw new Error(`Ya existe un área con el nombre "${trimmed}"`);
    }
    throw error;
  }
}

/**
 * Phase 12: Renombra una zona. Valida colisión de normalizedName antes de actualizar.
 */
export async function renamePropertyZoneAction(zoneId: string, newName: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const trimmed = newName.trim();
  if (!trimmed) throw new Error("El nombre es obligatorio");

  const zone = await prisma.propertyZone.findFirst({
    where: { id: zoneId, tenantId },
    select: { propertyId: true },
  });
  if (!zone) throw new Error("Zona no encontrada");

  const normalizedName = _normalizeName(trimmed);

  // Verificar colisión (ignorando la zona actual)
  const collision = await prisma.propertyZone.findFirst({
    where: {
      propertyId: zone.propertyId,
      normalizedName,
      id: { not: zoneId },
    },
  });
  if (collision) throw new Error(`Ya existe un área con el nombre "${trimmed}"`);

  return prisma.propertyZone.update({
    where: { id: zoneId },
    data: { name: trimmed, normalizedName },
    select: { id: true, name: true },
  });
}

/**
 * Phase 12: Reordena las zonas de una propiedad actualizando sortOrder en bloque.
 * orderedZoneIds: array de IDs en el orden deseado (primero = sortOrder 10, luego 20, etc.).
 */
export async function reorderPropertyZonesAction(
  propertyId: string,
  orderedZoneIds: string[]
) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  await prisma.$transaction(
    orderedZoneIds.map((id, index) =>
      prisma.propertyZone.updateMany({
        where: { id, tenantId, propertyId },
        data: { sortOrder: (index + 1) * 10 },
      })
    )
  );

  return { count: orderedZoneIds.length };
}

/**
 * Phase 12: Desactiva una zona solo si no tiene InventoryLines activas.
 */
export async function deactivatePropertyZoneAction(zoneId: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  await deactivatePropertyZone(tenantId, zoneId);
  return { success: true as const };
}

/**
 * Obtiene las áreas existentes para una propiedad (para sugerencias en el modal).
 * @deprecated Usar getPropertyZones en su lugar.
 */
export async function getExistingAreas(propertyId: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return [];

  try {
    // Usar groupBy para obtener áreas únicas
    const areas = await prisma.inventoryLine.groupBy({
      by: ["area"],
      where: {
        tenantId: tenantId,
        propertyId,
      },
      orderBy: {
        area: "asc",
      },
      take: 50, // Límite razonable
    });

    return areas.map((a) => a.area);
  } catch (error) {
    console.error("[getExistingAreas] Error:", error);
    return [];
  }
}

/**
 * Copia inventario de una propiedad a otra.
 */
export async function copyInventoryBetweenPropertiesAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const fromPropertyId = formData.get("fromPropertyId")?.toString();
  const toPropertyId = formData.get("toPropertyId")?.toString();
  const copyQuantitiesStr = formData.get("copyQuantities")?.toString();
  const mode = (formData.get("mode")?.toString() as "merge" | "overwrite") || "merge";

  // Validaciones
  if (!fromPropertyId) {
    throw new Error("No se encontró la propiedad origen");
  }

  if (!toPropertyId) {
    throw new Error("No se encontró la propiedad destino");
  }

  if (fromPropertyId === toPropertyId) {
    throw new Error("No se puede copiar inventario de una propiedad a sí misma");
  }

  // Verificar que ambas propiedades existan y pertenezcan al tenant
  const [fromProperty, toProperty] = await Promise.all([
    prisma.property.findFirst({
      where: {
        id: fromPropertyId,
        tenantId: tenantId,
      },
    }),
    prisma.property.findFirst({
      where: {
        id: toPropertyId,
        tenantId: tenantId,
      },
    }),
  ]);

  if (!fromProperty) {
    throw new Error("La propiedad origen no existe o no pertenece a tu cuenta");
  }

  if (!toProperty) {
    throw new Error("La propiedad destino no existe o no pertenece a tu cuenta");
  }

  // Validar modo
  if (mode !== "merge" && mode !== "overwrite") {
    throw new Error("El modo debe ser 'merge' o 'overwrite'");
  }

  // Parsear copyQuantities (default: true)
  const copyQuantities = copyQuantitiesStr === "false" ? false : true;

  console.log("[copyInventoryBetweenPropertiesAction] Iniciando copia:", {
    tenantId: tenantId,
    fromPropertyId,
    toPropertyId,
    fromPropertyName: fromProperty.name,
    toPropertyName: toProperty.name,
    copyQuantities,
    mode,
  });

  try {
    const stats = await copyInventoryBetweenProperties({
      tenantId: tenantId,
      fromPropertyId,
      toPropertyId,
      copyQuantities,
      mode,
    });

    // Revalidar las páginas de inventario de ambas propiedades
    revalidatePath(`/host/properties/${fromPropertyId}/inventory`);
    revalidatePath(`/host/properties/${toPropertyId}/inventory`);

    console.log("[copyInventoryBetweenPropertiesAction] Copia exitosa:", stats);

    return stats;
  } catch (error: any) {
    console.error("[copyInventoryBetweenPropertiesAction] Error:", {
      errorMessage: error?.message,
      errorCode: error?.code,
      error: error,
    });

    if (error?.message) {
      throw error;
    }

    throw new Error("Ocurrió un error al copiar el inventario. Por favor, intenta de nuevo.");
  }
}

/**
 * Obtiene las URLs de thumbnails para un InventoryItem
 */
export async function getInventoryItemThumbsAction(itemId: string): Promise<Array<string | null>> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  // Verificar que el item existe y pertenece al tenant
  const item = await prisma.inventoryItem.findFirst({
    where: {
      id: itemId,
      tenantId: tenantId,
    },
  });

  if (!item) {
    throw new Error("InventoryItem no encontrado o no pertenece a tu cuenta");
  }

  return await getInventoryItemImageThumbs(itemId);
}

// ─────────────────────────────────────────────────────────────
// Phase 13: Copiar inventario entre zonas (PropertyZone → PropertyZone)
// ─────────────────────────────────────────────────────────────

/**
 * Phase 13: Copia líneas de inventario de sourceZone a targetZone dentro de la misma propiedad.
 * Omite duplicados silenciosamente. No copia historial, incidencias ni imágenes de línea.
 * Returns: { copied, skipped }
 */
export async function copyInventoryBetweenZonesAction(
  propertyId: string,
  sourceZoneId: string,
  targetZoneId: string
): Promise<{ copied: number; skipped: number }> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const result = await copyInventoryBetweenZones(tenantId, propertyId, sourceZoneId, targetZoneId);
  revalidatePath(`/host/properties/${propertyId}/inventory`);
  return result;
}


