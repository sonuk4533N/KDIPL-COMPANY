"use client";

import { useActionState, useState } from "react";
import { Recycle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  createMaterialReconciliationDraftAction,
  type MaterialReconciliationActionState,
} from "@/features/inventory/material-reconciliation-actions";
import type { InventoryWorkspace } from "@/features/inventory/inventory-queries";

function fieldsFor(state: MaterialReconciliationActionState) {
  return state && !state.ok ? state.error.fields : undefined;
}

export function MaterialReconciliationForm({
  issueLines,
  locations,
}: {
  issueLines: InventoryWorkspace["reconcilableIssueLines"];
  locations: InventoryWorkspace["locations"];
}) {
  const [state, action, pending] = useActionState<
    MaterialReconciliationActionState,
    FormData
  >(createMaterialReconciliationDraftAction, null);
  const [lineId, setLineId] = useState("");
  const [returnedQuantity, setReturnedQuantity] = useState("0");
  const [purpose, setPurpose] = useState<"ROUTINE" | "PROJECT_CLOSE">(
    "ROUTINE",
  );
  const selected = issueLines.find(({ id }) => id === lineId);
  const fields = fieldsFor(state);
  const maximum = selected?.remainingQuantity ?? "0";
  const returnRequired = Number(returnedQuantity) > 0;

  return (
    <form action={action} className="space-y-4">
      <Field
        label="Acknowledged issued material"
        htmlFor="reconciliation-issue-line"
        error={fields?.materialIssueLineId?.[0]}
      >
        <Select
          id="reconciliation-issue-line"
          name="materialIssueLineId"
          value={lineId}
          onChange={(event) => setLineId(event.target.value)}
          required
        >
          <option value="">Select material with quantity remaining</option>
          {issueLines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.issueNumber} · {line.site?.name ?? line.project.name} ·{" "}
              {line.material.materialCode} · {line.remainingQuantity}{" "}
              {line.unit.symbol} remaining
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Consumed"
          htmlFor="reconciliation-consumed"
          error={fields?.consumedQuantity?.[0]}
        >
          <Input
            id="reconciliation-consumed"
            name="consumedQuantity"
            type="number"
            min="0"
            max={maximum}
            step="0.001"
            defaultValue="0"
            required
          />
        </Field>
        <Field
          label="Unused return"
          htmlFor="reconciliation-returned"
          error={fields?.returnedQuantity?.[0]}
        >
          <Input
            id="reconciliation-returned"
            name="returnedQuantity"
            type="number"
            min="0"
            max={maximum}
            step="0.001"
            value={returnedQuantity}
            onChange={(event) => setReturnedQuantity(event.target.value)}
            required
          />
        </Field>
        <Field
          label="Wastage"
          htmlFor="reconciliation-wastage"
          error={fields?.wastageQuantity?.[0]}
        >
          <Input
            id="reconciliation-wastage"
            name="wastageQuantity"
            type="number"
            min="0"
            max={maximum}
            step="0.001"
            defaultValue="0"
            required
          />
        </Field>
        <Field
          label="Scrap"
          htmlFor="reconciliation-scrap"
          error={fields?.scrapQuantity?.[0]}
        >
          <Input
            id="reconciliation-scrap"
            name="scrapQuantity"
            type="number"
            min="0"
            max={maximum}
            step="0.001"
            defaultValue="0"
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="Reconciliation purpose"
          htmlFor="reconciliation-purpose"
          error={fields?.purpose?.[0]}
          hint={
            purpose === "PROJECT_CLOSE"
              ? `All ${maximum} remaining units must be classified.`
              : "Partial reconciliation is allowed."
          }
        >
          <Select
            id="reconciliation-purpose"
            name="purpose"
            value={purpose}
            onChange={(event) =>
              setPurpose(event.target.value as "ROUTINE" | "PROJECT_CLOSE")
            }
            required
          >
            <option value="ROUTINE">Routine / partial reconciliation</option>
            <option value="PROJECT_CLOSE">
              Final project-close disposition
            </option>
          </Select>
        </Field>
        <Field
          label="Unused-material return location"
          htmlFor="reconciliation-return-location"
          error={fields?.returnLocationId?.[0]}
          hint="Required only when unused material is returned to controlled stock."
        >
          <Select
            id="reconciliation-return-location"
            name="returnLocationId"
            disabled={!returnRequired}
            required={returnRequired}
          >
            <option value="">Select active return location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.locationCode} · {location.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Reconciliation evidence"
        htmlFor="reconciliation-notes"
        error={fields?.notes?.[0]}
      >
        <Textarea
          id="reconciliation-notes"
          name="notes"
          minLength={3}
          maxLength={1000}
          placeholder="Work completed, unused return handover, wastage basis, scrap evidence, or project-close reference"
          required
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !selected}>
          <Recycle className="size-4" />
          {pending ? "Saving reconciliation..." : "Create reconciliation draft"}
        </Button>
        {selected ? (
          <p className="text-xs text-slate-500">
            Issued {selected.issuedQuantity} · Previously reconciled{" "}
            {selected.reconciledQuantity} · Remaining{" "}
            {selected.remainingQuantity} {selected.unit.symbol}
          </p>
        ) : null}
      </div>
      <FormFeedback
        state={state}
        success="Material reconciliation draft created."
      />
    </form>
  );
}
