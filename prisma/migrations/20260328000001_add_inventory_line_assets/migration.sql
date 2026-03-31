-- CreateTable
CREATE TABLE "InventoryLineAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLineAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLineAsset_tenantId_lineId_position_key" ON "InventoryLineAsset"("tenantId", "lineId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLineAsset_tenantId_lineId_assetId_key" ON "InventoryLineAsset"("tenantId", "lineId", "assetId");

-- CreateIndex
CREATE INDEX "InventoryLineAsset_tenantId_lineId_idx" ON "InventoryLineAsset"("tenantId", "lineId");

-- CreateIndex
CREATE INDEX "InventoryLineAsset_tenantId_assetId_idx" ON "InventoryLineAsset"("tenantId", "assetId");

-- AddForeignKey
ALTER TABLE "InventoryLineAsset" ADD CONSTRAINT "InventoryLineAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLineAsset" ADD CONSTRAINT "InventoryLineAsset_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "InventoryLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLineAsset" ADD CONSTRAINT "InventoryLineAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
