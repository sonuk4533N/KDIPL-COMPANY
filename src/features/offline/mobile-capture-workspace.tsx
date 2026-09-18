"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CloudUpload,
  Copy,
  FileScan,
  LocateFixed,
  Mic,
  MicOff,
  RefreshCw,
  RotateCw,
  Save,
  Trash2,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import {
  MAX_ATTACHMENT_BYTES,
  OFFLINE_SCHEMA_VERSION,
  imageCompressionPlan,
  offlineDraftTypes,
  sha256Hex,
  validateGpsEvidence,
  type GpsEvidence,
  type OfflineDraftType,
} from "@/features/offline/offline-domain";
import { useOfflineRuntime } from "@/features/offline/offline-runtime";
import {
  discardOfflineDraft,
  expiredOfflineDrafts,
  listOfflineDrafts,
  loadReferenceSnapshot,
  saveOfflineDraft,
  savePendingAttachment,
  updateOfflineDraftState,
  type DecryptedOfflineDraft,
  type OfflineReferenceSnapshot,
} from "@/features/offline/offline-storage";
import type { AuthenticatedPrincipal } from "@/types/application";

const labels: Record<OfflineDraftType, string> = {
  MATERIAL_REQUIREMENT: "Material Requirement",
  SITE_MATERIAL_ISSUE_REQUEST: "Site material issue request",
  DIRECT_SITE_GRN: "Direct-site GRN capture",
  SITE_RECEIPT_ACKNOWLEDGMENT: "Site receipt acknowledgment",
  DAMAGED_REJECTED_REPORT: "Damaged/rejected material report",
  TRANSFER_RECEIPT: "Stock transfer receipt",
  UNUSED_MATERIAL_RETURN: "Unused-material return",
  DAMAGE_LOSS_REPORT: "Damage/loss report",
  PHYSICAL_STOCK_COUNT: "Physical stock count",
};

const needsGps = new Set<OfflineDraftType>([
  "SITE_MATERIAL_ISSUE_REQUEST",
  "DIRECT_SITE_GRN",
  "SITE_RECEIPT_ACKNOWLEDGMENT",
  "UNUSED_MATERIAL_RETURN",
  "DAMAGE_LOSS_REPORT",
]);

const needsEvidence = new Set<OfflineDraftType>([
  "DIRECT_SITE_GRN",
  "SITE_RECEIPT_ACKNOWLEDGMENT",
  "DAMAGED_REJECTED_REPORT",
  "TRANSFER_RECEIPT",
  "UNUSED_MATERIAL_RETURN",
  "DAMAGE_LOSS_REPORT",
  "PHYSICAL_STOCK_COUNT",
]);

function draftTypesForRoles(roles: readonly string[]) {
  const allowed = new Set<OfflineDraftType>();
  if (roles.includes("PROJECT_MANAGER") || roles.includes("SITE_SUPERVISOR"))
    allowed.add("MATERIAL_REQUIREMENT");
  if (roles.includes("SITE_SUPERVISOR")) {
    allowed.add("SITE_MATERIAL_ISSUE_REQUEST");
    allowed.add("SITE_RECEIPT_ACKNOWLEDGMENT");
    allowed.add("UNUSED_MATERIAL_RETURN");
    allowed.add("DAMAGE_LOSS_REPORT");
  }
  if (roles.includes("STORE_KEEPER")) {
    allowed.add("DIRECT_SITE_GRN");
    allowed.add("DAMAGED_REJECTED_REPORT");
    allowed.add("TRANSFER_RECEIPT");
    allowed.add("PHYSICAL_STOCK_COUNT");
  }
  return offlineDraftTypes.filter((type) => allowed.has(type));
}

type PreparedFile = {
  file: File;
  url: string;
  rotation: number;
  grayscale: boolean;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult:
    | ((event: {
        results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

async function prepareImage(item: PreparedFile) {
  if (!item.file.type.startsWith("image/")) return item.file;
  const bitmap = await createImageBitmap(item.file, {
    imageOrientation: "from-image",
  });
  const plan = imageCompressionPlan(
    bitmap.width,
    bitmap.height,
    item.file.size,
  );
  const rotated = item.rotation % 180 !== 0;
  const canvas = document.createElement("canvas");
  canvas.width = rotated ? plan.height : plan.width;
  canvas.height = rotated ? plan.width : plan.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Image processing is unavailable.");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((item.rotation * Math.PI) / 180);
  if (item.grayscale) context.filter = "grayscale(1) contrast(1.25)";
  context.drawImage(
    bitmap,
    -plan.width / 2,
    -plan.height / 2,
    plan.width,
    plan.height,
  );
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Image compression failed.")),
      "image/jpeg",
      plan.quality,
    ),
  );
  return new File([blob], item.file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function VoiceRemarks({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const SpeechRecognition =
    typeof window === "undefined"
      ? undefined
      : ((
          window as typeof window & {
            SpeechRecognition?: new () => SpeechRecognitionLike;
            webkitSpeechRecognition?: new () => SpeechRecognitionLike;
          }
        ).SpeechRecognition ??
        (
          window as typeof window & {
            webkitSpeechRecognition?: new () => SpeechRecognitionLike;
          }
        ).webkitSpeechRecognition);

  function toggle() {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    if (!SpeechRecognition) return;
    const instance = new SpeechRecognition();
    instance.continuous = false;
    instance.interimResults = false;
    instance.lang = "en-IN";
    instance.onresult = (event) => {
      const text = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(" ");
      if (text) onChange(`${value}${value ? " " : ""}${text}`);
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => setListening(false);
    recognition.current = instance;
    setListening(true);
    instance.start();
  }

  return (
    <div className="space-y-2">
      <Textarea
        id="offline-remarks"
        value={value}
        maxLength={2000}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Enter or dictate remarks, then review before saving."
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={toggle}
        disabled={!SpeechRecognition}
      >
        {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        {listening
          ? "Stop dictation"
          : SpeechRecognition
            ? "Dictate remarks"
            : "Voice unavailable"}
      </Button>
      <p className="text-xs text-slate-500">
        Only the editable confirmed text is saved. Raw audio is not retained or
        uploaded.
      </p>
    </div>
  );
}

export function MobileCaptureWorkspace({
  principal,
}: {
  principal: AuthenticatedPrincipal;
}) {
  const runtime = useOfflineRuntime();
  const {
    online: runtimeOnline,
    refreshReferenceData,
    unlocked: runtimeUnlocked,
  } = runtime;
  const allowedDraftTypes = useMemo(
    () => draftTypesForRoles(principal.roleCodes),
    [principal.roleCodes],
  );
  const [reference, setReference] = useState<OfflineReferenceSnapshot | null>(
    null,
  );
  const [drafts, setDrafts] = useState<DecryptedOfflineDraft[]>([]);
  const [expiredCount, setExpiredCount] = useState(0);
  const [draftType, setDraftType] = useState<OfflineDraftType>(
    () => draftTypesForRoles(principal.roleCodes)[0] ?? "MATERIAL_REQUIREMENT",
  );
  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [receivedQuantity, setReceivedQuantity] = useState("");
  const [damagedQuantity, setDamagedQuantity] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [gps, setGps] = useState<GpsEvidence | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [scanMode, setScanMode] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!runtimeUnlocked) return;
    let snapshot = await loadReferenceSnapshot(principal.userId);
    if (
      runtimeOnline &&
      (!snapshot || new Date(snapshot.expiresAt) <= new Date())
    ) {
      snapshot = await refreshReferenceData();
    }
    const [localDrafts, expired] = await Promise.all([
      listOfflineDrafts(principal.userId),
      expiredOfflineDrafts(principal.userId),
    ]);
    setReference(snapshot);
    setDrafts(localDrafts);
    setExpiredCount(
      expired.filter((draft) => draft.status !== "SYNCED").length,
    );
  }, [principal.userId, refreshReferenceData, runtimeOnline, runtimeUnlocked]);

  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [reload]);

  const sites = useMemo(
    () =>
      reference?.projects.find((project) => project.id === projectId)?.sites ??
      [],
    [projectId, reference],
  );
  const referenceExpired =
    !reference || new Date(reference.expiresAt) <= new Date();

  function captureGps() {
    setGpsError("");
    if (!navigator.geolocation) {
      setGpsError("Location capture is unavailable on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const evidence: GpsEvidence = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          source: "BROWSER_GEOLOCATION",
        };
        const result = validateGpsEvidence(evidence);
        if (!result.valid) {
          setGpsError("Location is invalid or stale. Capture it again.");
          return;
        }
        setGps(evidence);
      },
      (error) => {
        setGps(null);
        setGpsError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. GPS supports the site event audit trail; allow it and recapture."
            : "Location could not be captured. Move to an open area and retry.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function createDraft(queue: boolean) {
    setMessage("");
    if (!runtime.unlocked || !reference) {
      setMessage("Reconnect and authenticate before using encrypted drafts.");
      return;
    }
    if (referenceExpired && queue) {
      setMessage(
        "Reference data is expired. Reconnect and refresh before submission.",
      );
      return;
    }
    if (!projectId || !siteId) {
      setMessage("Select an assigned project and site.");
      return;
    }
    if (needsGps.has(draftType) && (!gps || !validateGpsEvidence(gps).valid)) {
      setMessage("Capture current GPS evidence for this workflow.");
      return;
    }
    if (needsEvidence.has(draftType) && !files.length) {
      setMessage("Add the required photo or scanned evidence.");
      return;
    }
    setSaving(true);
    try {
      const localDraftId = crypto.randomUUID();
      const attachmentIds: string[] = [];
      for (const item of files) {
        const file = await prepareImage(item);
        if (file.size > MAX_ATTACHMENT_BYTES)
          throw new Error(`${file.name} exceeds 50 MB.`);
        attachmentIds.push(
          await savePendingAttachment({
            ownerUserId: principal.userId,
            localDraftId,
            file,
            checksum: await sha256Hex(file),
            documentType: scanMode
              ? "MOBILE_DOCUMENT_SCAN"
              : "MOBILE_OPERATION_EVIDENCE",
          }),
        );
      }
      await saveOfflineDraft({
        localDraftId,
        ownerUserId: principal.userId,
        employeeId: principal.employeeId,
        status: queue ? "QUEUED" : "LOCAL_DRAFT",
        payload: {
          draftType,
          projectId,
          siteId,
          referenceVersion: reference.version,
          referenceExpiresAt: reference.expiresAt,
          deviceCapturedAt: new Date().toISOString(),
          gps: gps ?? undefined,
          attachmentIds,
          form: {
            materialId: materialId || undefined,
            referenceId: referenceId || undefined,
            quantity: quantity || undefined,
            receivedQuantity: receivedQuantity || undefined,
            damagedQuantity: damagedQuantity || undefined,
            remarks: remarks.trim(),
            voiceTextConfirmed: true,
          },
        },
      });
      setMessage(
        queue
          ? "Draft queued for synchronization."
          : "Encrypted local draft saved.",
      );
      files.forEach((item) => URL.revokeObjectURL(item.url));
      setFiles([]);
      setGps(null);
      setRemarks("");
      setQuantity("");
      await reload();
      if (queue && runtime.online) await runtime.synchronize();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Draft could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {expiredCount ? (
        <Alert variant="warning">
          {expiredCount} unsynchronized draft(s) passed the seven-day retention
          window. Review and explicitly discard or revise them before device
          cleanup.
        </Alert>
      ) : null}
      {!runtime.unlocked ? (
        <Alert variant="warning">
          Offline drafts are locked. An online authenticated session is required
          to unlock this device vault.
        </Alert>
      ) : null}
      {!allowedDraftTypes.length ? (
        <Alert>
          Your role uses the mobile approval, search and dashboard screens
          online, but it has no authorized offline draft type. Offline mode
          never grants additional transaction authority.
        </Alert>
      ) : null}
      {referenceExpired ? (
        <Alert variant="warning">
          Reference data is missing or expired. Local edits are allowed, but
          submission is blocked until a refresh.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Operational capture
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Offline capture creates a draft only. It cannot approve, post stock,
            issue a PO, verify an invoice, or post a payment.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {message ? (
            <Alert
              variant={
                message.includes("saved") || message.includes("queued")
                  ? "success"
                  : "error"
              }
            >
              {message}
            </Alert>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Workflow" htmlFor="offline-draft-type">
              <Select
                id="offline-draft-type"
                value={draftType}
                onChange={(event) =>
                  setDraftType(event.target.value as OfflineDraftType)
                }
              >
                {allowedDraftTypes.map((type) => (
                  <option key={type} value={type}>
                    {labels[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned project" htmlFor="offline-project">
              <Select
                id="offline-project"
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setSiteId("");
                }}
              >
                <option value="">Select project</option>
                {reference?.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.projectCode} · {project.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned site" htmlFor="offline-site">
              <Select
                id="offline-site"
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
              >
                <option value="">Select site</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.siteCode} · {site.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Material" htmlFor="offline-material">
              <Select
                id="offline-material"
                value={materialId}
                onChange={(event) => setMaterialId(event.target.value)}
              >
                <option value="">Select when applicable</option>
                {reference?.materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.materialCode} · {material.name} ·{" "}
                    {material.defaultUnit.symbol}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="PO / issue / transfer reference"
              htmlFor="offline-reference"
            >
              <Input
                id="offline-reference"
                value={referenceId}
                onChange={(event) => setReferenceId(event.target.value)}
                placeholder="Select or enter relevant reference"
              />
            </Field>
            <Field label="Quantity" htmlFor="offline-quantity">
              <Input
                id="offline-quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="0.000"
              />
            </Field>
            {draftType === "SITE_RECEIPT_ACKNOWLEDGMENT" ||
            draftType === "TRANSFER_RECEIPT" ||
            draftType === "DIRECT_SITE_GRN" ? (
              <>
                <Field label="Received quantity" htmlFor="offline-received">
                  <Input
                    id="offline-received"
                    inputMode="decimal"
                    value={receivedQuantity}
                    onChange={(event) =>
                      setReceivedQuantity(event.target.value)
                    }
                  />
                </Field>
                <Field label="Damaged quantity" htmlFor="offline-damaged">
                  <Input
                    id="offline-damaged"
                    inputMode="decimal"
                    value={damagedQuantity}
                    onChange={(event) => setDamagedQuantity(event.target.value)}
                  />
                </Field>
              </>
            ) : null}
          </div>

          <Field label="Remarks" htmlFor="offline-remarks">
            <VoiceRemarks value={remarks} onChange={setRemarks} />
          </Field>

          {needsGps.has(draftType) ? (
            <section
              className="rounded-xl border border-slate-200 p-4"
              aria-labelledby="gps-heading"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 id="gps-heading" className="font-semibold text-slate-950">
                    GPS evidence required
                  </h3>
                  <p className="text-sm text-slate-600">
                    Captured at the business event. GPS supports the audit trail
                    but does not prove identity or prevent spoofing.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={captureGps}>
                  <LocateFixed className="size-4" />
                  {gps ? "Recapture GPS" : "Capture GPS"}
                </Button>
              </div>
              {gps ? (
                <p className="mt-3 text-sm text-emerald-700">
                  Accuracy ±{Math.round(gps.accuracy)} m · captured{" "}
                  {new Date(gps.capturedAt).toLocaleTimeString()}
                </p>
              ) : null}
              {gpsError ? (
                <p role="alert" className="mt-3 text-sm text-red-700">
                  {gpsError}
                </p>
              ) : null}
            </section>
          ) : null}

          <section
            className="rounded-xl border border-slate-200 p-4"
            aria-labelledby="capture-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3
                  id="capture-heading"
                  className="font-semibold text-slate-950"
                >
                  Camera and document evidence
                </h3>
                <p className="text-sm text-slate-600">
                  Preview, rotate, enhance, retake, or remove before encrypted
                  storage.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={scanMode ? "primary" : "secondary"}
                onClick={() => setScanMode((value) => !value)}
              >
                <FileScan className="size-4" />
                {scanMode ? "Scan enhancement on" : "Document scan mode"}
              </Button>
            </div>
            <label className="mt-4 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 text-sm font-semibold text-slate-700 focus-within:ring-2 focus-within:ring-blue-600">
              <Camera className="size-5" /> Capture or choose files
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                capture="environment"
                multiple
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []).filter(
                    (file) => file.size <= MAX_ATTACHMENT_BYTES,
                  );
                  setFiles((current) => [
                    ...current,
                    ...selected.map((file) => ({
                      file,
                      url: file.type.startsWith("image/")
                        ? URL.createObjectURL(file)
                        : "",
                      rotation: 0,
                      grayscale: scanMode,
                    })),
                  ]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {files.map((item, index) => (
                <article
                  key={`${item.file.name}-${index}`}
                  className="overflow-hidden rounded-xl border border-slate-200"
                >
                  {item.url ? (
                    <Image
                      src={item.url}
                      alt={`Preview of ${item.file.name}`}
                      width={640}
                      height={360}
                      unoptimized
                      className="aspect-video w-full object-contain"
                      style={{
                        transform: `rotate(${item.rotation}deg)`,
                        filter: item.grayscale
                          ? "grayscale(1) contrast(1.2)"
                          : undefined,
                      }}
                    />
                  ) : (
                    <div className="grid aspect-video place-items-center bg-slate-50">
                      <FileScan className="size-10 text-slate-400" />
                    </div>
                  )}
                  <div className="space-y-2 p-3">
                    <p className="truncate text-sm font-semibold">
                      {item.file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(item.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        onClick={() =>
                          setFiles((current) =>
                            current.map((file, position) =>
                              position === index
                                ? {
                                    ...file,
                                    rotation: (file.rotation + 90) % 360,
                                  }
                                : file,
                            ),
                          )
                        }
                      >
                        <RotateCw className="size-4" /> Rotate
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((_, position) => position !== index),
                          )
                        }
                      >
                        <Trash2 className="size-4" /> Remove
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="sticky bottom-20 z-20 -mx-5 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row md:bottom-0">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 flex-1"
              disabled={
                saving || !runtime.unlocked || !allowedDraftTypes.length
              }
              onClick={() => void createDraft(false)}
            >
              <Save className="size-4" /> Save encrypted draft
            </Button>
            <Button
              type="button"
              className="min-h-11 flex-1"
              disabled={
                saving ||
                !runtime.unlocked ||
                referenceExpired ||
                !allowedDraftTypes.length
              }
              onClick={() => void createDraft(true)}
            >
              <CloudUpload className="size-4" />
              {saving
                ? "Saving..."
                : runtime.online
                  ? "Queue and synchronize"
                  : "Queue for reconnect"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-950">
                This device&apos;s encrypted drafts
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Only drafts owned by {principal.displayName} are visible in this
                unlocked session.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!runtime.online}
                onClick={() => void runtime.refreshReferenceData().then(reload)}
              >
                <RefreshCw className="size-4" /> Refresh references
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!runtime.online || runtime.syncing}
                onClick={() => void runtime.synchronize().then(reload)}
              >
                <CloudUpload className="size-4" /> Sync now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {drafts.map((draft) => (
            <article
              key={draft.localDraftId}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">
                    {labels[draft.payload.draftType]}
                  </p>
                  <p className="text-xs text-slate-500">
                    Updated {new Date(draft.updatedAt).toLocaleString()} ·
                    expires {new Date(draft.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {draft.status.replaceAll("_", " ")}
                </span>
              </div>
              {draft.lastError ? (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>Action required:</strong> {draft.lastError}
                  <p className="mt-1 text-xs">
                    Refresh references, revise or duplicate the local draft,
                    then submit again. Force overwrite is unavailable.
                  </p>
                </div>
              ) : null}
              {draft.serverRecordId ? (
                <p className="mt-3 text-xs text-emerald-700">
                  Server draft {draft.serverRecordId}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {draft.status !== "SYNCED" && draft.status !== "DISCARDED" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void updateOfflineDraftState(
                        principal.userId,
                        draft.localDraftId,
                        { status: "QUEUED", lastError: null },
                      ).then(reload)
                    }
                  >
                    Retry
                  </Button>
                ) : null}
                {draft.status === "USER_ACTION_REQUIRED" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void saveOfflineDraft({
                        ownerUserId: principal.userId,
                        employeeId: principal.employeeId,
                        payload: {
                          ...draft.payload,
                          deviceCapturedAt: new Date().toISOString(),
                        },
                        status: "LOCAL_DRAFT",
                      }).then(reload)
                    }
                  >
                    <Copy className="size-4" /> Duplicate
                  </Button>
                ) : null}
                {draft.status !== "SYNCED" && draft.status !== "DISCARDED" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="tertiary"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Discard this local draft? This cannot be undone.",
                        )
                      )
                        void discardOfflineDraft(
                          principal.userId,
                          draft.localDraftId,
                        ).then(reload);
                    }}
                  >
                    <Trash2 className="size-4" /> Discard
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
          {!drafts.length ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No encrypted drafts are stored for this user on this device.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-500">
        Offline schema v{OFFLINE_SCHEMA_VERSION}. Browser encryption reduces
        casual exposure but cannot protect a compromised or rooted device,
        malicious browser extension, screen capture, or an attacker controlling
        an unlocked OS profile.
      </p>
    </div>
  );
}
