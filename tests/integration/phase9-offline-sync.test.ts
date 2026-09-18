import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db/prisma";
import {
  OFFLINE_SCHEMA_VERSION,
  offlineIdempotencyKey,
} from "../../src/features/offline/offline-domain";
import { getOfflineReferenceSnapshot } from "../../src/server/offline/reference-service";
import {
  acceptOfflineSubmission,
  OfflineConflictError,
} from "../../src/server/offline/sync-service";
import type {
  AuthenticatedPrincipal,
  PermissionCode,
} from "../../src/types/application";

const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && !!process.env.TEST_DATABASE_URL;
const submissionIds: string[] = [];
const uploadIds: string[] = [];

async function demoPrincipal(email: string): Promise<AuthenticatedPrincipal> {
  const user = await db.user.findUniqueOrThrow({
    where: { emailNormalized: email },
    include: {
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  return {
    userId: user.id,
    employeeId: user.employeeId,
    email: user.email,
    displayName: user.displayName,
    mustChangePassword: false,
    roleCodes: user.roles.map(({ role }) => role.code),
    permissions: [
      ...new Set(
        user.roles.flatMap(({ role }) =>
          role.permissions.map(
            ({ permission }) => permission.code as PermissionCode,
          ),
        ),
      ),
    ],
  };
}

function requestFor(
  principal: AuthenticatedPrincipal,
  snapshot: Awaited<ReturnType<typeof getOfflineReferenceSnapshot>>,
  overrides: Record<string, unknown> = {},
) {
  const localDraftId = randomUUID();
  return {
    localDraftId,
    draftType: "MATERIAL_REQUIREMENT" as const,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    referenceVersion: snapshot.version,
    referenceExpiresAt: snapshot.expiresAt,
    idempotencyKey: offlineIdempotencyKey(principal.userId, localDraftId),
    projectId: snapshot.projects[0].id,
    siteId: snapshot.projects[0].sites[0].id,
    deviceCapturedAt: new Date().toISOString(),
    attachmentUploadIds: [],
    form: {
      materialId: snapshot.materials[0].id,
      quantity: "1.000",
      remarks: "Integration-tested offline draft",
    },
    ...overrides,
  };
}

describe.skipIf(!enabled)("Phase 9 offline synchronization", () => {
  let projectManager: AuthenticatedPrincipal;
  let siteSupervisor: AuthenticatedPrincipal;
  let storeKeeper: AuthenticatedPrincipal;
  let managerReference: Awaited<ReturnType<typeof getOfflineReferenceSnapshot>>;
  let siteReference: Awaited<ReturnType<typeof getOfflineReferenceSnapshot>>;
  let storeReference: Awaited<ReturnType<typeof getOfflineReferenceSnapshot>>;

  beforeAll(async () => {
    [projectManager, siteSupervisor, storeKeeper] = await Promise.all([
      demoPrincipal("project.manager@kdipl.test"),
      demoPrincipal("site.supervisor@kdipl.test"),
      demoPrincipal("store.keeper@kdipl.test"),
    ]);
    [managerReference, siteReference, storeReference] = await Promise.all([
      getOfflineReferenceSnapshot(projectManager),
      getOfflineReferenceSnapshot(siteSupervisor),
      getOfflineReferenceSnapshot(storeKeeper),
    ]);
  });

  afterAll(async () => {
    if (submissionIds.length) {
      await db.offlineSyncAuditEvent.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });
      await db.deviceDraftSubmission.deleteMany({
        where: { id: { in: submissionIds } },
      });
    }
    if (uploadIds.length) {
      await db.attachmentUploadSession.deleteMany({
        where: { id: { in: uploadIds } },
      });
    }
  });

  it("accepts an authorized draft once and returns the stable record on retry", async () => {
    const request = requestFor(projectManager, managerReference);
    const first = await acceptOfflineSubmission(projectManager, request);
    const second = await acceptOfflineSubmission(projectManager, request);
    submissionIds.push(first.id);
    expect(first.status).toBe("SYNCED");
    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ id: first.id, duplicate: true });
  });

  it("rejects a duplicate idempotency key carrying a different payload", async () => {
    const request = requestFor(projectManager, managerReference);
    const first = await acceptOfflineSubmission(projectManager, request);
    submissionIds.push(first.id);
    await expect(
      acceptOfflineSubmission(projectManager, {
        ...request,
        form: { ...request.form, remarks: "Changed after synchronization" },
      }),
    ).rejects.toMatchObject({
      conflict: { code: "IDEMPOTENCY_PAYLOAD_MISMATCH" },
    });
  });

  it("handles concurrent online/offline duplicate submission safely", async () => {
    const request = requestFor(projectManager, managerReference);
    const [first, second] = await Promise.all([
      acceptOfflineSubmission(projectManager, request),
      acceptOfflineSubmission(projectManager, request),
    ]);
    submissionIds.push(first.id);
    expect(first.id).toBe(second.id);
    expect([first.duplicate, second.duplicate]).toContain(true);
  });

  it("rejects revoked or unknown assignment scope", async () => {
    await expect(
      acceptOfflineSubmission(projectManager, {
        ...requestFor(projectManager, managerReference),
        projectId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      conflict: { code: "ASSIGNMENT_REVOKED" },
    });
  });

  it("rejects expired references and stale client schema", async () => {
    await expect(
      acceptOfflineSubmission(projectManager, {
        ...requestFor(projectManager, managerReference),
        referenceExpiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(OfflineConflictError);
    await expect(
      acceptOfflineSubmission(projectManager, {
        ...requestFor(projectManager, managerReference),
        schemaVersion: 99,
      }),
    ).rejects.toMatchObject({ conflict: { code: "SERVER_SCHEMA_CHANGED" } });
  });

  it("requires current GPS for site events", async () => {
    const base = requestFor(siteSupervisor, siteReference, {
      draftType: "SITE_MATERIAL_ISSUE_REQUEST",
    });
    await expect(
      acceptOfflineSubmission(siteSupervisor, base),
    ).rejects.toMatchObject({ conflict: { code: "GPS_REQUIRED" } });
    await expect(
      acceptOfflineSubmission(siteSupervisor, {
        ...base,
        gps: {
          latitude: 28.61,
          longitude: 77.2,
          accuracy: 10,
          capturedAt: "2020-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ conflict: { code: "STALE_GPS" } });
  });

  it("blocks mandatory evidence that is missing or failed scanning", async () => {
    expect(storeReference.projects.length).toBeGreaterThan(0);
    const localDraftId = randomUUID();
    const base = requestFor(storeKeeper, storeReference, {
      localDraftId,
      draftType: "DIRECT_SITE_GRN",
      idempotencyKey: offlineIdempotencyKey(storeKeeper.userId, localDraftId),
      gps: {
        latitude: 28.61,
        longitude: 77.2,
        accuracy: 15,
        capturedAt: new Date().toISOString(),
      },
      form: {
        referenceId: storeReference.purchaseOrders[0].id,
        receivedQuantity: "1.000",
        damagedQuantity: "0",
      },
    });
    await expect(
      acceptOfflineSubmission(storeKeeper, base),
    ).rejects.toMatchObject({ conflict: { code: "MANDATORY_EVIDENCE" } });
    const upload = await db.attachmentUploadSession.create({
      data: {
        userId: storeKeeper.userId,
        localDraftId,
        filename: "failed.jpg",
        mimeType: "image/jpeg",
        size: 10,
        checksum: "a".repeat(64),
        documentType: "MOBILE_OPERATION_EVIDENCE",
        idempotencyKey: `p9-upload-${randomUUID()}`,
        status: "FAILED",
        correlationId: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    uploadIds.push(upload.id);
    await expect(
      acceptOfflineSubmission(storeKeeper, {
        ...base,
        attachmentUploadIds: [upload.id],
      }),
    ).rejects.toMatchObject({ conflict: { code: "ATTACHMENT_SCAN_PENDING" } });
  });

  it("stores server-owned acceptance timestamps without posting stock", async () => {
    const before = await db.stockTransaction.count();
    const request = requestFor(projectManager, managerReference);
    const result = await acceptOfflineSubmission(projectManager, request);
    submissionIds.push(result.id);
    const stored = await db.deviceDraftSubmission.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(stored.acceptedAt).toBeInstanceOf(Date);
    expect(await db.stockTransaction.count()).toBe(before);
  });
});
