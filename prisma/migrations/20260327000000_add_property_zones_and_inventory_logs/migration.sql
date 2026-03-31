-- Fase 1: Extensión de schema para soporte de Zonas Físicas en Inventario
-- Cambios: PropertyZone, InventoryLog, relación opcional InventoryLine → PropertyZone
-- Compatible hacia atrás: todos los cambios son aditivos (nuevas tablas, columna nullable)
-- NO modifica ni elimina ningún campo existente

-- CreateEnum
CREATE TYPE "PropertyZoneType" AS ENUM ('OPERATIONAL', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "PropertyZoneVirtualKind" AS ENUM ('STORAGE', 'DAMAGED');

-- CreateEnum
CREATE TYPE "InventoryLogType" AS ENUM ('MOVE', 'ADJUST', 'CREATE', 'DELETE', 'DAMAGE', 'RESTORE');

-- AlterTable: agregar columna nullable (no breaking)
ALTER TABLE "InventoryLine" ADD COLUMN "propertyZoneId" TEXT;

-- CreateTable
CREATE TABLE "PropertyZone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "zoneType" "PropertyZoneType" NOT NULL,
    "virtualKind" "PropertyZoneVirtualKind",
    "sortOrder" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "inventoryLineId" TEXT,
    "propertyZoneId" TEXT,
    "type" "InventoryLogType" NOT NULL,
    "quantity" INTEGER,
    "fromZoneId" TEXT,
    "toZoneId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyZone_tenantId_propertyId_idx" ON "PropertyZone"("tenantId", "propertyId");

-- CreateIndex
CREATE INDEX "PropertyZone_propertyId_normalizedName_idx" ON "PropertyZone"("propertyId", "normalizedName");

-- CreateIndex
CREATE INDEX "PropertyZone_propertyId_zoneType_idx" ON "PropertyZone"("propertyId", "zoneType");

-- CreateIndex
CREATE INDEX "PropertyZone_propertyId_isActive_idx" ON "PropertyZone"("propertyId", "isActive");

-- CreateIndex (unique: garantiza no-duplicados en backfill y upserts)
CREATE UNIQUE INDEX "PropertyZone_propertyId_normalizedName_key" ON "PropertyZone"("propertyId", "normalizedName");

-- CreateIndex
CREATE INDEX "InventoryLog_tenantId_propertyId_idx" ON "InventoryLog"("tenantId", "propertyId");

-- CreateIndex
CREATE INDEX "InventoryLog_inventoryLineId_idx" ON "InventoryLog"("inventoryLineId");

-- CreateIndex
CREATE INDEX "InventoryLog_propertyZoneId_idx" ON "InventoryLog"("propertyZoneId");

-- CreateIndex
CREATE INDEX "InventoryLog_type_idx" ON "InventoryLog"("type");

-- CreateIndex
CREATE INDEX "InventoryLog_propertyId_createdAt_idx" ON "InventoryLog"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryLine_propertyZoneId_idx" ON "InventoryLine"("propertyZoneId");

-- AddForeignKey
ALTER TABLE "InventoryLine" ADD CONSTRAINT "InventoryLine_propertyZoneId_fkey" FOREIGN KEY ("propertyZoneId") REFERENCES "PropertyZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyZone" ADD CONSTRAINT "PropertyZone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyZone" ADD CONSTRAINT "PropertyZone_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_inventoryLineId_fkey" FOREIGN KEY ("inventoryLineId") REFERENCES "InventoryLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_propertyZoneId_fkey" FOREIGN KEY ("propertyZoneId") REFERENCES "PropertyZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
