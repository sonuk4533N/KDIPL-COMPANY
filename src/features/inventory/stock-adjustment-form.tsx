"use client";

import { useActionState, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import type { InventoryWorkspace } from "@/features/inventory/inventory-queries";
import {
  createStockAdjustmentDraftAction,
  type StockAdjustmentActionState,
} from "@/features/inventory/stock-adjustment-actions";

function fieldsFor(state: StockAdjustmentActionState) {
  return state && !state.ok ? state.error.fields : undefined;
}

export function StockAdjustmentForm({
  locations,
  materials,
  balances,
}: {
  locations: InventoryWorkspace["locations"];
  materials: InventoryWorkspace["adjustmentMaterials"];
  balances: InventoryWorkspace["stockBalances"];
}) {
  const [state, action, pending] = useActionState<
    StockAdjustmentActionState,
    FormData
  >(createStockAdjustmentDraftAction, null);
  const [locationId, setLocationId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const selectedMaterial = materials.find(({ id }) => id === materialId);
  const available = useMemo(
    () =>
      balances.find(
        (balance) =>
          balance.locationId === locationId &&
          balance.materialId === materialId &&
          balance.unitId === selectedMaterial?.defaultUnitId,
      ),
    [balances, locationId, materialId, selectedMaterial?.defaultUnitId],
  );
  const canCreate =
    Boolean(locationId && selectedMaterial) &&
    (direction === "IN" || Number(available?.quantityOnHand ?? 0) > 0);
  const fields = fieldsFor(state);

  return (
    <form action={action} className="space-y-4">
      <input
        type="hidden"
        name="unitId"
        value={selectedMaterial?.defaultUnitId ?? ""}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="Adjustment location"
          htmlFor="adjustment-location"
          error={fields?.locationId?.[0]}
        >
          <Select
            id="adjustment-location"
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
          label="Adjustment material"
          htmlFor="adjustment-material"
          error={fields?.materialId?.[0]}
        >
          <Select
            id="adjustment-material"
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
          label="Adjustment direction"
          htmlFor="adjustment-direction"
          error={fields?.direction?.[0]}
        >
          <Select
            id="adjustment-direction"
            name="direction"
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as "IN" | "OUT")
            }
            required
          >
            <option value="OUT">Decrease stock</option>
            <option value="IN">Increase stock</option>
          </Select>
        </Field>
        <Field
          label="Adjustment quantity"
          htmlFor="adjustment-quantity"
          error={fields?.quantity?.[0]}
          hint={
            direction === "OUT" && locationId && materialId
              ? `Currently available: ${available?.quantityOnHand ?? "0.000"} ${selectedMaterial?.defaultUnit.symbol ?? ""}`
              : undefined
          }
        >
          <Input
            id="adjustment-quantity"
            name="quantity"
            type="number"
            min="0.001"
            max={
              direction === "OUT"
                ? (available?.quantityOnHand ?? "0")
                : undefined
            }
            step="0.001"
            required
          />
        </Field>
      </div>
      <Field
        label="Adjustment reason"
        htmlFor="adjustment-reason"
        error={fields?.reason?.[0]}
      >
        <Textarea
          id="adjustment-reason"
          name="reason"
          minLength={5}
          maxLength={1000}
          placeholder="Document the discrepancy, evidence, or correction basis"
          required
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !canCreate}>
          <SlidersHorizontal className="size-4" />
          {pending ? "Saving adjustment..." : "Create adjustment draft"}
        </Button>
        <p className="text-xs text-slate-500">
          No stock changes until an independent approval is posted.
        </p>
      </div>
      <FormFeedback state={state} success="Stock adjustment draft created." />
    </form>
  );
}
