"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CloudOff, Download, RefreshCw, ShieldAlert, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  offlineIdempotencyKey,
  retryBackoffMs,
} from "@/features/offline/offline-domain";
import {
  attachmentFile,
  clearOfflineUserData,
  listOfflineDrafts,
  listPendingAttachments,
  loadReferenceSnapshot,
  offlineVaultUnlocked,
  saveReferenceSnapshot,
  unlockOfflineVault,
  updateOfflineDraftState,
  updatePendingAttachment,
  type DecryptedOfflineDraft,
  type OfflineReferenceSnapshot,
} from "@/features/offline/offline-storage";
import type { AuthenticatedPrincipal } from "@/types/application";

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type OfflineRuntimeValue = {
  online: boolean;
  unlocked: boolean;
  syncing: boolean;
  updateAvailable: boolean;
  statusMessage: string;
  refreshReferenceData(): Promise<OfflineReferenceSnapshot>;
  synchronize(): Promise<void>;
  clearLocalData(): Promise<void>;
};

const OfflineRuntimeContext = createContext<OfflineRuntimeValue | null>(null);

async function uploadWithProgress(userId: string, attachmentId: string) {
  const { record, file } = await attachmentFile(userId, attachmentId);
  if (record.uploadStatus === "CLEAN" && record.serverUploadId) {
    return record.serverUploadId;
  }
  await updatePendingAttachment(userId, record.id, {
    uploadStatus: "UPLOADING",
    uploadProgress: 0,
    lastError: null,
  });
  const body = new FormData();
  body.set("file", file);
  body.set("localDraftId", record.localDraftId);
  body.set("checksum", record.checksum);
  body.set("documentType", record.documentType);
  body.set(
    "idempotencyKey",
    `upload:v1:${userId}:${record.id}:${record.checksum}`,
  );
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/offline/uploads");
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      void updatePendingAttachment(userId, record.id, {
        uploadProgress: Math.round((event.loaded / event.total) * 100),
      });
    };
    request.onerror = () =>
      reject(new Error("Network interrupted during upload."));
    request.onload = () => {
      try {
        const result = JSON.parse(request.responseText) as {
          id?: string;
          status?: string;
          fileRecordId?: string;
          error?: string;
        };
        if (request.status < 200 || request.status >= 300 || !result.id) {
          reject(new Error(result.error ?? "Attachment upload failed."));
          return;
        }
        void updatePendingAttachment(userId, record.id, {
          uploadStatus: result.status ?? "UPLOADED",
          uploadProgress: 100,
          serverUploadId: result.id,
          fileRecordId: result.fileRecordId ?? null,
        });
        if (result.status !== "CLEAN") {
          reject(new Error("Attachment security scan did not pass."));
          return;
        }
        resolve(result.id);
      } catch {
        reject(new Error("Attachment upload returned an invalid response."));
      }
    };
    request.send(body);
  }).catch(async (error) => {
    await updatePendingAttachment(userId, record.id, {
      uploadStatus: "FAILED",
      retryCount: record.retryCount + 1,
      lastError: error instanceof Error ? error.message : "Upload failed.",
    });
    throw error;
  });
}

async function syncDraft(userId: string, draft: DecryptedOfflineDraft) {
  await updateOfflineDraftState(userId, draft.localDraftId, {
    status: "SYNCING",
    lastError: null,
  });
  try {
    const attachments = await listPendingAttachments(
      userId,
      draft.localDraftId,
    );
    const attachmentUploadIds: string[] = [];
    for (const attachment of attachments) {
      attachmentUploadIds.push(await uploadWithProgress(userId, attachment.id));
    }
    const response = await fetch("/api/offline/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        localDraftId: draft.localDraftId,
        draftType: draft.payload.draftType,
        schemaVersion: draft.schemaVersion,
        referenceVersion: draft.payload.referenceVersion,
        referenceExpiresAt: draft.payload.referenceExpiresAt,
        idempotencyKey: offlineIdempotencyKey(userId, draft.localDraftId),
        projectId: draft.payload.projectId,
        siteId: draft.payload.siteId,
        lastKnownServerVersion: draft.payload.lastKnownServerVersion,
        deviceCapturedAt: draft.payload.deviceCapturedAt,
        gps: draft.payload.gps,
        attachmentUploadIds,
        form: draft.payload.form,
      }),
    });
    const result = (await response.json()) as {
      id?: string;
      error?: string;
      conflict?: { reason?: string };
    };
    if (response.status === 409) {
      await updateOfflineDraftState(userId, draft.localDraftId, {
        status: "USER_ACTION_REQUIRED",
        retryCount: draft.retryCount + 1,
        lastError:
          result.conflict?.reason ??
          result.error ??
          "Conflict requires action.",
      });
      return;
    }
    if (!response.ok || !result.id) {
      throw new Error(result.error ?? "Synchronization failed.");
    }
    await updateOfflineDraftState(userId, draft.localDraftId, {
      status: "SYNCED",
      serverRecordId: result.id,
      lastError: null,
    });
  } catch (error) {
    await updateOfflineDraftState(userId, draft.localDraftId, {
      status: "FAILED",
      retryCount: draft.retryCount + 1,
      lastError:
        error instanceof Error ? error.message : "Synchronization failed.",
    });
  }
}

export function OfflineRuntimeProvider({
  principal,
  children,
}: {
  principal: AuthenticatedPrincipal;
  children: React.ReactNode;
}) {
  const offlineEnabled = principal.roleCodes.some((role) =>
    [
      "SITE_SUPERVISOR",
      "STORE_KEEPER",
      "PURCHASE_MANAGER",
      "PROJECT_MANAGER",
    ].includes(role),
  );
  const [online, setOnline] = useState(true);
  const [unlocked, setUnlocked] = useState(() =>
    typeof window === "undefined"
      ? false
      : offlineVaultUnlocked(principal.userId),
  );
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );

  const refreshReferenceData = useCallback(async () => {
    const response = await fetch("/api/offline/reference", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Reference data refresh failed.");
    const snapshot = (await response.json()) as OfflineReferenceSnapshot;
    await saveReferenceSnapshot(principal.userId, snapshot);
    return snapshot;
  }, [principal.userId]);

  const synchronize = useCallback(async () => {
    if (!navigator.onLine || !offlineVaultUnlocked(principal.userId)) return;
    setSyncing(true);
    setStatusMessage("Synchronizing offline drafts...");
    try {
      await refreshReferenceData();
      const drafts = await listOfflineDrafts(principal.userId);
      for (const draft of drafts.filter((item) =>
        ["QUEUED", "FAILED", "RETRY_QUEUED"].includes(item.status),
      )) {
        if (draft.retryCount) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.min(retryBackoffMs(draft.retryCount), 5_000),
            ),
          );
        }
        await syncDraft(principal.userId, draft);
      }
      setStatusMessage("Offline synchronization finished.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Synchronization failed.",
      );
    } finally {
      setSyncing(false);
    }
  }, [principal.userId, refreshReferenceData]);

  const clearLocalData = useCallback(async () => {
    await clearOfflineUserData(principal.userId);
    setUnlocked(false);
  }, [principal.userId]);

  useEffect(() => {
    const setConnectivity = () => setOnline(navigator.onLine);
    setConnectivity();
    window.addEventListener("online", setConnectivity);
    window.addEventListener("offline", setConnectivity);
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", captureInstall);

    if (offlineEnabled && navigator.onLine) {
      fetch("/api/offline/session", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok)
            throw new Error("Online reauthentication required.");
          const session = (await response.json()) as { userId: string };
          if (session.userId !== principal.userId) {
            throw new Error("Signed-in user changed.");
          }
          unlockOfflineVault(principal.userId);
          setUnlocked(true);
          return loadReferenceSnapshot(principal.userId);
        })
        .then((snapshot) => {
          if (!snapshot || new Date(snapshot.expiresAt) <= new Date()) {
            return refreshReferenceData();
          }
        })
        .catch((error) =>
          setStatusMessage(
            error instanceof Error
              ? error.message
              : "Offline drafts remain locked.",
          ),
        );
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
            setUpdateAvailable(true);
          }
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setWaitingWorker(worker);
                setUpdateAvailable(true);
              }
            });
          });
        })
        .catch(() => setStatusMessage("Service-worker registration failed."));
    }
    return () => {
      window.removeEventListener("online", setConnectivity);
      window.removeEventListener("offline", setConnectivity);
      window.removeEventListener("beforeinstallprompt", captureInstall);
    };
  }, [offlineEnabled, principal.userId, refreshReferenceData]);

  useEffect(() => {
    if (offlineEnabled && online && unlocked) {
      const timer = window.setTimeout(() => void synchronize(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [offlineEnabled, online, unlocked, synchronize]);

  const value = useMemo<OfflineRuntimeValue>(
    () => ({
      online,
      unlocked,
      syncing,
      updateAvailable,
      statusMessage,
      refreshReferenceData,
      synchronize,
      clearLocalData,
    }),
    [
      online,
      unlocked,
      syncing,
      updateAvailable,
      statusMessage,
      refreshReferenceData,
      synchronize,
      clearLocalData,
    ],
  );

  return (
    <OfflineRuntimeContext.Provider value={value}>
      {children}
      {offlineEnabled ? (
        <div
          className="pointer-events-none fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-4 md:left-auto md:right-4"
          role="status"
          aria-live="polite"
        >
          {online ? (
            <Wifi
              className="size-5 shrink-0 text-emerald-700"
              aria-hidden="true"
            />
          ) : (
            <CloudOff
              className="size-5 shrink-0 text-amber-700"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {online ? (syncing ? "Synchronizing" : "Online") : "Offline mode"}
            </p>
            <p className="truncate text-xs text-slate-600">
              {statusMessage ||
                (unlocked
                  ? "Encrypted drafts are available for this session."
                  : "Drafts are locked until online reauthentication.")}
            </p>
          </div>
          {installEvent ? (
            <Button
              className="pointer-events-auto"
              size="sm"
              variant="secondary"
              onClick={() => {
                void installEvent.prompt();
                setInstallEvent(null);
              }}
            >
              <Download className="size-4" /> Install
            </Button>
          ) : null}
          {updateAvailable ? (
            <Button
              className="pointer-events-auto"
              size="sm"
              onClick={() => {
                waitingWorker?.postMessage({ type: "SKIP_WAITING" });
                window.location.reload();
              }}
            >
              <RefreshCw className="size-4" /> Update
            </Button>
          ) : null}
          {!unlocked ? <ShieldAlert className="size-5 text-amber-700" /> : null}
        </div>
      ) : null}
    </OfflineRuntimeContext.Provider>
  );
}

export function useOfflineRuntime() {
  const value = useContext(OfflineRuntimeContext);
  if (!value) throw new Error("Offline runtime is unavailable.");
  return value;
}
