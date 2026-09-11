"use client";

import { useActionState, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  createStockCountDraftAction,
  type StockCountActionState,
} from "@/features/inventory/stock-count-actions";
import type { InventoryWorkspace } from "@/features/inventory/inventory-queries";

function fieldsFor(state: StockCountActionState) {
  return state && !state.ok ? state.error.fields : undefined;
}

export function StockCountForm({
  locations,
  materials,
  balances,
}: {
  locations: InventoryWorkspace["locations"];
  materials: InventoryWorkspace["countMaterials"];
  balances: InventoryWorkspace["stockBalances"];
}) {
  const [state, action, pending] = useActionState<
    StockCountActionState,
    FormData
  >(createStockCountDraftAction, null);
  const [locationId, setLocationId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const selectedMaterial = materials.find(({ id }) => id === materialId);
  const bookQuantity = useMemo(
    () =>
      balances.find(
        (balance) =>
          balance.locationId === locationId &&
          balance.materialId === materialId &&
          balance.unitId === selectedMaterial?.defaultUnitId,
      )?.quantityOnHand ?? "0.000",
    [balances, locationId, materialId, selectedMaterial?.defaultUnitId],
  );
  const fields = fieldsFor(state);
  const [localDateTime] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  });

  return (
    <form action={action} className="space-y-4">
      <input
        type="hidden"
        name="unitId"
        value={selectedMaterial?.defaultUnitId ?? ""}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="Count location"
          htmlFor="count-location"
          error={fields?.locationId?.[0]}
        >
          <Select
            id="count-location"
            name="locationId"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            required
          >
            <option value="">Select active location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.locationCode} · {location.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Counted material"
          htmlFor="count-material"
          error={fields?.materialId?.[0]}
        >
          <Select
            id="count-material"
            name="materialId"
            value={materialId}
            onChange={(event) => setMaterialId(event.target.value)}
            required
          >
            <option value="">Select active material</option>
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.materialCode} · {material.name} (
                {material.defaultUnit.symbol})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Count performed at"
          htmlFor="counted-at"
          error={fields?.countedAt?.[0]}
        >
          <Input
            id="counted-at"
            name="countedAt"
            type="datetime-local"
            defaultValue={localDateTime}
            max={localDateTime}
            required
          />
        </Field>
        <Field
          label="Physical quantity"
          htmlFor="counted-quantity"
          error={fields?.countedQuantity?.[0]}
          hint={
            locationId && materialId
              ? `Book quantity snapshot: ${bookQuantity} ${selectedMaterial?.defaultUnit.symbol ?? ""}`
              : undefined
          }
        >
          <Input
            id="counted-quantity"
            name="countedQuantity"
            type="number"
            min="0"
            max="999999999"
            step="0.001"
            required
          />
        </Field>
      </div>
      <Field
        label="Count notes"
        htmlFor="count-notes"
        error={fields?.notes?.[0]}
      >
        <Textarea
          id="count-notes"
          name="notes"
          maxLength={1000}
          placeholder="Count method, witness, sheet reference, or relevant conditions"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending || !locationId || !selectedMaterial}
        >
          <ClipboardList className="size-4" />
          {pending ? "Saving count..." : "Create count draft"}
        </Button>
        <p className="text-xs text-slate-500">
          The current book quantity is captured when the draft is created.
        </p>
      </div>
      <FormFeedback state={state} success="Physical count draft created." />
    </form>
  );
}
