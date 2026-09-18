import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  canTransitionOfflineDraft,
  expiresAtForDraft,
  imageCompressionPlan,
  isDraftExpired,
  migrateOfflineEnvelope,
  offlineIdempotencyKey,
  retryBackoffMs,
  sha256Hex,
  transitionOfflineDraft,
  validateGpsEvidence,
  assertDraftOwner,
} from "@/features/offline/offline-domain";

describe("Phase 9 offline domain", () => {
  it("enforces the explicit synchronization state machine", () => {
    expect(canTransitionOfflineDraft("LOCAL_DRAFT", "QUEUED")).toBe(true);
    expect(canTransitionOfflineDraft("SYNCING", "SYNCED")).toBe(true);
    expect(canTransitionOfflineDraft("SYNCED", "LOCAL_DRAFT")).toBe(false);
    expect(() => transitionOfflineDraft("SYNCED", "QUEUED")).toThrow(
      "Invalid offline queue transition",
    );
  });

  it("expires abandoned drafts after seven days by default", () => {
    const updated = new Date("2026-09-01T00:00:00.000Z");
    expect(expiresAtForDraft(updated).toISOString()).toBe(
      "2026-09-08T00:00:00.000Z",
    );
    expect(isDraftExpired(updated, new Date("2026-09-08T00:00:01.000Z"))).toBe(
      true,
    );
  });

  it("creates stable user-and-draft-scoped idempotency keys", () => {
    const userId = randomUUID();
    const draftId = randomUUID();
    expect(offlineIdempotencyKey(userId, draftId)).toBe(
      offlineIdempotencyKey(userId, draftId),
    );
    expect(offlineIdempotencyKey(userId, draftId)).toContain(userId);
  });

  it("rejects invalid and stale GPS evidence", () => {
    const now = new Date("2026-09-18T10:10:00.000Z");
    expect(
      validateGpsEvidence(
        {
          latitude: 28.61,
          longitude: 77.2,
          accuracy: 12,
          capturedAt: "2026-09-18T10:05:00.000Z",
        },
        now,
      ).valid,
    ).toBe(true);
    expect(
      validateGpsEvidence(
        {
          latitude: 91,
          longitude: 77.2,
          accuracy: 12,
          capturedAt: "2026-09-18T10:05:00.000Z",
        },
        now,
      ),
    ).toMatchObject({ valid: false, reason: "INVALID_COORDINATES" });
    expect(
      validateGpsEvidence(
        {
          latitude: 28.61,
          longitude: 77.2,
          accuracy: 12,
          capturedAt: "2026-09-18T09:00:00.000Z",
        },
        now,
      ),
    ).toMatchObject({ valid: false, reason: "STALE_GPS" });
  });

  it("calculates deterministic SHA-256 attachment checksums", async () => {
    expect(await sha256Hex("KDIPL")).toBe(
      "7321d8491740039918444f2331e26066ee572de732ee1c0256023f2f1d46683f",
    );
  });

  it("keeps compressed images readable within the long-edge boundary", () => {
    expect(imageCompressionPlan(4000, 3000, 9 * 1024 * 1024)).toEqual({
      width: 2048,
      height: 1536,
      quality: 0.72,
    });
    expect(imageCompressionPlan(800, 600, 100_000)).toMatchObject({
      width: 800,
      height: 600,
    });
  });

  it("prevents cross-user draft access", () => {
    expect(() => assertDraftOwner("user-a", "user-b")).toThrow(
      "belongs to another user",
    );
    expect(() => assertDraftOwner("user-a", "user-a")).not.toThrow();
  });

  it("migrates the initial envelope without trusting unknown versions", () => {
    expect(
      migrateOfflineEnvelope({ schemaVersion: 0, payload: {} }),
    ).toMatchObject({ schemaVersion: 1, retryCount: 0 });
    expect(() => migrateOfflineEnvelope({ schemaVersion: 99 })).toThrow(
      "unsupported app version",
    );
  });

  it("uses bounded exponential retry delays", () => {
    expect(retryBackoffMs(0)).toBe(1000);
    expect(retryBackoffMs(3)).toBe(8000);
    expect(retryBackoffMs(99)).toBeLessThanOrEqual(300_000);
    expect(retryBackoffMs(2, 1)).toBe(5000);
  });
});
