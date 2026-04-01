-- Phase 12: Add operationalCategory to PropertyZone

-- CreateEnum
CREATE TYPE "PropertyZoneOperationalCategory" AS ENUM ('BEDROOM', 'BATHROOM', 'KITCHEN', 'SOCIAL', 'DINING', 'ENTRY', 'LAUNDRY', 'OUTDOOR', 'STORAGE', 'OTHER');

-- AlterTable (nullable — fully backward-compatible, no existing data broken)
ALTER TABLE "PropertyZone" ADD COLUMN "operationalCategory" "PropertyZoneOperationalCategory";
