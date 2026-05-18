-- Add columns expected by the current Prisma schema for cleaning checklist snapshots.
ALTER TABLE "CleaningChecklistItem"
  ADD COLUMN IF NOT EXISTS "isRemovedFromTemplate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "propertyChecklistItemId" TEXT;

CREATE INDEX IF NOT EXISTS "CleaningChecklistItem_propertyChecklistItemId_idx"
  ON "CleaningChecklistItem"("propertyChecklistItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CleaningChecklistItem_propertyChecklistItemId_fkey'
      AND conrelid = '"CleaningChecklistItem"'::regclass
  ) THEN
    ALTER TABLE "CleaningChecklistItem"
      ADD CONSTRAINT "CleaningChecklistItem_propertyChecklistItemId_fkey"
      FOREIGN KEY ("propertyChecklistItemId")
      REFERENCES "PropertyChecklistItem"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
