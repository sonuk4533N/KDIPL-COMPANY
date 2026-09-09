"use client";

import { useActionState, useMemo, useState } from "react";
import { PackageMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  createMaterialIssueDraftAction,
  type MaterialIssueActionState,
} from "@/features/inventory/material-issue-actions";
import type { InventoryWorkspace } from "@/features/inventory/inventory-queries";

function fieldsFor(state: MaterialIssueActionState) {
  return state && !state.ok ? state.error.fields : undefined;
}

export function MaterialIssueForm({
  balances,
  destinations,
}: {
  balances: InventoryWorkspace["stockBalances"];
  destinations: InventoryWorkspace["issueDestinations"];
}) {
  const [state, action, pending] = useActionState<
    MaterialIssueActionState,
    FormData
  >(createMaterialIssueDraftAction, null);
  const eligibleBalances = useMemo(
    () => balances.filter(({ quantityOnHand }) => Number(quantityOnHand) > 0),
    [balances],
  );
  const [balanceKey, setBalanceKey] = useState("");
  const selected = eligibleBalances.find(
    ({ locationId, materialId, unitId }) =>
      `${locationId}|${materialId}|${unitId}` === balanceKey,
  );
  const fields = fieldsFor(state);

  return (
    <form action={action} className="space-y-4">
      <input
        type="hidden"
        name="sourceLocationId"
        value={selected?.locationId ?? ""}
      />
      <input
        type="hidden"
        name="materialId"
        value={selected?.materialId ?? ""}
      />
      <input type="hidden" name="unitId" value={selected?.unitId ?? ""} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="Available stock"
          htmlFor="issue-stock-balance"
          error={fields?.sourceLocationId?.[0] ?? fields?.materialId?.[0]}
        >
          <Select
            id="issue-stock-balance"
            value={balanceKey}
            onChange={(event) => setBalanceKey(event.target.value)}
            required
          >
            <option value="">Select location and material</option>
            {eligibleBalances.map((balance) => {
              const key = `${balance.locationId}|${balance.materialId}|${balance.unitId}`;
              return (
                <option key={key} value={key}>
                  {balance.locationCode} · {balance.materialName} ·{" "}
                  {balance.quantityOnHand} {balance.unitSymbol}
                </option>
              );
            })}
          </Select>
        </Field>

        <Field
          label="Destination site"
          htmlFor="issue-destination-site"
          error={fields?.siteId?.[0]}
        >
          <Select id="issue-destination-site" name="siteId" required>
            <option value="">Select active site</option>
            {destinations.map((site) => (
              <option key={site.id} value={site.id}>
                {site.project.projectCode} · {site.name} ({site.siteCode})
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Issue quantity"
          htmlFor="issue-quantity"
          error={fields?.quantity?.[0]}
          hint={
            selected
              ? `Maximum currently available: ${selected.quantityOnHand} ${selected.unitSymbol}`
              : undefined
          }
        >
          <Input
            id="issue-quantity"
            name="quantity"
            type="number"
            min="0.001"
            max={selected?.quantityOnHand}
            step="0.001"
            required
          />
        </Field>

        <Field
          label="Purpose / work reference"
          htmlFor="issue-purpose"
          error={fields?.purpose?.[0]}
        >
          <Input
            id="issue-purpose"
            name="purpose"
            minLength={3}
            maxLength={500}
            placeholder="Work package, activity, or authorized purpose"
            required
          />
        </Field>
      </div>

      <Field
        label="Issue notes"
        htmlFor="issue-notes"
        error={fields?.notes?.[0]}
      >
        <Textarea
          id="issue-notes"
          name="notes"
          maxLength={2000}
          placeholder="Optional handling or delivery instructions"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending || !selected || !destinations.length}
        >
          <PackageMinus className="size-4" />
          {pending ? "Saving issue..." : "Create issue draft"}
        </Button>
        <p className="text-xs text-slate-500">
          A draft does not change stock. Posting creates the immutable stock-out
          entry.
        </p>
      </div>
      <FormFeedback state={state} success="Material issue draft created." />
    </form>
  );
}
