"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  saveRequirementDraftAction,
  type RequirementActionState,
} from "@/features/requirements/requirement-actions";
import type { RequirementWorkspace } from "@/features/requirements/requirement-queries";

type DraftRecord = RequirementWorkspace["requirements"][number];

type LineState = {
  key: number;
  materialId: string;
  quantity: string;
  notes: string;
};

let nextLineKey = 1;

function newLine(): LineState {
  return { key: nextLineKey++, materialId: "", quantity: "", notes: "" };
}

function fieldsFor(state: RequirementActionState) {
  return state && !state.ok ? state.error.fields : undefined;
}

export function RequirementDraftForm({
  projects,
  materials,
  requirement,
}: {
  projects: RequirementWorkspace["projects"];
  materials: RequirementWorkspace["materials"];
  requirement?: DraftRecord;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    saveRequirementDraftAction,
    null,
  );
  const [projectId, setProjectId] = useState(requirement?.project.id ?? "");
  const [siteId, setSiteId] = useState(requirement?.site.id ?? "");
  const [lines, setLines] = useState<LineState[]>(
    requirement?.lines.length
      ? requirement.lines.map((line) => ({
          key: nextLineKey++,
          materialId: line.materialId,
          quantity: line.quantity,
          notes: line.notes ?? "",
        }))
      : [newLine()],
  );
  const fields = fieldsFor(state);
  const sites = useMemo(
    () => projects.find((project) => project.id === projectId)?.sites ?? [],
    [projectId, projects],
  );

  useEffect(() => {
    if (state?.ok && !requirement)
      router.push(`/requirements/${state.data.id}`);
  }, [requirement, router, state]);

  function updateLine(index: number, values: Partial<LineState>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...values } : line,
      ),
    );
  }

  return (
    <form action={action} className="space-y-6">
      {requirement ? (
        <input type="hidden" name="requirementId" value={requirement.id} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Project"
          htmlFor={`requirement-project-${requirement?.id ?? "new"}`}
          error={fields?.projectId?.[0]}
        >
          <Select
            id={`requirement-project-${requirement?.id ?? "new"}`}
            name="projectId"
            value={projectId}
            required
            aria-invalid={Boolean(fields?.projectId)}
            onChange={(event) => {
              setProjectId(event.target.value);
              setSiteId("");
            }}
          >
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.projectCode}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Site"
          htmlFor={`requirement-site-${requirement?.id ?? "new"}`}
          error={fields?.siteId?.[0]}
        >
          <Select
            id={`requirement-site-${requirement?.id ?? "new"}`}
            name="siteId"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            disabled={!projectId}
            required
            aria-invalid={Boolean(fields?.siteId)}
          >
            <option value="">
              {projectId ? "Select site" : "Select a project first"}
            </option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} · {site.siteCode}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Needed by"
          htmlFor={`requirement-needed-${requirement?.id ?? "new"}`}
          error={fields?.neededBy?.[0]}
        >
          <Input
            id={`requirement-needed-${requirement?.id ?? "new"}`}
            name="neededBy"
            type="date"
            defaultValue={requirement?.neededBy}
            required
            aria-invalid={Boolean(fields?.neededBy)}
          />
        </Field>
        <Field
          label="Purpose"
          htmlFor={`requirement-purpose-${requirement?.id ?? "new"}`}
          error={fields?.purpose?.[0]}
        >
          <Input
            id={`requirement-purpose-${requirement?.id ?? "new"}`}
            name="purpose"
            defaultValue={requirement?.purpose}
            placeholder="Guest bathroom electrical rough-in"
            maxLength={500}
            required
            aria-invalid={Boolean(fields?.purpose)}
          />
        </Field>
        <div className="md:col-span-2">
          <Field
            label="Internal notes"
            htmlFor={`requirement-notes-${requirement?.id ?? "new"}`}
            error={fields?.notes?.[0]}
          >
            <Textarea
              id={`requirement-notes-${requirement?.id ?? "new"}`}
              name="notes"
              defaultValue={requirement?.notes ?? ""}
              maxLength={2_000}
              placeholder="Optional context for the project team"
              aria-invalid={Boolean(fields?.notes)}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-bold text-slate-950">
              Required materials
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Quantities use each material’s configured default unit.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={lines.length >= 50}
            onClick={() => setLines((current) => [...current, newLine()])}
          >
            <Plus className="size-4" />
            Add line
          </Button>
        </div>
        {fields?.lines?.[0] ? (
          <p className="text-sm text-red-700" role="alert">
            {fields.lines[0]}
          </p>
        ) : null}
        <div className="space-y-3">
          {lines.map((line, index) => {
            const material = materials.find(
              (item) => item.id === line.materialId,
            );
            const decimalScale = Math.min(
              material?.defaultUnit.decimalScale ?? 3,
              3,
            );
            const quantityStep =
              decimalScale === 0 ? "1" : `0.${"0".repeat(decimalScale - 1)}1`;
            return (
              <div
                key={line.key}
                className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(9rem,0.6fr)_minmax(0,1.5fr)_auto] lg:items-end"
              >
                <Field
                  label={`Material ${index + 1}`}
                  htmlFor={`requirement-material-${line.key}`}
                >
                  <Select
                    id={`requirement-material-${line.key}`}
                    name="materialId"
                    value={line.materialId}
                    onChange={(event) =>
                      updateLine(index, { materialId: event.target.value })
                    }
                    required
                  >
                    <option value="">Select material</option>
                    {materials.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.materialCode} ·{" "}
                        {item.defaultUnit.symbol}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label={`Quantity${material ? ` (${material.defaultUnit.symbol})` : ""}`}
                  htmlFor={`requirement-quantity-${line.key}`}
                >
                  <Input
                    id={`requirement-quantity-${line.key}`}
                    name="quantity"
                    type="number"
                    min={quantityStep}
                    step={quantityStep}
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                    required
                  />
                </Field>
                <Field
                  label="Line notes"
                  htmlFor={`requirement-line-notes-${line.key}`}
                >
                  <Input
                    id={`requirement-line-notes-${line.key}`}
                    name="lineNotes"
                    value={line.notes}
                    maxLength={500}
                    onChange={(event) =>
                      updateLine(index, { notes: event.target.value })
                    }
                    placeholder="Optional specification"
                  />
                </Field>
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  aria-label={`Remove material line ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((item) => item.key !== line.key),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                  <span className="lg:sr-only">Remove</span>
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !materials.length}>
          {requirement ? (
            <Save className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          {pending
            ? "Saving draft..."
            : requirement
              ? "Save draft"
              : "Create draft"}
        </Button>
        <p className="text-xs text-slate-500">
          Saving does not submit this requirement for approval.
        </p>
      </div>
      <FormFeedback
        state={state}
        success={requirement ? "Draft updated." : "Draft created."}
      />
    </form>
  );
}
