import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { db } from "@/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  OFFLINE_SCHEMA_VERSION,
  offlineDraftTypes,
  validateGpsEvidence,
} from "@/features/offline/offline-domain";
import { AuditService } from "@/server/audit/audit-service";
import {
  canAccessProject,
  canAccessSite,
  requirePermission,
} from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import {
  canUseOfflineOperations,
  getOfflineReferenceSnapshot,
} from "@/server/offline/reference-service";
import type {
  AuthenticatedPrincipal,
  PermissionCode,
} from "@/types/application";

const gpsSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().nonnegative().max(100_000),
  capturedAt: z.iso.datetime(),
  source: z.string().trim().max(80).optional(),
});

export const offlineSyncRequestSchema = z.object({
  localDraftId: z.uuid(),
  draftType: z.enum(offlineDraftTypes),
  schemaVersion: z.number().int().positive(),
  referenceVersion: z.string().min(8).max(80),
  referenceExpiresAt: z.iso.datetime(),
  idempotencyKey: z.string().min(20).max(160),
  projectId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  lastKnownServerVersion: z.number().int().nonnegative().optional(),
  deviceCapturedAt: z.iso.datetime(),
  gps: gpsSchema.optional(),
  attachmentUploadIds: z.array(z.uuid()).max(20).default([]),
  form: z.record(z.string(), z.unknown()),
});

export type OfflineSyncRequest = z.infer<typeof offlineSyncRequestSchema>;

const permissionForDraft: Record<
  OfflineSyncRequest["draftType"],
  PermissionCode
> = {
  MATERIAL_REQUIREMENT: "material_requirement.create",
  SITE_MATERIAL_ISSUE_REQUEST: "inventory.view",
  DIRECT_SITE_GRN: "inventory.receive",
  SITE_RECEIPT_ACKNOWLEDGMENT: "inventory.receive",
  DAMAGED_REJECTED_REPORT: "inventory.receive",
  TRANSFER_RECEIPT: "inventory.receive",
  UNUSED_MATERIAL_RETURN: "inventory.view",
  DAMAGE_LOSS_REPORT: "inventory.view",
  PHYSICAL_STOCK_COUNT: "inventory.view",
};

const rolesForDraft: Record<
  OfflineSyncRequest["draftType"],
  readonly string[]
> = {
  MATERIAL_REQUIREMENT: ["SITE_SUPERVISOR", "PROJECT_MANAGER"],
  SITE_MATERIAL_ISSUE_REQUEST: ["SITE_SUPERVISOR"],
  DIRECT_SITE_GRN: ["STORE_KEEPER"],
  SITE_RECEIPT_ACKNOWLEDGMENT: ["SITE_SUPERVISOR"],
  DAMAGED_REJECTED_REPORT: ["STORE_KEEPER"],
  TRANSFER_RECEIPT: ["STORE_KEEPER"],
  UNUSED_MATERIAL_RETURN: ["SITE_SUPERVISOR"],
  DAMAGE_LOSS_REPORT: ["SITE_SUPERVISOR"],
  PHYSICAL_STOCK_COUNT: ["STORE_KEEPER"],
};

const gpsRequired = new Set<OfflineSyncRequest["draftType"]>([
  "SITE_MATERIAL_ISSUE_REQUEST",
  "DIRECT_SITE_GRN",
  "SITE_RECEIPT_ACKNOWLEDGMENT",
  "UNUSED_MATERIAL_RETURN",
  "DAMAGE_LOSS_REPORT",
]);

const evidenceRequired = new Set<OfflineSyncRequest["draftType"]>([
  "DIRECT_SITE_GRN",
  "SITE_RECEIPT_ACKNOWLEDGMENT",
  "DAMAGED_REJECTED_REPORT",
  "TRANSFER_RECEIPT",
  "UNUSED_MATERIAL_RETURN",
  "DAMAGE_LOSS_REPORT",
  "PHYSICAL_STOCK_COUNT",
]);

export type OfflineConflict = {
  code: string;
  reason: string;
  localValue?: unknown;
  serverValue?: unknown;
  actions: readonly (
    | "REFRESH_REFERENCE_DATA"
    | "REVISE_LOCAL_DRAFT"
    | "DUPLICATE_DRAFT"
    | "DISCARD_LOCAL_DRAFT"
    | "SUBMIT_AFTER_CORRECTION"
  )[];
};

function conflict(
  code: string,
  reason: string,
  localValue?: unknown,
  serverValue?: unknown,
): never {
  throw new OfflineConflictError({
    code,
    reason,
    localValue,
    serverValue,
    actions: [
      "REFRESH_REFERENCE_DATA",
      "REVISE_LOCAL_DRAFT",
      "DUPLICATE_DRAFT",
      "DISCARD_LOCAL_DRAFT",
      "SUBMIT_AFTER_CORRECTION",
    ],
  });
}

export class OfflineConflictError extends Error {
  constructor(readonly conflict: OfflineConflict) {
    super(conflict.reason);
  }
}

function payloadHash(input: OfflineSyncRequest) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function quantityField(
  input: OfflineSyncRequest,
  name: "quantity" | "receivedQuantity" | "damagedQuantity",
  options: { required: boolean; allowZero?: boolean },
) {
  const raw = input.form[name];
  if (raw === undefined || raw === null || raw === "") {
    if (options.required) {
      conflict("QUANTITY_REQUIRED", `${name} is required for this workflow.`);
    }
    return undefined;
  }
  const value = String(raw).trim();
  if (!/^\d{1,15}(\.\d{1,3})?$/.test(value)) {
    conflict("INVALID_QUANTITY", `${name} must be a valid positive quantity.`);
  }
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    (options.allowZero ? number < 0 : number <= 0)
  ) {
    conflict("INVALID_QUANTITY", `${name} is outside the allowed range.`, raw);
  }
  return number;
}

async function validateBusinessPayload(
  input: OfflineSyncRequest,
  reference: Awaited<ReturnType<typeof getOfflineReferenceSnapshot>>,
) {
  const materialRequired = new Set<OfflineSyncRequest["draftType"]>([
    "MATERIAL_REQUIREMENT",
    "SITE_MATERIAL_ISSUE_REQUEST",
    "DAMAGED_REJECTED_REPORT",
    "UNUSED_MATERIAL_RETURN",
    "DAMAGE_LOSS_REPORT",
    "PHYSICAL_STOCK_COUNT",
  ]);
  if (materialRequired.has(input.draftType)) {
    const materialId =
      typeof input.form.materialId === "string" ? input.form.materialId : "";
    if (!reference.materials.some((material) => material.id === materialId)) {
      conflict(
        "MATERIAL_UNAVAILABLE",
        "Select an active material from the current reference data.",
        materialId || null,
      );
    }
  }

  if (input.draftType === "PHYSICAL_STOCK_COUNT") {
    quantityField(input, "quantity", { required: true, allowZero: true });
  } else if (materialRequired.has(input.draftType)) {
    quantityField(input, "quantity", { required: true });
  }

  const referenceId =
    typeof input.form.referenceId === "string"
      ? input.form.referenceId.trim()
      : "";
  if (input.draftType === "DIRECT_SITE_GRN") {
    if (
      !reference.purchaseOrders.some(
        (order) => order.id === referenceId || order.poNumber === referenceId,
      )
    ) {
      conflict(
        "WORKFLOW_STATE_CHANGED",
        "The selected purchase order is no longer open for receiving.",
        referenceId || null,
      );
    }
  }
  if (
    input.draftType === "SITE_RECEIPT_ACKNOWLEDGMENT" ||
    input.draftType === "TRANSFER_RECEIPT"
  ) {
    if (
      !reference.movementReferences.some(
        (movement) =>
          movement.id === referenceId || movement.number === referenceId,
      )
    ) {
      conflict(
        "WORKFLOW_STATE_CHANGED",
        "The selected movement is no longer awaiting receipt.",
        referenceId || null,
      );
    }
  }
  if (
    [
      "DIRECT_SITE_GRN",
      "SITE_RECEIPT_ACKNOWLEDGMENT",
      "TRANSFER_RECEIPT",
    ].includes(input.draftType)
  ) {
    const received = quantityField(input, "receivedQuantity", {
      required: true,
    });
    const damaged = quantityField(input, "damagedQuantity", {
      required: false,
      allowZero: true,
    });
    if (received !== undefined && damaged !== undefined && damaged > received) {
      conflict(
        "INVALID_QUANTITY",
        "Damaged quantity cannot exceed received quantity.",
        damaged,
        received,
      );
    }
  }

  if (
    typeof input.form.remarks === "string" &&
    input.form.remarks.length > 4_000
  ) {
    conflict("INVALID_REMARKS", "Remarks cannot exceed 4,000 characters.");
  }
}

async function validateScope(
  principal: AuthenticatedPrincipal,
  input: OfflineSyncRequest,
) {
  if (!input.projectId && !input.siteId) {
    conflict("SCOPE_REQUIRED", "Select an authorized project or site.");
  }
  const storeKeeper = principal.roleCodes.includes("STORE_KEEPER");
  const storeScopes =
    storeKeeper && principal.employeeId
      ? await db.inventoryLocationAccess.findMany({
          where: {
            employeeId: principal.employeeId,
            isActive: true,
          },
          select: { locationId: true },
        })
      : [];
  const storeProjectAccess =
    storeScopes.length && input.projectId
      ? Boolean(
          await db.inventoryLocation.findFirst({
            where: {
              id: { in: storeScopes.map((scope) => scope.locationId) },
              projectId: input.projectId,
              ...(input.siteId ? { siteId: input.siteId } : {}),
              isActive: true,
            },
            select: { id: true },
          }),
        )
      : false;
  if (
    input.projectId &&
    !storeProjectAccess &&
    !(await canAccessProject(principal, input.projectId))
  ) {
    conflict(
      "ASSIGNMENT_REVOKED",
      "Your project assignment is no longer active.",
      input.projectId,
      null,
    );
  }
  if (
    input.siteId &&
    !storeProjectAccess &&
    !(await canAccessSite(principal, input.siteId))
  ) {
    conflict(
      "ASSIGNMENT_REVOKED",
      "Your site assignment is no longer active.",
      input.siteId,
      null,
    );
  }
}

async function validateAttachments(
  principal: AuthenticatedPrincipal,
  input: OfflineSyncRequest,
) {
  if (
    evidenceRequired.has(input.draftType) &&
    !input.attachmentUploadIds.length
  ) {
    conflict(
      "MANDATORY_EVIDENCE",
      "Upload and scan the required evidence before synchronizing.",
    );
  }
  if (!input.attachmentUploadIds.length) return;
  const sessions = await db.attachmentUploadSession.findMany({
    where: {
      id: { in: input.attachmentUploadIds },
      userId: principal.userId,
      localDraftId: input.localDraftId,
    },
    select: { id: true, status: true, fileRecordId: true },
  });
  if (sessions.length !== new Set(input.attachmentUploadIds).size) {
    conflict(
      "ATTACHMENT_SCOPE",
      "An attachment is missing or belongs to another user.",
    );
  }
  const fileIds = sessions.flatMap((session) =>
    session.fileRecordId ? [session.fileRecordId] : [],
  );
  const cleanFiles = await db.fileRecord.count({
    where: { id: { in: fileIds }, scanStatus: "CLEAN" },
  });
  if (
    sessions.some((session) => session.status !== "CLEAN") ||
    cleanFiles !== sessions.length
  ) {
    conflict(
      "ATTACHMENT_SCAN_PENDING",
      "Mandatory evidence has not completed the security scan.",
    );
  }
}

export async function acceptOfflineSubmission(
  principal: AuthenticatedPrincipal,
  raw: unknown,
) {
  if (!canUseOfflineOperations(principal)) throw new AppError("FORBIDDEN");
  const input = offlineSyncRequestSchema.parse(raw);
  requirePermission(principal, permissionForDraft[input.draftType]);
  if (
    !principal.roleCodes.some((role) =>
      rolesForDraft[input.draftType].includes(role),
    )
  ) {
    throw new AppError(
      "FORBIDDEN",
      "This role cannot create that offline draft type.",
    );
  }

  if (input.schemaVersion !== OFFLINE_SCHEMA_VERSION) {
    conflict(
      "SERVER_SCHEMA_CHANGED",
      "Update the app and revise this draft before synchronizing.",
      input.schemaVersion,
      OFFLINE_SCHEMA_VERSION,
    );
  }
  const referenceExpiresAt = new Date(input.referenceExpiresAt);
  if (referenceExpiresAt <= new Date()) {
    conflict(
      "REFERENCE_DATA_EXPIRED",
      "Refresh assigned reference data before synchronizing.",
      input.referenceExpiresAt,
    );
  }
  await validateScope(principal, input);
  const currentReference = await getOfflineReferenceSnapshot(principal);
  if (currentReference.version !== input.referenceVersion) {
    conflict(
      "REFERENCE_DATA_CHANGED",
      "Assignments or operational reference data changed while offline.",
      input.referenceVersion,
      currentReference.version,
    );
  }
  await validateBusinessPayload(input, currentReference);
  if (gpsRequired.has(input.draftType)) {
    if (!input.gps) conflict("GPS_REQUIRED", "Capture current GPS evidence.");
    const result = validateGpsEvidence(input.gps);
    if (!result.valid) {
      conflict(
        result.reason,
        "GPS evidence is invalid or stale.",
        input.gps.capturedAt,
      );
    }
  }
  await validateAttachments(principal, input);

  const hash = payloadHash(input);
  const existing = await db.deviceDraftSubmission.findFirst({
    where: {
      OR: [
        { idempotencyKey: input.idempotencyKey },
        { userId: principal.userId, localDraftId: input.localDraftId },
      ],
    },
  });
  if (existing) {
    if (existing.userId !== principal.userId) throw new AppError("FORBIDDEN");
    if (existing.payloadHash !== hash) {
      conflict(
        "IDEMPOTENCY_PAYLOAD_MISMATCH",
        "This draft ID was already synchronized with different content.",
        hash,
        existing.payloadHash,
      );
    }
    return {
      id: existing.id,
      status: existing.status,
      duplicate: true,
      correlationId: existing.correlationId,
    };
  }

  const correlationId = randomUUID();
  try {
    return await db.$transaction(async (transaction) => {
      const submission = await transaction.deviceDraftSubmission.create({
        data: {
          userId: principal.userId,
          employeeId: principal.employeeId,
          localDraftId: input.localDraftId,
          draftType: input.draftType,
          projectId: input.projectId,
          siteId: input.siteId,
          schemaVersion: input.schemaVersion,
          referenceVersion: input.referenceVersion,
          lastKnownServerVersion: input.lastKnownServerVersion,
          payload: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
          payloadHash: hash,
          idempotencyKey: input.idempotencyKey,
          status: "SYNCING",
          deviceCapturedAt: new Date(input.deviceCapturedAt),
          correlationId,
        },
      });
      const accepted = await transaction.deviceDraftSubmission.update({
        where: { id: submission.id },
        data: { status: "SYNCED", acceptedAt: new Date() },
      });
      await transaction.offlineSyncAuditEvent.createMany({
        data: [
          {
            submissionId: accepted.id,
            actorUserId: principal.userId,
            toStatus: "SYNCING",
            reasonCode: "SERVER_VALIDATION_STARTED",
            correlationId,
          },
          {
            submissionId: accepted.id,
            actorUserId: principal.userId,
            fromStatus: "SYNCING",
            toStatus: "SYNCED",
            reasonCode: "SERVER_DRAFT_ACCEPTED",
            safeMetadata: {
              draftType: input.draftType,
              attachmentCount: input.attachmentUploadIds.length,
            },
            correlationId,
          },
        ],
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: "CREATE",
          entityType: "DeviceDraftSubmission",
          entityId: accepted.id,
          metadata: { correlationId, draftType: input.draftType },
        },
        transaction,
      );
      await transaction.mobileTelemetryEvent.create({
        data: {
          userId: principal.userId,
          eventType: "OFFLINE_SYNC",
          draftType: input.draftType,
          outcome: "SUCCESS",
          correlationId,
        },
      });
      return {
        id: accepted.id,
        status: accepted.status,
        duplicate: false,
        correlationId,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await db.deviceDraftSubmission.findFirst({
        where: {
          OR: [
            { idempotencyKey: input.idempotencyKey },
            { userId: principal.userId, localDraftId: input.localDraftId },
          ],
        },
      });
      if (raced?.payloadHash === hash && raced.userId === principal.userId) {
        return {
          id: raced.id,
          status: raced.status,
          duplicate: true,
          correlationId: raced.correlationId,
        };
      }
    }
    throw error;
  }
}
