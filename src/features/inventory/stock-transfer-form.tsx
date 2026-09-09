"use client";

import { useActionState, useMemo, useState } from "react";
import { Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import type { InventoryWorkspace } from "@/features/inventory/inventory-queries";
import {
  createStockTransferDraftAction,
  type StockTransferActionState,
} from "@/features/inventory/stock-transfer-actions";

function fieldsFor(state: StockTransferActionState) {
  return state && !state.ok ? state.error.fields : undefined;
}

export function StockTransferForm({
  balances,
  locations,
}: {
  balances: InventoryWorkspace["stockBalances"];
  locations: InventoryWorkspace["locations"];
}) {
  const [state, action, pending] = useActionState<
    StockTransferActionState,
    FormData
  >(createStockTransferDraftAction, null);
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
          label="Transfer stock"
          htmlFor="transfer-stock-balance"
          error={fields?.sourceLocationId?.[0] ?? fields?.materialId?.[0]}
        >
          <Select
            id="transfer-stock-balance"
            value={balanceKey}
            onChange={(event) => setBalanceKey(event.target.value)}
            required
          >
            <option value="">Select source and material</option>
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
          label="Destination location"
          htmlFor="transfer-destination"
          error={fields?.destinationLocationId?.[0]}
        >
          <Select
            id="transfer-destination"
            name="destinationLocationId"
            required
          >
            <option value="">Select active destination</option>
            {locations
              .filter(({ id }) => id !== selected?.locationId)
              .map((location) => (
                <option key={location.id} value={location.id}>
                  {location.locationCode} · {location.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field
          label="Transfer quantity"
          htmlFor="transfer-quantity"
          error={fields?.quantity?.[0]}
          hint={
            selected
              ? `Maximum currently available: ${selected.quantityOnHand} ${selected.unitSymbol}`
              : undefined
          }
        >
          <Input
            id="transfer-quantity"
            name="quantity"
            type="number"
            min="0.001"
            max={selected?.quantityOnHand}
            step="0.001"
            required
          />
        </Field>
        <Field
          label="Purpose"
          htmlFor="transfer-purpose"
          error={fields?.purpose?.[0]}
        >
          <Select
            id="transfer-purpose"
            name="purpose"
            defaultValue="ROUTINE"
            required
          >
            <option value="ROUTINE">Routine transfer</option>
            <option value="PROJECT_CLOSE">Project-close disposition</option>
          </Select>
        </Field>
      </div>
      <Field
        label="Transfer notes"
        htmlFor="transfer-notes"
        error={fields?.notes?.[0]}
      >
        <Textarea
          id="transfer-notes"
          name="notes"
          maxLength={2000}
          placeholder="Optional dispatch, vehicle, or handling reference"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending || !selected || locations.length < 2}
        >
          <Truck className="size-4" />
          {pending ? "Saving transfer..." : "Create transfer draft"}
        </Button>
        <p className="text-xs text-slate-500">
          Dispatch removes source stock; receipt adds it at the destination.
        </p>
      </div>
      <FormFeedback state={state} success="Stock transfer draft created." />
    </form>
  );
}
