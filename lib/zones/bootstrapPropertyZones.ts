/**
 * Bootstrap de zonas canónicas por propiedad.
 * Crea o reactiva zonas OPERATIONAL base y zonas VIRTUAL (Almacén, Dañados/Baja).
 * Idempotente: solo actúa sobre lo que falta o está inactivo.
 *
 * Regla por zona canónica:
 *   - activa con ese normalizedName → no hacer nada
 *   - inactiva con ese normalizedName → reactivar + restaurar campos canónicos
 *   - no existe → crear
 *
 * Se usa en:
 * - createProperty (nuevas propiedades)
 * - getPropertyZones (wizard / modal de agregar ítem)
 * - Primer acceso al inventario (fallback para propiedades existentes)
 */

import prisma from "@/lib/prisma";
import { normalizeName } from "@/lib/inventory-normalize";
import { PropertyZoneType, PropertyZoneVirtualKind } from "@/lib/generated/prisma";
import type { Prisma } from "@/lib/generated/prisma";

const CANONICAL_OPERATIONAL_ZONES = [
  { name: "Entrada",    sortOrder: 10 },
  { name: "Sala",       sortOrder: 20 },
  { name: "Comedor",    sortOrder: 30 },
  { name: "Cocina",     sortOrder: 40 },
  { name: "Baño 1",     sortOrder: 50 },
  { name: "Recámara 1", sortOrder: 60 },
] as const;

const CANONICAL_VIRTUAL_ZONES = [
  {
    name: "Almacén",
    normalizedName: "almacen",
    virtualKind: PropertyZoneVirtualKind.STORAGE,
    sortOrder: 100,
  },
  {
    name: "Dañados / Baja",
    normalizedName: "danados / baja",
    virtualKind: PropertyZoneVirtualKind.DAMAGED,
    sortOrder: 110,
  },
] as const;

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * opts.reactivate (default: true):
 *   true  → reactiva zonas canónicas soft-deleted (para el picker de zonas: siempre muestra opciones)
 *   false → solo crea zonas que nunca han existido; respeta eliminaciones manuales del usuario
 *           (usado en la página de inventario para no deshacer borrados intencionales)
 */
export async function bootstrapPropertyZones(
  tenantId: string,
  propertyId: string,
  db?: DbClient,
  opts?: { reactivate?: boolean }
): Promise<{ operationalCreated: number; virtualCreated: number }> {
  const client = db ?? prisma;
  const reactivate = opts?.reactivate !== false; // default true
  let operationalCreated = 0;
  let virtualCreated = 0;

  // Zonas virtuales (STORAGE + DAMAGED)
  for (const zone of CANONICAL_VIRTUAL_ZONES) {
    const existing = await client.propertyZone.findFirst({
      where: { propertyId, normalizedName: zone.normalizedName },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      await client.propertyZone.create({
        data: {
          tenantId,
          propertyId,
          name: zone.name,
          normalizedName: zone.normalizedName,
          zoneType: PropertyZoneType.VIRTUAL,
          virtualKind: zone.virtualKind,
          sortOrder: zone.sortOrder,
          isActive: true,
        },
      });
      virtualCreated++;
    } else if (!existing.isActive && reactivate) {
      // Reactivar zona virtual canónica soft-deleted (solo cuando reactivate=true)
      await client.propertyZone.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          name: zone.name,
          zoneType: PropertyZoneType.VIRTUAL,
          virtualKind: zone.virtualKind,
          sortOrder: zone.sortOrder,
        },
      });
      virtualCreated++;
    }
  }

  // Zonas operacionales base
  for (const zone of CANONICAL_OPERATIONAL_ZONES) {
    const normalized = normalizeName(zone.name);
    const existing = await client.propertyZone.findFirst({
      where: { propertyId, normalizedName: normalized },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      await client.propertyZone.create({
        data: {
          tenantId,
          propertyId,
          name: zone.name,
          normalizedName: normalized,
          zoneType: PropertyZoneType.OPERATIONAL,
          sortOrder: zone.sortOrder,
          isActive: true,
        },
      });
      operationalCreated++;
    } else if (!existing.isActive && reactivate) {
      // Reactivar zona operacional canónica soft-deleted (solo cuando reactivate=true)
      await client.propertyZone.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          name: zone.name,
          zoneType: PropertyZoneType.OPERATIONAL,
          sortOrder: zone.sortOrder,
        },
      });
      operationalCreated++;
    }
    // Si existe y está activa → no hacer nada
  }

  return { operationalCreated, virtualCreated };
}
