"use client";

import {
  assertDraftOwner,
  expiresAtForDraft,
  isDraftExpired,
  migrateOfflineEnvelope,
  OFFLINE_DRAFT_EXPIRY_DAYS,
  OFFLINE_SCHEMA_VERSION,
  type OfflineDraftType,
  type OfflineSyncStatus,
} from "@/features/offline/offline-domain";

const DATABASE = "kdipl-secure-offline";
const DATABASE_VERSION = 1;
const SESSION_UNLOCK_KEY = "kdipl.offline.unlocked-user";
const DEVICE_KEY_ID = "device-aes-gcm-v1";

export type OfflineDraftPayload = {
  draftType: OfflineDraftType;
  projectId?: string;
  siteId?: string;
  referenceVersion: string;
  referenceExpiresAt: string;
  lastKnownServerVersion?: number;
  deviceCapturedAt: string;
  form: Record<string, unknown>;
  gps?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: string;
    source?: string;
  };
  attachmentIds: string[];
};

export type OfflineDraftRecord = {
  localDraftId: string;
  ownerUserId: string;
  employeeId: string | null;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  status: OfflineSyncStatus;
  retryCount: number;
  lastError: string | null;
  serverRecordId: string | null;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
};

export type DecryptedOfflineDraft = Omit<
  OfflineDraftRecord,
  "iv" | "ciphertext"
> & { payload: OfflineDraftPayload; expiresAt: string };

export type PendingAttachment = {
  id: string;
  localDraftId: string;
  ownerUserId: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
  documentType: string;
  createdAt: string;
  uploadStatus: string;
  uploadProgress: number;
  retryCount: number;
  lastError: string | null;
  serverUploadId: string | null;
  fileRecordId: string | null;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
};

export type OfflineReferenceSnapshot = {
  version: string;
  fetchedAt: string;
  expiresAt: string;
  permissionScope: {
    userId: string;
    employeeId: string | null;
    roles: string[];
    projectIds: string[];
    siteIds: string[];
    locationIds: string[];
  };
  projects: Array<{
    id: string;
    projectCode: string;
    name: string;
    sites: Array<{ id: string; siteCode: string; name: string }>;
  }>;
  materials: Array<{
    id: string;
    materialCode: string;
    name: string;
    defaultUnit: { id: string; code: string; name: string; symbol: string };
  }>;
  locations: Array<{
    id: string;
    locationCode: string;
    name: string;
    type: string;
    projectId: string | null;
    siteId: string | null;
  }>;
  purchaseOrders: Array<{
    id: string;
    poNumber: string;
    projectId: string;
    status: string;
    expectedDeliveryDate: string;
  }>;
  movementReferences: Array<{
    id: string;
    number: string;
    kind: string;
    status: string;
    sourceLocationId: string;
    destinationLocationId: string | null;
    materialId: string;
    quantity: string;
  }>;
};

function request<T>(value: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("IndexedDB failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function openDatabase() {
  if (!("indexedDB" in window))
    throw new Error("Offline storage is unavailable.");
  const open = indexedDB.open(DATABASE, DATABASE_VERSION);
  open.onupgradeneeded = () => {
    const database = open.result;
    const drafts = database.createObjectStore("drafts", {
      keyPath: "localDraftId",
    });
    drafts.createIndex("ownerUserId", "ownerUserId");
    drafts.createIndex("ownerStatus", ["ownerUserId", "status"]);
    const attachments = database.createObjectStore("attachments", {
      keyPath: "id",
    });
    attachments.createIndex("ownerUserId", "ownerUserId");
    attachments.createIndex("draftId", "localDraftId");
    database.createObjectStore("keys", { keyPath: "id" });
    database.createObjectStore("metadata", { keyPath: "id" });
  };
  return request(open);
}

function requireUnlocked(userId: string) {
  if (sessionStorage.getItem(SESSION_UNLOCK_KEY) !== userId) {
    throw new Error("Offline drafts are locked. Reconnect and sign in again.");
  }
}

async function deviceKey() {
  const database = await openDatabase();
  const read = database.transaction("keys", "readonly");
  const existing = await request<{ id: string; key: CryptoKey } | undefined>(
    read.objectStore("keys").get(DEVICE_KEY_ID),
  );
  if (existing?.key) return existing.key;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const write = database.transaction("keys", "readwrite");
  write.objectStore("keys").put({ id: DEVICE_KEY_ID, key });
  await transactionDone(write);
  return key;
}

function aad(userId: string, recordId: string, purpose: string) {
  return new TextEncoder().encode(`${userId}:${recordId}:${purpose}:v1`);
}

async function encrypt(
  userId: string,
  recordId: string,
  purpose: string,
  value: unknown,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(userId, recordId, purpose) },
    await deviceKey(),
    plaintext,
  );
  plaintext.fill(0);
  return { iv: iv.buffer, ciphertext };
}

async function decrypt<T>(
  userId: string,
  recordId: string,
  purpose: string,
  iv: ArrayBuffer,
  ciphertext: ArrayBuffer,
) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(iv),
      additionalData: aad(userId, recordId, purpose),
    },
    await deviceKey(),
    ciphertext,
  );
  const bytes = new Uint8Array(plaintext);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } finally {
    bytes.fill(0);
  }
}

export function unlockOfflineVault(userId: string) {
  sessionStorage.setItem(SESSION_UNLOCK_KEY, userId);
}

export function lockOfflineVault() {
  sessionStorage.removeItem(SESSION_UNLOCK_KEY);
}

export function offlineVaultUnlocked(userId: string) {
  return sessionStorage.getItem(SESSION_UNLOCK_KEY) === userId;
}

export async function saveOfflineDraft(input: {
  localDraftId?: string;
  ownerUserId: string;
  employeeId: string | null;
  payload: OfflineDraftPayload;
  status?: OfflineSyncStatus;
}) {
  requireUnlocked(input.ownerUserId);
  const database = await openDatabase();
  const localDraftId = input.localDraftId ?? crypto.randomUUID();
  const existing = await request<OfflineDraftRecord | undefined>(
    database
      .transaction("drafts", "readonly")
      .objectStore("drafts")
      .get(localDraftId),
  );
  if (existing) assertDraftOwner(input.ownerUserId, existing.ownerUserId);
  const now = new Date().toISOString();
  const sealed = await encrypt(input.ownerUserId, localDraftId, "draft", {
    ...input.payload,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
  });
  const record: OfflineDraftRecord = {
    localDraftId,
    ownerUserId: input.ownerUserId,
    employeeId: input.employeeId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    status: input.status ?? existing?.status ?? "LOCAL_DRAFT",
    retryCount: existing?.retryCount ?? 0,
    lastError: existing?.lastError ?? null,
    serverRecordId: existing?.serverRecordId ?? null,
    ...sealed,
  };
  const transaction = database.transaction("drafts", "readwrite");
  transaction.objectStore("drafts").put(record);
  await transactionDone(transaction);
  return localDraftId;
}

export async function listOfflineDrafts(userId: string) {
  requireUnlocked(userId);
  const database = await openDatabase();
  const records = await request<OfflineDraftRecord[]>(
    database
      .transaction("drafts", "readonly")
      .objectStore("drafts")
      .index("ownerUserId")
      .getAll(userId),
  );
  const drafts = await Promise.all(
    records.map(async (record): Promise<DecryptedOfflineDraft> => {
      const decrypted = migrateOfflineEnvelope(
        await decrypt<Record<string, unknown>>(
          userId,
          record.localDraftId,
          "draft",
          record.iv,
          record.ciphertext,
        ),
      ) as OfflineDraftPayload;
      return {
        ...record,
        payload: decrypted,
        expiresAt: expiresAtForDraft(record.updatedAt).toISOString(),
      };
    }),
  );
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function updateOfflineDraftState(
  userId: string,
  localDraftId: string,
  update: Partial<
    Pick<
      OfflineDraftRecord,
      "status" | "retryCount" | "lastError" | "serverRecordId"
    >
  >,
) {
  requireUnlocked(userId);
  const database = await openDatabase();
  const transaction = database.transaction("drafts", "readwrite");
  const store = transaction.objectStore("drafts");
  const current = await request<OfflineDraftRecord | undefined>(
    store.get(localDraftId),
  );
  if (!current) throw new Error("Offline draft was not found.");
  assertDraftOwner(userId, current.ownerUserId);
  store.put({ ...current, ...update, updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
}

export async function discardOfflineDraft(
  userId: string,
  localDraftId: string,
) {
  await updateOfflineDraftState(userId, localDraftId, { status: "DISCARDED" });
}

export async function clearOfflineUserData(userId: string) {
  const database = await openDatabase();
  for (const storeName of ["drafts", "attachments"] as const) {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const ids = await request<IDBValidKey[]>(
      store.index("ownerUserId").getAllKeys(userId),
    );
    ids.forEach((id) => store.delete(id));
    await transactionDone(transaction);
  }
  const metadataTransaction = database.transaction("metadata", "readwrite");
  metadataTransaction.objectStore("metadata").delete(`reference:${userId}`);
  await transactionDone(metadataTransaction);
  lockOfflineVault();
}

export async function expiredOfflineDrafts(userId: string, now = new Date()) {
  return (await listOfflineDrafts(userId)).filter((draft) =>
    isDraftExpired(draft.updatedAt, now, OFFLINE_DRAFT_EXPIRY_DAYS),
  );
}

export async function savePendingAttachment(input: {
  ownerUserId: string;
  localDraftId: string;
  file: File;
  checksum: string;
  documentType: string;
}) {
  requireUnlocked(input.ownerUserId);
  const id = crypto.randomUUID();
  const sealed = await encrypt(
    input.ownerUserId,
    id,
    "attachment",
    Array.from(new Uint8Array(await input.file.arrayBuffer())),
  );
  const record: PendingAttachment = {
    id,
    localDraftId: input.localDraftId,
    ownerUserId: input.ownerUserId,
    filename: input.file.name,
    mimeType: input.file.type,
    size: input.file.size,
    checksum: input.checksum,
    documentType: input.documentType,
    createdAt: new Date().toISOString(),
    uploadStatus: "QUEUED",
    uploadProgress: 0,
    retryCount: 0,
    lastError: null,
    serverUploadId: null,
    fileRecordId: null,
    ...sealed,
  };
  const database = await openDatabase();
  const transaction = database.transaction("attachments", "readwrite");
  transaction.objectStore("attachments").put(record);
  await transactionDone(transaction);
  return id;
}

export async function attachmentFile(userId: string, id: string) {
  requireUnlocked(userId);
  const database = await openDatabase();
  const record = await request<PendingAttachment | undefined>(
    database
      .transaction("attachments", "readonly")
      .objectStore("attachments")
      .get(id),
  );
  if (!record) throw new Error("Pending attachment was not found.");
  assertDraftOwner(userId, record.ownerUserId);
  const values = await decrypt<number[]>(
    userId,
    id,
    "attachment",
    record.iv,
    record.ciphertext,
  );
  return {
    record,
    file: new File([new Uint8Array(values)], record.filename, {
      type: record.mimeType,
    }),
  };
}

export async function listPendingAttachments(
  userId: string,
  localDraftId?: string,
) {
  requireUnlocked(userId);
  const database = await openDatabase();
  const store = database
    .transaction("attachments", "readonly")
    .objectStore("attachments");
  const records = await request<PendingAttachment[]>(
    localDraftId
      ? store.index("draftId").getAll(localDraftId)
      : store.index("ownerUserId").getAll(userId),
  );
  records.forEach((record) => assertDraftOwner(userId, record.ownerUserId));
  return records;
}

export async function updatePendingAttachment(
  userId: string,
  id: string,
  update: Partial<
    Pick<
      PendingAttachment,
      | "uploadStatus"
      | "uploadProgress"
      | "retryCount"
      | "lastError"
      | "serverUploadId"
      | "fileRecordId"
    >
  >,
) {
  requireUnlocked(userId);
  const database = await openDatabase();
  const transaction = database.transaction("attachments", "readwrite");
  const store = transaction.objectStore("attachments");
  const record = await request<PendingAttachment | undefined>(store.get(id));
  if (!record) throw new Error("Pending attachment was not found.");
  assertDraftOwner(userId, record.ownerUserId);
  store.put({ ...record, ...update });
  await transactionDone(transaction);
}

export async function saveReferenceSnapshot(
  userId: string,
  snapshot: OfflineReferenceSnapshot,
) {
  requireUnlocked(userId);
  assertDraftOwner(userId, snapshot.permissionScope.userId);
  const id = `reference:${userId}`;
  const sealed = await encrypt(userId, id, "reference", snapshot);
  const database = await openDatabase();
  const transaction = database.transaction("metadata", "readwrite");
  transaction.objectStore("metadata").put({
    id,
    ownerUserId: userId,
    version: snapshot.version,
    expiresAt: snapshot.expiresAt,
    ...sealed,
  });
  await transactionDone(transaction);
}

export async function loadReferenceSnapshot(userId: string) {
  requireUnlocked(userId);
  const id = `reference:${userId}`;
  const database = await openDatabase();
  const record = await request<
    | {
        id: string;
        ownerUserId: string;
        iv: ArrayBuffer;
        ciphertext: ArrayBuffer;
      }
    | undefined
  >(
    database
      .transaction("metadata", "readonly")
      .objectStore("metadata")
      .get(id),
  );
  if (!record) return null;
  assertDraftOwner(userId, record.ownerUserId);
  return decrypt<OfflineReferenceSnapshot>(
    userId,
    id,
    "reference",
    record.iv,
    record.ciphertext,
  );
}
