"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { normalizeName, normalizeVariantValue } from "@/lib/inventory-normalize";
import {
  InventoryCategory,
  InventoryCondition,
  InventoryPriority,
  PropertyZoneType,
} from "@/lib/generated/prisma";
import fs from "fs";
import path from "path";
import { ensureCanonicalVariantGroupsForTenant } from "@/lib/variant-groups-bootstrap";

interface TemplateItem {
  item: {
    category: InventoryCategory;
    name: string;
    defaultBrand: string | null;
    defaultModel: string | null;
    defaultColor: string | null;
    defaultSize: string | null;
    isReplacable: boolean;
    defaultVariantKey: string | null;
    defaultVariantLabel: string | null;
    defaultVariantOptions: string[] | null;
  };
  lines: Array<{
    area: string;
    expectedQty: number;
    condition: InventoryCondition;
    priority: InventoryPriority;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    color: string | null;
    size: string | null;
    notes: string | null;
    variantKey: string | null;
    variantValue: string | null;
    isActive: boolean;
    areaNormalized: string;
  }>;
}

/**
 * Aplica la plantilla V1.0 de inventario a una propiedad.
 * Reemplaza completamente el inventario existente (OVERWRITE de líneas).
 * 
 * Overwrite de líneas; InventoryItem es catálogo (find-or-create por tenant):
 * - Elimina TODAS las InventoryLine de la propiedad (dentro de transacción)
 * - InventoryItem: find-or-create por tenant (no se borra, es catálogo compartido)
 * - Crea nuevas InventoryLine asociadas a items del catálogo
 * - Ejecutar dos veces produce el mismo resultado (mismas líneas, reutiliza items del catálogo)
 * 
 * ATÓMICO: no se permiten resultados parciales.
 * Si falla cualquier creación (item o línea), se hace ROLLBACK TOTAL.
 * El inventario previo NO se pierde.
 */
export async function applyInventoryTemplateToProperty(
  propertyId: string
): Promise<{ created: number; errors: string[] }> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  // 1. Validar que la propiedad existe y pertenece al tenant
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      tenantId,
    },
    select: { id: true },
  });

  if (!property) {
    throw new Error("Propiedad no encontrada.");
  }

  // 2. Cargar plantilla V1.0
  const templatePath = path.join(
    process.cwd(),
    "docs",
    "templates",
    "plantillaInventario.v1.0.json"
  );

  let templateData: { items: TemplateItem[] };
  try {
    const templateContent = fs.readFileSync(templatePath, "utf-8");
    templateData = JSON.parse(templateContent);
  } catch (error: any) {
    throw new Error(
      `No se pudo cargar la plantilla V1.0: ${error?.message || "Error desconocido"}`
    );
  }

  if (!templateData.items || !Array.isArray(templateData.items)) {
    throw new Error("La plantilla no tiene un formato válido.");
  }

  // 3. Preparación FUERA del tx (sin DB): construir estructuras de datos
  // Construir lista de items únicos de catálogo con key estable
  interface CatalogItemData {
    key: string;
    category: InventoryCategory;
    name: string;
    nameNormalized: string;
    defaultBrand: string | null;
    defaultModel: string | null;
    defaultColor: string | null;
    defaultSize: string | null;
    defaultVariantKey: string | null;
    defaultVariantLabel: string | null;
    defaultVariantOptions: any;
  }

  interface LineData {
    itemKey: string; // Referencia al key del catálogo
    area: string;
    areaNormalized: string;
    propertyZoneId: string | null; // Phase 6: resolved inside tx
    expectedQty: number;
    condition: InventoryCondition;
    priority: InventoryPriority;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    color: string | null;
    size: string | null;
    notes: string | null;
    variantKey: string | null;
    variantValue: string | null;
    variantValueNormalized: string | null;
  }

  const catalogItemsMap = new Map<string, CatalogItemData>();
  const linesData: LineData[] = [];

  // Procesar plantilla y construir estructuras
  for (const templateItem of templateData.items) {
    // Solo procesar items con líneas activas
    const activeLines = templateItem.lines.filter((line) => line.isActive);
    if (activeLines.length === 0) {
      continue;
    }

    const nameNormalized = normalizeName(templateItem.item.name);
    // Key basado solo en nameNormalized (category is classification, not identity - CATALOG_ITEMS_V1)
    const itemKey = nameNormalized;

    // Agregar item al catálogo (si no existe ya)
    if (!catalogItemsMap.has(itemKey)) {
      catalogItemsMap.set(itemKey, {
        key: itemKey,
        category: templateItem.item.category,
        name: templateItem.item.name.trim(),
        nameNormalized,
        defaultBrand: templateItem.item.defaultBrand || null,
        defaultModel: templateItem.item.defaultModel || null,
        defaultColor: templateItem.item.defaultColor || null,
        defaultSize: templateItem.item.defaultSize || null,
        defaultVariantKey: templateItem.item.defaultVariantKey || null,
        defaultVariantLabel: templateItem.item.defaultVariantLabel || null,
        defaultVariantOptions: templateItem.item.defaultVariantOptions || null,
      });
    }

    // Agregar líneas activas
    for (const line of activeLines) {
      const areaNormalized = normalizeName(line.area);
      const variantValueNormalized = line.variantValue
        ? normalizeVariantValue(line.variantValue)
        : null;

      linesData.push({
        itemKey,
        area: line.area.trim(),
        areaNormalized,
        propertyZoneId: null, // Phase 6: will be resolved inside tx
        expectedQty: line.expectedQty,
        condition: line.condition || InventoryCondition.USED_LT_1Y,
        priority: line.priority || InventoryPriority.MEDIUM,
        brand: line.brand || null,
        model: line.model || null,
        serialNumber: line.serialNumber || null,
        color: line.color || null,
        size: line.size || null,
        notes: line.notes || null,
        variantKey: line.variantKey || null,
        variantValue: line.variantValue || null,
        variantValueNormalized,
      });
    }
  }

  // 4. Crear inventario desde plantilla (transacción atómica real con bulk ops)
  // ATÓMICO: Si falla cualquier creación, rollback total; inventario previo se conserva
  // Overwrite de líneas; InventoryItem es catálogo (find-or-create por tenant)
  const errors: string[] = [];
  let created = 0;

  try {
    // La transacción retorna el contador solo si completa exitosamente
    // Timeout aumentado para operaciones bulk (eliminados N findFirst, ahora batching)
    created = await prisma.$transaction(
      async (tx) => {
        // 4.0. Bootstrap: asegurar que grupos canónicos (bed_size, material, use) existan para el tenant
        // Permite que cualquier Host (nuevo o existente) tenga variantes listas al aplicar plantilla
        await ensureCanonicalVariantGroupsForTenant(tenantId, tx);

        // 4.1. Resolver catálogo (InventoryItem) sin loops
        // Buscar items existentes por nameNormalized únicamente (category is classification, not identity - CATALOG_ITEMS_V1)
        const catalogItemsArray = Array.from(catalogItemsMap.values());
        const uniqueNameNormalized = Array.from(new Set(catalogItemsArray.map((item) => item.nameNormalized)));
        const existingItems = await tx.inventoryItem.findMany({
          where: {
            tenantId: tenantId,
            archivedAt: null,
            nameNormalized: {
              in: uniqueNameNormalized,
            },
          },
          select: {
            id: true,
            category: true,
            nameNormalized: true,
            createdAt: true, // Necesario para ordenamiento determinístico
          },
          orderBy: [
            { createdAt: "asc" }, // Determinístico: más antiguo primero
            { id: "asc" }, // Si empate, id más bajo primero
          ],
        });

        // Construir map de items existentes por nameNormalized (sin category)
        // Los items ya vienen ordenados determinísticamente desde la query
        const sortedExistingItems = existingItems;

        const existingItemsMap = new Map<string, { id: string; category: string }>();
        const duplicateGroups: Array<{ nameNormalized: string; count: number }> = [];

        for (const item of sortedExistingItems) {
          if (!existingItemsMap.has(item.nameNormalized)) {
            existingItemsMap.set(item.nameNormalized, { id: item.id, category: item.category });
          } else {
            // Detectar corrupción: múltiples items con mismo nameNormalized
            const existing = duplicateGroups.find((g) => g.nameNormalized === item.nameNormalized);
            if (existing) {
              existing.count++;
            } else {
              duplicateGroups.push({ nameNormalized: item.nameNormalized, count: 2 });
            }
          }
        }

        // Log warning si hay duplicados (corrupción de datos)
        if (duplicateGroups.length > 0) {
          console.warn(
            `[applyInventoryTemplateToProperty] DATA_CORRUPTION: Found duplicate catalog items for tenant ${tenantId}:`,
            duplicateGroups.map((g) => `${g.nameNormalized} (${g.count} items)`)
          );
          // Usar el primero (más antiguo) como winner determinístico
        }

        // Calcular items faltantes
        const missingItems: any[] = [];
        for (const itemData of catalogItemsArray) {
          const existingItem = existingItemsMap.get(itemData.nameNormalized);
          if (!existingItem) {
            // Item no existe, crear con categoría de la plantilla
            const itemToCreate: any = {
              tenantId: tenantId,
              category: itemData.category,
              name: itemData.name,
              nameNormalized: itemData.nameNormalized,
              archivedAt: null,
            };

            // Solo agregar campos si tienen valores
            if (itemData.defaultBrand) {
              itemToCreate.defaultBrand = itemData.defaultBrand;
            }
            if (itemData.defaultModel) {
              itemToCreate.defaultModel = itemData.defaultModel;
            }
            if (itemData.defaultColor) {
              itemToCreate.defaultColor = itemData.defaultColor;
            }
            if (itemData.defaultSize) {
              itemToCreate.defaultSize = itemData.defaultSize;
            }
            if (itemData.defaultVariantKey) {
              itemToCreate.defaultVariantKey = itemData.defaultVariantKey;
            }
            if (itemData.defaultVariantLabel) {
              itemToCreate.defaultVariantLabel = itemData.defaultVariantLabel;
            }
            if (itemData.defaultVariantOptions) {
              itemToCreate.defaultVariantOptions = itemData.defaultVariantOptions;
            }

            missingItems.push(itemToCreate);
          }
          // Si el item existe, se reutiliza y se conserva su categoría original (CATALOG_ITEMS_V1)
          // La categoría de la plantilla se ignora al reutilizar
        }

        // Crear items faltantes con createMany (skipDuplicates para idempotencia)
        if (missingItems.length > 0) {
          await tx.inventoryItem.createMany({
            data: missingItems,
            skipDuplicates: true,
          });
        }

        // Actualizar items EXISTENTES con variantes de la plantilla (fix: items reutilizados no tenían defaultVariantKey/Options)
        // Si el item ya existía, sus variantes no se actualizaban; ahora sincronizamos con la plantilla
        for (const itemData of catalogItemsArray) {
          const existingItem = existingItemsMap.get(itemData.nameNormalized);
          if (existingItem && (itemData.defaultVariantKey || itemData.defaultVariantLabel || itemData.defaultVariantOptions)) {
            await tx.inventoryItem.updateMany({
              where: { id: existingItem.id, tenantId: tenantId },
              data: {
                ...(itemData.defaultVariantKey ? { defaultVariantKey: itemData.defaultVariantKey } : {}),
                ...(itemData.defaultVariantLabel ? { defaultVariantLabel: itemData.defaultVariantLabel } : {}),
                ...(itemData.defaultVariantOptions ? { defaultVariantOptions: itemData.defaultVariantOptions as any } : {}),
              },
            });
          }
        }

        // Releer todos los items requeridos (existentes + recién creados) para obtener IDs
        // Buscar por nameNormalized incluyendo archivados (pueden haber sido saltados por skipDuplicates)
        const allItems = await tx.inventoryItem.findMany({
          where: {
            tenantId: tenantId,
            nameNormalized: {
              in: uniqueNameNormalized,
            },
          },
          select: {
            id: true,
            category: true,
            nameNormalized: true,
            archivedAt: true,
            createdAt: true, // Necesario para ordenamiento determinístico
          },
          orderBy: [
            { createdAt: "asc" }, // Determinístico: más antiguo primero
            { id: "asc" }, // Si empate, id más bajo primero
          ],
        });

        // Construir map nameNormalized -> itemId (sin category)
        // Los items ya vienen ordenados determinísticamente desde la query
        const sortedAllItems = allItems;

        const itemIdMap = new Map<string, string>();
        const itemIdsUsed = new Set<string>();
        for (const item of sortedAllItems) {
          // Si hay múltiples items con mismo nameNormalized (no debería pasar con nuevo constraint),
          // usar el primero (más antiguo) como determinístico
          if (!itemIdMap.has(item.nameNormalized)) {
            itemIdMap.set(item.nameNormalized, item.id);
            itemIdsUsed.add(item.id);
          } else {
            // Log warning si se detecta duplicado después de createMany
            console.warn(
              `[applyInventoryTemplateToProperty] DATA_CORRUPTION: Duplicate catalog item detected after createMany: tenantId=${tenantId}, nameNormalized="${item.nameNormalized}"`
            );
          }
        }

        // Reactivar items archivados que la plantilla reutiliza
        const archivedItemIds = allItems
          .filter((i) => i.archivedAt !== null && itemIdsUsed.has(i.id))
          .map((i) => i.id);
        if (archivedItemIds.length > 0) {
          await tx.inventoryItem.updateMany({
            where: { id: { in: archivedItemIds }, tenantId },
            data: { archivedAt: null },
          });
        }

        // 4.1.5. Eliminar imágenes personalizadas de los items usados en la plantilla
        // Los items creados desde plantilla NO deben tener imágenes personalizadas
        // Solo se mantiene la imagen por defecto (si existe a nivel de sistema)
        if (itemIdsUsed.size > 0) {
          await tx.inventoryItemAsset.deleteMany({
            where: {
              tenantId: tenantId,
              itemId: {
                in: Array.from(itemIdsUsed),
              },
            },
          });
        }

        // 4.2. OVERWRITE: Eliminar todas las InventoryLine de la propiedad
        // (dentro de transacción para atomicidad)
        await tx.inventoryLine.deleteMany({
          where: {
            propertyId: property.id,
            tenantId: tenantId,
          },
        });

        // 4.2.5. Phase 6: Upsert OPERATIONAL zones from template areas (template = canonical zone source)
        const ZONE_SORT_ORDER_MAP: Record<string, number> = {
          entrada: 5, cochera: 10, sala: 20, comedor: 30, cocina: 40,
          "bano 1": 50, "bano": 50, "recamara 1": 60, "recamara 2": 70,
          "bano 2": 80, lavanderia: 90,
        };
        const ZONE_FALLBACK_SORT_ORDER = 500;

        const distinctZoneAreas = new Map<string, string>(); // normalizedName → raw area name
        for (const lineData of linesData) {
          if (!distinctZoneAreas.has(lineData.areaNormalized)) {
            distinctZoneAreas.set(lineData.areaNormalized, lineData.area);
          }
        }

        for (const [normalizedName, areaName] of distinctZoneAreas) {
          await tx.propertyZone.upsert({
            where: { propertyId_normalizedName: { propertyId: property.id, normalizedName } },
            create: {
              tenantId,
              propertyId: property.id,
              name: areaName,
              normalizedName,
              zoneType: PropertyZoneType.OPERATIONAL,
              virtualKind: null,
              sortOrder: ZONE_SORT_ORDER_MAP[normalizedName] ?? ZONE_FALLBACK_SORT_ORDER,
              isActive: true,
            },
            update: {}, // Never overwrite existing zones (name/sortOrder stay as-is)
          });
        }

        // Build zone map for line resolution
        const templateZones = await tx.propertyZone.findMany({
          where: { tenantId, propertyId: property.id, isActive: true },
          select: { id: true, normalizedName: true },
        });
        const zoneIdByNormalizedName = new Map<string, string>(
          templateZones.map((z) => [z.normalizedName, z.id])
        );

        // Resolve propertyZoneId in linesData
        for (const lineData of linesData) {
          lineData.propertyZoneId = zoneIdByNormalizedName.get(lineData.areaNormalized) ?? null;
          if (!lineData.propertyZoneId) {
            console.warn(
              `[applyInventoryTemplateToProperty] No zone for areaNormalized="${lineData.areaNormalized}" — propertyZoneId will be null`
            );
          }
        }

        // 4.3. Crear InventoryLine con createMany + chunking
        // Construir array de líneas usando itemId map y deduplicar por constraint único
        // Constraint único: propertyId + areaNormalized + itemId + variantKey + variantValueNormalized
        const linesMap = new Map<string, {
          tenantId: string;
          propertyId: string;
          itemId: string;
          propertyZoneId: string | null;
          area: string;
          areaNormalized: string;
          expectedQty: number;
          condition: InventoryCondition;
          priority: InventoryPriority;
          brand: string | null;
          model: string | null;
          serialNumber: string | null;
          color: string | null;
          size: string | null;
          notes: string | null;
          variantKey: string | null;
          variantValue: string | null;
          variantValueNormalized: string | null;
          isActive: boolean;
        }>();

        for (const lineData of linesData) {
          const itemId = itemIdMap.get(lineData.itemKey);
          if (!itemId) {
            throw new Error(
              `Item no encontrado para key "${lineData.itemKey}". Esto no debería ocurrir.`
            );
          }

          // Construir key del constraint único para deduplicar
          // Manejar null correctamente: en SQL, null != null en constraints únicos
          // Usar '<null>' como marcador para distinguir null de string vacío
          const variantKeyStr = lineData.variantKey === null ? '<null>' : (lineData.variantKey || '');
          const variantValueNormalizedStr = lineData.variantValueNormalized === null ? '<null>' : (lineData.variantValueNormalized || '');
          const uniqueKey = `${property.id}::${lineData.areaNormalized}::${itemId}::${variantKeyStr}::${variantValueNormalizedStr}`;

          // Si ya existe una línea con esta key, usar la que tenga mayor expectedQty (o la primera)
          if (!linesMap.has(uniqueKey)) {
            linesMap.set(uniqueKey, {
              tenantId: tenantId,
              propertyId: property.id,
              itemId,
              propertyZoneId: lineData.propertyZoneId,
              area: lineData.area,
              areaNormalized: lineData.areaNormalized,
              expectedQty: lineData.expectedQty,
              condition: lineData.condition,
              priority: lineData.priority,
              brand: lineData.brand,
              model: lineData.model,
              serialNumber: lineData.serialNumber,
              color: lineData.color,
              size: lineData.size,
              notes: lineData.notes,
              variantKey: lineData.variantKey,
              variantValue: lineData.variantValue,
              variantValueNormalized: lineData.variantValueNormalized,
              isActive: true,
            });
          } else {
            // Si existe duplicado, usar el mayor expectedQty (o sumar, según lógica de negocio)
            const existing = linesMap.get(uniqueKey)!;
            if (lineData.expectedQty > existing.expectedQty) {
              existing.expectedQty = lineData.expectedQty;
            }
            // También actualizar otros campos si son más específicos (opcional)
            if (lineData.notes && !existing.notes) {
              existing.notes = lineData.notes;
            }
          }
        }

        const linesToCreate = Array.from(linesMap.values());

        // 4.1.6. Backfill: vincular items con VariantGroups (bed_size, material, use)
        // Auto-allowlist para "material": filtrar opciones visibles por item según plantilla
        const canonicalGroupKeys = ["bed_size", "material", "use"];
        const variantGroups = await tx.variantGroup.findMany({
          where: {
            tenantId: tenantId,
            key: { in: canonicalGroupKeys },
          },
          select: { id: true, key: true },
        });
        const groupByKey = new Map(variantGroups.map((g) => [g.key, g.id]));

        // Cargar opciones del grupo material para validar allowlist (evitar N+1)
        const materialGroupId = groupByKey.get("material");
        let materialOptionsSet = new Set<string>();
        if (materialGroupId) {
          const materialOptions = await tx.variantOption.findMany({
            where: { groupId: materialGroupId },
            select: { valueNormalized: true },
          });
          materialOptionsSet = new Set(materialOptions.map((o) => o.valueNormalized));
        }

        for (const itemData of catalogItemsArray) {
          const key = itemData.defaultVariantKey;
          if (!key || !canonicalGroupKeys.includes(key)) continue;

          const itemId = itemIdMap.get(itemData.nameNormalized);
          if (!itemId) continue;

          const groupId = groupByKey.get(key);
          if (!groupId) continue;

          // Auto-allowlist para material: defaultVariantOptions de la plantilla
          let optionAllowlist: string[] | null = null;
          if (
            key === "material" &&
            itemData.defaultVariantOptions &&
            Array.isArray(itemData.defaultVariantOptions) &&
            itemData.defaultVariantOptions.length > 0
          ) {
            const allowlistNormalized = [
              ...new Set(
                (itemData.defaultVariantOptions as string[]).map((o) =>
                  normalizeVariantValue(String(o))
                )
              ),
            ];
            const validated = allowlistNormalized.filter((v) =>
              materialOptionsSet.has(v)
            );
            if (validated.length > 0) {
              optionAllowlist = validated;
            }
          }

          const existingLink = await tx.inventoryItemVariantGroup.findUnique({
            where: {
              itemId_groupId: { itemId, groupId },
            },
            select: { id: true, optionAllowlist: true },
          });

          if (!existingLink) {
            await tx.inventoryItemVariantGroup.create({
              data: {
                itemId,
                groupId,
                required: false,
                isActive: true,
                sortOrder: 0,
                ...(optionAllowlist ? { optionAllowlist: optionAllowlist as object } : {}),
              },
            });
          } else {
            // MVP: solo setear optionAllowlist si está null (no pisar config futura)
            const shouldSetAllowlist =
              optionAllowlist &&
              (existingLink.optionAllowlist === null ||
                (Array.isArray(existingLink.optionAllowlist) &&
                  existingLink.optionAllowlist.length === 0));
            await tx.inventoryItemVariantGroup.update({
              where: { id: existingLink.id },
              data: {
                isActive: true,
                ...(shouldSetAllowlist
                  ? { optionAllowlist: optionAllowlist as object }
                  : {}),
              },
            });
          }
        }

        // Insertar con createMany + chunking (200 por chunk)
        const CHUNK_SIZE = 200;
        let createdLocal = 0;

        for (let i = 0; i < linesToCreate.length; i += CHUNK_SIZE) {
          const chunk = linesToCreate.slice(i, i + CHUNK_SIZE);
          const result = await tx.inventoryLine.createMany({
            data: chunk,
            skipDuplicates: true, // Respaldo adicional: evita errores si hay duplicados dentro del chunk
          });
          createdLocal += result.count;
        }

        // Retornar contador solo si la transacción completa exitosamente
        return createdLocal;
      },
      {
        timeout: 20000, // 20 segundos (ajustable a 30000 si sigue alto)
        maxWait: 20000,
      }
    );
  } catch (error: any) {
    console.error(
      "[applyInventoryTemplateToProperty] Error en transacción (rollback total):",
      error
    );
    // Lanzar error para que el frontend lo maneje
    // No retornar errores parciales; si falla, rollback total
    throw new Error(
      `Error al aplicar plantilla: ${error?.message || "Error desconocido"}. No se realizaron cambios en el inventario.`
    );
  }

  // 4. Revalidar path (solo si la transacción completó exitosamente)
  revalidatePath(`/host/properties/${propertyId}/inventory`);

  // Retornar éxito (errors siempre [] en éxito; en fallo se lanza error)
  return { created, errors: [] };
}

