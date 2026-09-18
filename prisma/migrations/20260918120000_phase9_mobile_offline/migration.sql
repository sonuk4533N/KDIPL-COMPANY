CREATE TYPE "OfflineDraftType" AS ENUM (
  'MATERIAL_REQUIREMENT',
  'SITE_MATERIAL_ISSUE_REQUEST',
  'DIRECT_SITE_GRN',
  'SITE_RECEIPT_ACKNOWLEDGMENT',
  'DAMAGED_REJECTED_REPORT',
  'TRANSFER_RECEIPT',
  'UNUSED_MATERIAL_RETURN',
  'DAMAGE_LOSS_REPORT',
  'PHYSICAL_STOCK_COUNT'
);

CREATE TYPE "OfflineSyncStatus" AS ENUM (
  'LOCAL_DRAFT', 'QUEUED', 'SYNCING', 'SYNCED', 'CONFLICT', 'FAILED',
  'RETRY_QUEUED', 'USER_ACTION_REQUIRED', 'DISCARDED'
);

CREATE TYPE "OfflineUploadStatus" AS ENUM (
  'QUEUED', 'UPLOADING', 'UPLOADED', 'SCANNING', 'CLEAN',
  'QUARANTINED', 'FAILED', 'CANCELLED'
);

CREATE TABLE "DeviceDraftSubmission" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "employeeId" UUID,
  "localDraftId" UUID NOT NULL,
  "draftType" "OfflineDraftType" NOT NULL,
  "projectId" UUID,
  "siteId" UUID,
  "schemaVersion" INTEGER NOT NULL,
  "referenceVersion" VARCHAR(80) NOT NULL,
  "lastKnownServerVersion" INTEGER,
  "payload" JSONB NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "status" "OfflineSyncStatus" NOT NULL DEFAULT 'SYNCING',
  "deviceCapturedAt" TIMESTAMP(3) NOT NULL,
  "correlationId" UUID NOT NULL,
  "failureCode" VARCHAR(80),
  "failureReason" VARCHAR(1000),
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceDraftSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceDraftSubmission_idempotencyKey_key" ON "DeviceDraftSubmission"("idempotencyKey");
CREATE UNIQUE INDEX "DeviceDraftSubmission_correlationId_key" ON "DeviceDraftSubmission"("correlationId");
CREATE UNIQUE INDEX "DeviceDraftSubmission_userId_localDraftId_key" ON "DeviceDraftSubmission"("userId", "localDraftId");
CREATE INDEX "DeviceDraftSubmission_userId_status_createdAt_idx" ON "DeviceDraftSubmission"("userId", "status", "createdAt");
CREATE INDEX "DeviceDraftSubmission_projectId_siteId_draftType_idx" ON "DeviceDraftSubmission"("projectId", "siteId", "draftType");

CREATE TABLE "OfflineSyncAuditEvent" (
  "id" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "fromStatus" "OfflineSyncStatus",
  "toStatus" "OfflineSyncStatus" NOT NULL,
  "reasonCode" VARCHAR(80),
  "safeMetadata" JSONB,
  "correlationId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineSyncAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfflineSyncAuditEvent_submissionId_createdAt_idx" ON "OfflineSyncAuditEvent"("submissionId", "createdAt");
CREATE INDEX "OfflineSyncAuditEvent_actorUserId_createdAt_idx" ON "OfflineSyncAuditEvent"("actorUserId", "createdAt");
CREATE INDEX "OfflineSyncAuditEvent_correlationId_idx" ON "OfflineSyncAuditEvent"("correlationId");

CREATE TABLE "AttachmentUploadSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "localDraftId" UUID NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(160) NOT NULL,
  "size" BIGINT NOT NULL,
  "checksum" CHAR(64) NOT NULL,
  "documentType" VARCHAR(80) NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "status" "OfflineUploadStatus" NOT NULL DEFAULT 'QUEUED',
  "uploadedBytes" BIGINT NOT NULL DEFAULT 0,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "fileRecordId" UUID,
  "failureReason" VARCHAR(1000),
  "correlationId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttachmentUploadSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttachmentUploadSession_idempotencyKey_key" ON "AttachmentUploadSession"("idempotencyKey");
CREATE UNIQUE INDEX "AttachmentUploadSession_fileRecordId_key" ON "AttachmentUploadSession"("fileRecordId");
CREATE UNIQUE INDEX "AttachmentUploadSession_userId_localDraftId_checksum_key" ON "AttachmentUploadSession"("userId", "localDraftId", "checksum");
CREATE INDEX "AttachmentUploadSession_userId_status_createdAt_idx" ON "AttachmentUploadSession"("userId", "status", "createdAt");
CREATE INDEX "AttachmentUploadSession_expiresAt_idx" ON "AttachmentUploadSession"("expiresAt");
CREATE INDEX "AttachmentUploadSession_correlationId_idx" ON "AttachmentUploadSession"("correlationId");

CREATE TABLE "MobileTelemetryEvent" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "eventType" VARCHAR(80) NOT NULL,
  "draftType" "OfflineDraftType",
  "outcome" VARCHAR(40) NOT NULL,
  "retryCount" INTEGER,
  "durationMs" INTEGER,
  "correlationId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileTelemetryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MobileTelemetryEvent_eventType_createdAt_idx" ON "MobileTelemetryEvent"("eventType", "createdAt");
CREATE INDEX "MobileTelemetryEvent_userId_createdAt_idx" ON "MobileTelemetryEvent"("userId", "createdAt");
CREATE INDEX "MobileTelemetryEvent_correlationId_idx" ON "MobileTelemetryEvent"("correlationId");
