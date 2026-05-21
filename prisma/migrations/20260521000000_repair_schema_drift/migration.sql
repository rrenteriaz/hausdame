-- CreateEnum
CREATE TYPE "TaskTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "TaskScheduleFrequency" AS ENUM ('PER_CHECKOUT', 'DAILY', 'WEEKLY', 'MONTHLY', 'MANUAL', 'INTERVAL');

-- CreateEnum
CREATE TYPE "TaskSectionType" AS ENUM ('INFORMATIVE', 'STANDARD', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaskJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskJobSectionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'CONFIRMED', 'DEFERRED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TaskJobStepStatus" AS ENUM ('PENDING', 'RESPONDED', 'DEFERRED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TaskCarryForwardStatus" AS ENUM ('OPEN', 'INJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TaskCarryForwardPolicy" AS ENUM ('UNLIMITED', 'LIMITED');

-- CreateEnum
CREATE TYPE "TaskAssetSyncStatus" AS ENUM ('LOCAL_PENDING', 'UPLOADING', 'UPLOADED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskEventLogType" AS ENUM ('CREATED', 'STARTED', 'STEP_RESPONDED', 'STEP_RESOLVED_LEGACY', 'SECTION_CONFIRMED', 'DEFERRED', 'COMPLETED', 'FORCE_COMPLETED', 'CARRY_FORWARD_CREATED', 'CARRY_FORWARD_INJECTED');

-- CreateEnum
CREATE TYPE "TaskRecurringDueStatus" AS ENUM ('PENDING_ASSIGNMENT', 'ASSIGNED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CLEANING_ASSIGNED', 'CLEANING_STARTED', 'CLEANING_COMPLETED', 'CLEANING_REQUIRES_ATTENTION', 'TASK_DUE', 'TASK_COMPLETED', 'SYSTEM');

-- AlterEnum
ALTER TYPE "InventoryReportResolution" ADD VALUE 'DEEP_CLEAN';

-- DropIndex
DROP INDEX "InventoryLine_propertyId_areaNormalized_itemId_variantKey_v_key";

-- AlterTable
ALTER TABLE "InventoryLine" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplateSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "frequency" "TaskScheduleFrequency" NOT NULL DEFAULT 'MANUAL',
    "carryForwardPolicy" "TaskCarryForwardPolicy" NOT NULL DEFAULT 'LIMITED',
    "maxCarryForwardAttempts" INTEGER NOT NULL DEFAULT 2,
    "anchorDayOfWeek" INTEGER,
    "anchorDayOfMonth" INTEGER,
    "timezone" TEXT,

    CONSTRAINT "TaskTemplateSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSectionTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sectionType" "TaskSectionType" NOT NULL DEFAULT 'STANDARD',
    "order" INTEGER NOT NULL DEFAULT 0,
    "requiresGlobalConfirm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSectionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSectionReferenceAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskSectionReferenceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStepTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "blocksCompletion" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "numberMin" DECIMAL(12,2),
    "numberMax" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stepFrequency" "TaskScheduleFrequency",
    "stepAnchorDayOfWeek" INTEGER,
    "stepAnchorDayOfMonth" INTEGER,
    "intervalDays" INTEGER,
    "startDate" TIMESTAMP(3),
    "capturesNumber" BOOLEAN NOT NULL DEFAULT false,
    "capturesPhoto" BOOLEAN NOT NULL DEFAULT false,
    "capturesText" BOOLEAN NOT NULL DEFAULT false,
    "capturesYesNo" BOOLEAN NOT NULL DEFAULT false,
    "numberRequired" BOOLEAN NOT NULL DEFAULT false,
    "photoRequired" BOOLEAN NOT NULL DEFAULT false,
    "textRequired" BOOLEAN NOT NULL DEFAULT false,
    "yesNoRequired" BOOLEAN NOT NULL DEFAULT false,
    "captureVersion" TEXT NOT NULL DEFAULT 'LEGACY_V1',

    CONSTRAINT "TaskStepTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStepOption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaskStepOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStepReferenceAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStepReferenceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "cleaningId" TEXT,
    "assignedUserId" TEXT,
    "status" "TaskJobStatus" NOT NULL DEFAULT 'PENDING',
    "occurrenceKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deferredAt" TIMESTAMP(3),
    "deferredReason" TEXT,
    "templateNameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskJobSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "templateSectionId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "sectionTypeSnapshot" "TaskSectionType" NOT NULL,
    "requiresGlobalConfirmSnapshot" BOOLEAN NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "TaskJobSectionStatus" NOT NULL DEFAULT 'PENDING',
    "isCarryForwardInjected" BOOLEAN NOT NULL DEFAULT false,
    "carryForwardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskJobSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskJobSectionResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskJobSectionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskJobSectionEvidenceAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "assetId" TEXT,
    "syncStatus" "TaskAssetSyncStatus" NOT NULL DEFAULT 'LOCAL_PENDING',
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskJobSectionEvidenceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskJobStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "templateStepId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT,
    "isRequiredSnapshot" BOOLEAN NOT NULL,
    "blocksCompletionSnapshot" BOOLEAN NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "TaskJobStepStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "capturesNumberSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "capturesPhotoSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "capturesTextSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "capturesYesNoSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "numberRequiredSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "photoRequiredSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "textRequiredSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "yesNoRequiredSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "snapshotVersion" TEXT NOT NULL DEFAULT 'LEGACY_V1',

    CONSTRAINT "TaskJobStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskJobStepResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL,
    "confirmed" BOOLEAN,
    "boolValue" BOOLEAN,
    "numberValue" DECIMAL(12,2),
    "textValue" TEXT,
    "notes" TEXT,
    "notCompletedReasonCode" "NotCompletedReasonCode",
    "notCompletedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskJobStepResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskJobStepEvidenceAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "assetId" TEXT,
    "syncStatus" "TaskAssetSyncStatus" NOT NULL DEFAULT 'LOCAL_PENDING',
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskJobStepEvidenceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCarryForward" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "sourceJobId" TEXT NOT NULL,
    "status" "TaskCarryForwardStatus" NOT NULL DEFAULT 'OPEN',
    "policy" "TaskCarryForwardPolicy" NOT NULL DEFAULT 'LIMITED',
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "currentAttempt" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "contextSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCarryForward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskJobEventLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "eventType" "TaskEventLogType" NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskJobEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskRecurringDue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "frequency" "TaskScheduleFrequency" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "stepId" TEXT,
    "status" "TaskRecurringDueStatus" NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
    "assignedCleaningId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRecurringDue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskTemplate_tenantId_propertyId_status_idx" ON "TaskTemplate"("tenantId", "propertyId", "status");

-- CreateIndex
CREATE INDEX "TaskTemplate_tenantId_idx" ON "TaskTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplateSchedule_templateId_key" ON "TaskTemplateSchedule"("templateId");

-- CreateIndex
CREATE INDEX "TaskTemplateSchedule_tenantId_idx" ON "TaskTemplateSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "TaskSectionTemplate_tenantId_idx" ON "TaskSectionTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "TaskSectionTemplate_templateId_idx" ON "TaskSectionTemplate"("templateId");

-- CreateIndex
CREATE INDEX "TaskSectionReferenceAsset_tenantId_idx" ON "TaskSectionReferenceAsset"("tenantId");

-- CreateIndex
CREATE INDEX "TaskSectionReferenceAsset_sectionId_idx" ON "TaskSectionReferenceAsset"("sectionId");

-- CreateIndex
CREATE INDEX "TaskStepTemplate_tenantId_idx" ON "TaskStepTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "TaskStepTemplate_sectionId_idx" ON "TaskStepTemplate"("sectionId");

-- CreateIndex
CREATE INDEX "TaskStepOption_tenantId_idx" ON "TaskStepOption"("tenantId");

-- CreateIndex
CREATE INDEX "TaskStepOption_stepId_idx" ON "TaskStepOption"("stepId");

-- CreateIndex
CREATE INDEX "TaskStepReferenceAsset_tenantId_idx" ON "TaskStepReferenceAsset"("tenantId");

-- CreateIndex
CREATE INDEX "TaskStepReferenceAsset_stepId_idx" ON "TaskStepReferenceAsset"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskStepReferenceAsset_tenantId_stepId_order_key" ON "TaskStepReferenceAsset"("tenantId", "stepId", "order");

-- CreateIndex
CREATE INDEX "TaskJob_tenantId_propertyId_status_idx" ON "TaskJob"("tenantId", "propertyId", "status");

-- CreateIndex
CREATE INDEX "TaskJob_tenantId_idx" ON "TaskJob"("tenantId");

-- CreateIndex
CREATE INDEX "TaskJob_propertyId_idx" ON "TaskJob"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskJob_tenantId_occurrenceKey_key" ON "TaskJob"("tenantId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "TaskJobSection_tenantId_idx" ON "TaskJobSection"("tenantId");

-- CreateIndex
CREATE INDEX "TaskJobSection_jobId_idx" ON "TaskJobSection"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskJobSectionResponse_sectionId_key" ON "TaskJobSectionResponse"("sectionId");

-- CreateIndex
CREATE INDEX "TaskJobSectionResponse_tenantId_idx" ON "TaskJobSectionResponse"("tenantId");

-- CreateIndex
CREATE INDEX "TaskJobSectionEvidenceAsset_tenantId_idx" ON "TaskJobSectionEvidenceAsset"("tenantId");

-- CreateIndex
CREATE INDEX "TaskJobSectionEvidenceAsset_sectionId_idx" ON "TaskJobSectionEvidenceAsset"("sectionId");

-- CreateIndex
CREATE INDEX "TaskJobStep_tenantId_idx" ON "TaskJobStep"("tenantId");

-- CreateIndex
CREATE INDEX "TaskJobStep_sectionId_idx" ON "TaskJobStep"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskJobStepResponse_stepId_key" ON "TaskJobStepResponse"("stepId");

-- CreateIndex
CREATE INDEX "TaskJobStepResponse_tenantId_idx" ON "TaskJobStepResponse"("tenantId");

-- CreateIndex
CREATE INDEX "TaskJobStepEvidenceAsset_tenantId_idx" ON "TaskJobStepEvidenceAsset"("tenantId");

-- CreateIndex
CREATE INDEX "TaskJobStepEvidenceAsset_stepId_idx" ON "TaskJobStepEvidenceAsset"("stepId");

-- CreateIndex
CREATE INDEX "TaskCarryForward_tenantId_propertyId_status_idx" ON "TaskCarryForward"("tenantId", "propertyId", "status");

-- CreateIndex
CREATE INDEX "TaskCarryForward_tenantId_idx" ON "TaskCarryForward"("tenantId");

-- CreateIndex
CREATE INDEX "TaskJobEventLog_tenantId_idx" ON "TaskJobEventLog"("tenantId");

-- CreateIndex
CREATE INDEX "TaskJobEventLog_jobId_idx" ON "TaskJobEventLog"("jobId");

-- CreateIndex
CREATE INDEX "TaskRecurringDue_tenantId_propertyId_status_idx" ON "TaskRecurringDue"("tenantId", "propertyId", "status");

-- CreateIndex
CREATE INDEX "TaskRecurringDue_tenantId_status_idx" ON "TaskRecurringDue"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TaskRecurringDue_tenantId_idx" ON "TaskRecurringDue"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRecurringDue_tenantId_templateId_periodKey_key" ON "TaskRecurringDue"("tenantId", "templateId", "periodKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_revokedAt_idx" ON "PushSubscription"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLine_propertyId_areaNormalized_itemId_variantKey_v_key" ON "InventoryLine"("propertyId", "areaNormalized", "itemId", "variantKey", "variantValueNormalized", "version");

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplateSchedule" ADD CONSTRAINT "TaskTemplateSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplateSchedule" ADD CONSTRAINT "TaskTemplateSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSectionTemplate" ADD CONSTRAINT "TaskSectionTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSectionTemplate" ADD CONSTRAINT "TaskSectionTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSectionReferenceAsset" ADD CONSTRAINT "TaskSectionReferenceAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSectionReferenceAsset" ADD CONSTRAINT "TaskSectionReferenceAsset_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TaskSectionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSectionReferenceAsset" ADD CONSTRAINT "TaskSectionReferenceAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStepTemplate" ADD CONSTRAINT "TaskStepTemplate_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TaskSectionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStepTemplate" ADD CONSTRAINT "TaskStepTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStepOption" ADD CONSTRAINT "TaskStepOption_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "TaskStepTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStepOption" ADD CONSTRAINT "TaskStepOption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStepReferenceAsset" ADD CONSTRAINT "TaskStepReferenceAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStepReferenceAsset" ADD CONSTRAINT "TaskStepReferenceAsset_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "TaskStepTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStepReferenceAsset" ADD CONSTRAINT "TaskStepReferenceAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJob" ADD CONSTRAINT "TaskJob_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJob" ADD CONSTRAINT "TaskJob_cleaningId_fkey" FOREIGN KEY ("cleaningId") REFERENCES "Cleaning"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJob" ADD CONSTRAINT "TaskJob_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJob" ADD CONSTRAINT "TaskJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJob" ADD CONSTRAINT "TaskJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobSection" ADD CONSTRAINT "TaskJobSection_carryForwardId_fkey" FOREIGN KEY ("carryForwardId") REFERENCES "TaskCarryForward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobSection" ADD CONSTRAINT "TaskJobSection_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TaskJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobSection" ADD CONSTRAINT "TaskJobSection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobSectionResponse" ADD CONSTRAINT "TaskJobSectionResponse_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TaskJobSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobSectionResponse" ADD CONSTRAINT "TaskJobSectionResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobSectionEvidenceAsset" ADD CONSTRAINT "TaskJobSectionEvidenceAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobSectionEvidenceAsset" ADD CONSTRAINT "TaskJobSectionEvidenceAsset_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TaskJobSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobSectionEvidenceAsset" ADD CONSTRAINT "TaskJobSectionEvidenceAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobStep" ADD CONSTRAINT "TaskJobStep_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TaskJobSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobStep" ADD CONSTRAINT "TaskJobStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobStepResponse" ADD CONSTRAINT "TaskJobStepResponse_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "TaskJobStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobStepResponse" ADD CONSTRAINT "TaskJobStepResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobStepEvidenceAsset" ADD CONSTRAINT "TaskJobStepEvidenceAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobStepEvidenceAsset" ADD CONSTRAINT "TaskJobStepEvidenceAsset_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "TaskJobStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobStepEvidenceAsset" ADD CONSTRAINT "TaskJobStepEvidenceAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCarryForward" ADD CONSTRAINT "TaskCarryForward_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCarryForward" ADD CONSTRAINT "TaskCarryForward_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "TaskJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCarryForward" ADD CONSTRAINT "TaskCarryForward_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobEventLog" ADD CONSTRAINT "TaskJobEventLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobEventLog" ADD CONSTRAINT "TaskJobEventLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TaskJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskJobEventLog" ADD CONSTRAINT "TaskJobEventLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurringDue" ADD CONSTRAINT "TaskRecurringDue_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurringDue" ADD CONSTRAINT "TaskRecurringDue_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurringDue" ADD CONSTRAINT "TaskRecurringDue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurringDue" ADD CONSTRAINT "TaskRecurringDue_assignedCleaningId_fkey" FOREIGN KEY ("assignedCleaningId") REFERENCES "Cleaning"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurringDue" ADD CONSTRAINT "TaskRecurringDue_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "TaskStepTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
