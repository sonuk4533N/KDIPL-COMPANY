export const OFFLINE_SCHEMA_VERSION = 1;
export const OFFLINE_REFERENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const OFFLINE_DRAFT_EXPIRY_DAYS = 7;
export const GPS_STALE_AFTER_MS = 10 * 60 * 1000;
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export const offlineDraftTypes = [
  "MATERIAL_REQUIREMENT",
  "SITE_MATERIAL_ISSUE_REQUEST",
  "DIRECT_SITE_GRN",
  "SITE_RECEIPT_ACKNOWLEDGMENT",
  "DAMAGED_REJECTED_REPORT",
  "TRANSFER_RECEIPT",
  "UNUSED_MATERIAL_RETURN",
  "DAMAGE_LOSS_REPORT",
  "PHYSICAL_STOCK_COUNT",
] as const;

export type OfflineDraftType = (typeof offlineDraftTypes)[number];

export const offlineSyncStatuses = [
  "LOCAL_DRAFT",
  "QUEUED",
  "SYNCING",
  "SYNCED",
  "CONFLICT",
  "FAILED",
  "RETRY_QUEUED",
  "USER_ACTION_REQUIRED",
  "DISCARDED",
] as const;

export type OfflineSyncStatus = (typeof offlineSyncStatuses)[number];

const transitions: Record<OfflineSyncStatus, readonly OfflineSyncStatus[]> = {
  LOCAL_DRAFT: ["QUEUED", "DISCARDED"],
  QUEUED: ["SYNCING", "DISCARDED"],
  SYNCING: ["SYNCED", "CONFLICT", "FAILED"],
  SYNCED: [],
  CONFLICT: ["USER_ACTION_REQUIRED"],
  FAILED: ["RETRY_QUEUED", "DISCARDED"],
  RETRY_QUEUED: ["SYNCING", "DISCARDED"],
  USER_ACTION_REQUIRED: ["LOCAL_DRAFT", "QUEUED", "DISCARDED"],
  DISCARDED: [],
};

export function canTransitionOfflineDraft(
  from: OfflineSyncStatus,
  to: OfflineSyncStatus,
) {
  return transitions[from].includes(to);
}

export function transitionOfflineDraft(
  from: OfflineSyncStatus,
  to: OfflineSyncStatus,
) {
  if (!canTransitionOfflineDraft(from, to)) {
    throw new Error(`Invalid offline queue transition: ${from} -> ${to}`);
  }
  return to;
}

export function expiresAtForDraft(
  updatedAt: string | Date,
  expiryDays = OFFLINE_DRAFT_EXPIRY_DAYS,
) {
  const value = new Date(updatedAt);
  if (!Number.isFinite(value.valueOf()) || expiryDays < 1) {
    throw new Error("Invalid draft expiry input.");
  }
  return new Date(value.valueOf() + expiryDays * 86_400_000);
}

export function isDraftExpired(
  updatedAt: string | Date,
  now = new Date(),
  expiryDays = OFFLINE_DRAFT_EXPIRY_DAYS,
) {
  return expiresAtForDraft(updatedAt, expiryDays) <= now;
}

export function offlineIdempotencyKey(userId: string, localDraftId: string) {
  if (!isUuid(userId) || !isUuid(localDraftId)) {
    throw new Error("Offline idempotency identifiers must be UUIDs.");
  }
  return `offline:v${OFFLINE_SCHEMA_VERSION}:${userId}:${localDraftId}`;
}

export type GpsEvidence = {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  source?: string;
};

export function validateGpsEvidence(
  gps: GpsEvidence,
  now = new Date(),
  staleAfterMs = GPS_STALE_AFTER_MS,
) {
  const capturedAt = new Date(gps.capturedAt);
  if (
    !Number.isFinite(gps.latitude) ||
    gps.latitude < -90 ||
    gps.latitude > 90 ||
    !Number.isFinite(gps.longitude) ||
    gps.longitude < -180 ||
    gps.longitude > 180
  ) {
    return { valid: false as const, reason: "INVALID_COORDINATES" };
  }
  if (!Number.isFinite(gps.accuracy) || gps.accuracy < 0) {
    return { valid: false as const, reason: "INVALID_ACCURACY" };
  }
  if (!Number.isFinite(capturedAt.valueOf())) {
    return { valid: false as const, reason: "INVALID_TIMESTAMP" };
  }
  const age = now.valueOf() - capturedAt.valueOf();
  if (age < -120_000) {
    return { valid: false as const, reason: "FUTURE_TIMESTAMP" };
  }
  if (age > staleAfterMs) {
    return { valid: false as const, reason: "STALE_GPS" };
  }
  return { valid: true as const, ageMs: Math.max(0, age) };
}

export function retryBackoffMs(retryCount: number, jitter = 0) {
  const safeRetry = Math.max(0, Math.min(8, Math.floor(retryCount)));
  const safeJitter = Math.max(0, Math.min(1, jitter));
  return Math.round(
    Math.min(300_000, 1_000 * 2 ** safeRetry) * (1 + safeJitter * 0.25),
  );
}

export function imageCompressionPlan(
  width: number,
  height: number,
  bytes: number,
) {
  if (width <= 0 || height <= 0 || bytes <= 0) {
    throw new Error("Invalid image dimensions.");
  }
  const scale = Math.min(1, 2048 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    quality:
      bytes > 8 * 1024 * 1024 ? 0.72 : bytes > 3 * 1024 * 1024 ? 0.8 : 0.86,
  };
}

export function assertDraftOwner(expectedUserId: string, actualUserId: string) {
  if (expectedUserId !== actualUserId) {
    throw new Error("Offline draft belongs to another user.");
  }
}

export function migrateOfflineEnvelope(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid offline draft envelope.");
  }
  const source = value as Record<string, unknown>;
  const version = Number(source.schemaVersion ?? 0);
  if (version === OFFLINE_SCHEMA_VERSION) return source;
  if (version === 0) {
    return { ...source, schemaVersion: OFFLINE_SCHEMA_VERSION, retryCount: 0 };
  }
  throw new Error("This draft was created by an unsupported app version.");
}

export async function sha256Hex(value: Blob | ArrayBuffer | string) {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : value instanceof Blob
        ? new Uint8Array(await value.arrayBuffer())
        : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
