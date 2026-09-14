"use client";
import { cloneElement, useActionState, useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { customerMovementAction } from "./customer-movement-actions";
import type { CustomerMovementWorkspace } from "./customer-movement-queries";
import {
  movementCommands,
  movementKinds,
  nextMovementState,
  nonUsableKinds,
  requiredMovementRole,
  type MovementKind,
} from "@/server/inventory/customer-movement-policy";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-slate-900";
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children as ReactElement<{ id: string }>, { id })}
    </div>
  );
}
function ActionForm({
  operation,
  children,
  label,
}: {
  operation: string;
  children: ReactNode;
  label: string;
}) {
  const [state, action, pending] = useActionState(customerMovementAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="operation" value={operation} />
      {children}
      <button
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : label}
      </button>
      <p
        role="status"
        className={
          state && !state.ok ? "text-sm text-red-700" : "text-sm text-green-800"
        }
      >
        {state?.ok ? "Saved successfully." : state?.error.message}
      </p>
    </form>
  );
}
function GpsFields() {
  const [position, setPosition] = useState<{
    latitude: number;
    longitude: number;
    capturedAt: string;
  }>();
  const [message, setMessage] = useState("");
  return (
    <div>
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm"
        onClick={() => {
          if (!navigator.geolocation) {
            setMessage("GPS is unavailable on this device.");
            return;
          }
          setMessage("Capturing GPS…");
          navigator.geolocation.getCurrentPosition(
            (p) => {
              setPosition({
                latitude: p.coords.latitude,
                longitude: p.coords.longitude,
                capturedAt: new Date(p.timestamp).toISOString(),
              });
              setMessage("GPS captured.");
            },
            () =>
              setMessage(
                "Allow location access and retry. Site operations cannot proceed without GPS.",
              ),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          );
        }}
      >
        Capture GPS
      </button>
      <p role="status" className="text-sm">
        {message}
      </p>
      <input name="latitude" type="hidden" value={position?.latitude ?? ""} />
      <input name="longitude" type="hidden" value={position?.longitude ?? ""} />
      <input
        name="capturedAt"
        type="hidden"
        value={position?.capturedAt ?? ""}
      />
    </div>
  );
}
function Reason() {
  return (
    <Field label="Reason">
      <textarea
        className={inputClass}
        name="reason"
        required
        minLength={3}
        maxLength={1000}
      />
    </Field>
  );
}
function Evidence({ files }: { files: CustomerMovementWorkspace["files"] }) {
  return (
    <Field label="Retained evidence">
      <select name="evidenceId" className={inputClass}>
        <option value="">Select uploaded evidence</option>
        {files.map((f) => (
          <option key={f.id} value={f.id}>
            {f.filename}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CustomerMovementWorkspaceView({
  workspace: w,
}: {
  workspace: CustomerMovementWorkspace;
}) {
  const [kind, setKind] = useState<MovementKind>(
    w.roleCodes.includes("SITE_SUPERVISOR") ? "ISSUE" : "TRANSFER",
  );
  const [materialId, setMaterialId] = useState(w.materials[0]?.id ?? "");
  const admin = w.roleCodes.includes("SYSTEM_ADMINISTRATOR");
  const creator =
    !admin &&
    w.roleCodes.some((r) => ["STORE_KEEPER", "SITE_SUPERVISOR"].includes(r));
  const kinds = movementKinds.filter((k) =>
    ["ISSUE", "RETURN"].includes(k)
      ? w.roleCodes.includes("SITE_SUPERVISOR")
      : w.roleCodes.includes("STORE_KEEPER"),
  );
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Dispatch reserves stock. Transfer quantity and carrying cost post
        together only on receipt. Every variance requires a separate MD-approved
        adjustment. No consumption register is used.
      </p>
      {w.negatives.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold">
            Temporary negative stock — correction required
          </h2>
          {w.negatives.map((n) => (
            <p key={n.id} className="mt-2 text-sm">
              {n.location} · {n.material} · deficit {n.deficit} · due{" "}
              {new Date(n.due).toLocaleDateString("en-IN")} · {n.reason}
            </p>
          ))}
        </section>
      )}
      {creator && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">New stock movement</h2>
            <ActionForm operation="create" label="Create request">
              <Field label="Movement type">
                <select
                  className={inputClass}
                  name="kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as MovementKind)}
                >
                  {kinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                {["sourceLocationId", "destinationLocationId"].map(
                  (name, i) => (
                    <Field
                      key={name}
                      label={i ? "Destination" : "Source location"}
                    >
                      <select
                        className={inputClass}
                        name={name}
                        required={
                          !i || ["ISSUE", "TRANSFER", "RETURN"].includes(kind)
                        }
                      >
                        <option value="">Select location</option>
                        {w.locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.type})
                          </option>
                        ))}
                      </select>
                    </Field>
                  ),
                )}
              </div>
              <Field label="Material">
                <select
                  className={inputClass}
                  name="materialId"
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                >
                  {w.materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <input
                type="hidden"
                name="unitId"
                value={
                  w.materials.find((m) => m.id === materialId)?.defaultUnitId ??
                  ""
                }
              />
              <Field
                label={
                  kind === "COUNT"
                    ? "Physically counted quantity"
                    : "Requested quantity"
                }
              >
                <input
                  className={inputClass}
                  name="quantity"
                  type="number"
                  step="0.001"
                  min={kind === "COUNT" ? 0 : 0.001}
                  required
                />
              </Field>
              {kind === "RETURN" && (
                <Field label="Original acknowledged issue">
                  <select
                    name="originalIssueId"
                    className={inputClass}
                    required
                  >
                    <option value="">Select original issue</option>
                    {w.movements
                      .filter(
                        (m) =>
                          m.kind === "ISSUE" && m.status === "ACKNOWLEDGED",
                      )
                      .map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.number} · {m.material}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              {kind === "ADJUSTMENT" && (
                <>
                  <Field label="Adjustment direction">
                    <select className={inputClass} name="direction">
                      <option value="OUT">Decrease</option>
                      <option value="IN">Increase</option>
                    </select>
                  </Field>
                  <Field label="Correction of posted adjustment (optional)">
                    <select name="correctionOfId" className={inputClass}>
                      <option value="">New adjustment</option>
                      {w.movements
                        .filter(
                          (m) =>
                            m.kind === "ADJUSTMENT" && m.status === "POSTED",
                        )
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.number}
                          </option>
                        ))}
                    </select>
                  </Field>
                </>
              )}
              {kind === "NON_USABLE" && (
                <>
                  <Field label="Classification">
                    <select className={inputClass} name="category">
                      {nonUsableKinds.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Disposition">
                    <select className={inputClass} name="disposition">
                      <option>DISPOSAL</option>
                      <option>SALE</option>
                    </select>
                  </Field>
                </>
              )}
              <Reason />
              <Evidence files={w.files} />
              <GpsFields />
            </ActionForm>
          </section>
          <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">
              Upload movement evidence
            </h2>
            <p className="mb-3 text-sm">
              Evidence is scanned before use and retained through eight
              financial-year ends. Upload before creating a count, adjustment,
              or non-usable record.
            </p>
            <ActionForm operation="upload" label="Upload and scan">
              <Field label="Evidence file">
                <input
                  className={inputClass}
                  type="file"
                  name="file"
                  required
                  accept="image/*,application/pdf"
                />
              </Field>
            </ActionForm>
          </section>
        </div>
      )}
      {!admin && w.roleCodes.includes("PROJECT_DIRECTOR") && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Project stock closure</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {["start_closure", "close_project"].map((operation) => (
              <ActionForm
                key={operation}
                operation={operation}
                label={
                  operation === "start_closure"
                    ? "Start / refresh Central Store transfers"
                    : "Complete project closure"
                }
              >
                <Field label="Project">
                  <select className={inputClass} name="projectId" required>
                    {w.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.stockClosure
                          ? ` — closure ${p.stockClosure.status}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                {operation === "start_closure" && (
                  <Field label="Central Store">
                    <select
                      className={inputClass}
                      name="centralLocationId"
                      required
                    >
                      {w.locations
                        .filter((l) => l.type === "CENTRAL_STORE")
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <Reason />
              </ActionForm>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Movement register</h2>
        <p className="mb-3 text-sm text-slate-500">
          Latest 150 accessible documents. Requests and terminal records cannot
          be edited.
        </p>
        <div className="grid gap-4 xl:grid-cols-2">
          {w.movements.map((m) => {
            const commands = admin
              ? []
              : movementCommands.filter((command) => {
                  try {
                    nextMovementState(
                      m.kind as MovementKind,
                      m.status,
                      command,
                    );
                    return w.roleCodes.includes(
                      requiredMovementRole(
                        m.kind as MovementKind,
                        command,
                        m.siteReceipt,
                      ),
                    );
                  } catch {
                    return false;
                  }
                });
            return (
              <article
                key={m.id}
                className="min-w-0 rounded-lg border bg-white p-4"
              >
                <h3 className="font-semibold">
                  {m.number} · {m.status}
                </h3>
                <p className="text-sm">
                  {m.material} · {m.quantity} {m.unit}
                  {m.actual !== null ? ` · actual ${m.actual}` : ""}
                </p>
                <p className="text-sm">
                  {m.source}
                  {m.destination ? ` → ${m.destination}` : ""}
                </p>
                <p className="break-words text-sm text-slate-600">{m.reason}</p>
                {m.cost !== null && (
                  <p className="text-sm">Carrying cost per unit: ₹{m.cost}</p>
                )}
                {m.hasEvidence && (
                  <a
                    className="text-sm underline"
                    href={`/inventory/movements/${m.id}/evidence`}
                  >
                    Download retained evidence
                  </a>
                )}
                {m.approvedQuantity && (
                  <p className="text-sm">
                    PM-approved limit: {m.approvedQuantity}
                  </p>
                )}
                {m.originalIssue && (
                  <p className="text-sm">Original issue: {m.originalIssue}</p>
                )}
                {m.variance && (
                  <p className="text-sm text-amber-800">
                    Variance: {m.variance}
                  </p>
                )}
                {commands.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer font-medium">
                      Available actions
                    </summary>
                    <ActionForm operation="transition" label="Apply transition">
                      <input type="hidden" name="id" value={m.id} />
                      <Field label="Action">
                        <select className={inputClass} name="command">
                          {commands.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Actual / excess quantity (when required)">
                        <input
                          className={inputClass}
                          name="quantity"
                          type="number"
                          step="0.001"
                          min="0"
                        />
                      </Field>
                      <Reason />
                      <Evidence files={w.files} />
                      <GpsFields />
                    </ActionForm>
                  </details>
                )}
              </article>
            );
          })}
        </div>
        {!w.movements.length && <p>No stock movement requests yet.</p>}
      </section>
    </div>
  );
}
