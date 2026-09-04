"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  cancelGoodsReceiptAction,
  updateGoodsReceiptDraftAction,
} from "@/features/inventory/inventory-completion-actions";
import type { InventoryWorkspace } from "@/features/inventory/inventory-queries";

export function GrnDraftControls({
  receipt,
  locations,
}: {
  receipt: InventoryWorkspace["goodsReceipts"][number];
  locations: InventoryWorkspace["locations"];
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(
    updateGoodsReceiptDraftAction,
    null,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelGoodsReceiptAction,
    null,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Hide edit" : "Edit GRN draft"}
        </Button>
      </div>

      {editing ? (
        <form
          action={updateAction}
          className="space-y-4 rounded-lg border border-slate-200 p-4"
        >
          <input type="hidden" name="goodsReceiptId" value={receipt.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Receiving location"
              htmlFor={`grn-location-${receipt.id}`}
            >
              <Select
                id={`grn-location-${receipt.id}`}
                name="locationId"
                defaultValue={receipt.locationId}
                required
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.locationCode} · {location.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Received at" htmlFor={`grn-received-${receipt.id}`}>
              <Input
                id={`grn-received-${receipt.id}`}
                name="receivedAt"
                type="datetime-local"
                defaultValue={receipt.receivedAt?.slice(0, 16) ?? ""}
                required
              />
            </Field>
            <Field label="Delivery note" htmlFor={`grn-note-${receipt.id}`}>
              <Input
                id={`grn-note-${receipt.id}`}
                name="supplierDeliveryNote"
                defaultValue={receipt.supplierDeliveryNote ?? ""}
                maxLength={100}
              />
            </Field>
            <Field
              label="Delivery note date"
              htmlFor={`grn-note-date-${receipt.id}`}
            >
              <Input
                id={`grn-note-date-${receipt.id}`}
                name="supplierDeliveryNoteDate"
                type="date"
                defaultValue={receipt.supplierDeliveryNoteDate ?? ""}
              />
            </Field>
            <Field label="Vehicle number" htmlFor={`grn-vehicle-${receipt.id}`}>
              <Input
                id={`grn-vehicle-${receipt.id}`}
                name="vehicleNumber"
                defaultValue={receipt.vehicleNumber ?? ""}
                maxLength={50}
              />
            </Field>
            <Field
              label="Transporter"
              htmlFor={`grn-transporter-${receipt.id}`}
            >
              <Input
                id={`grn-transporter-${receipt.id}`}
                name="transporter"
                defaultValue={receipt.transporter ?? ""}
                maxLength={160}
              />
            </Field>
          </div>

          <div className="space-y-3">
            {receipt.lines.map((line) => (
              <div
                key={line.id}
                className="rounded-lg border border-slate-200 p-3"
              >
                <input
                  type="hidden"
                  name="goodsReceiptLineId"
                  value={line.id}
                />
                <p className="text-sm font-semibold text-slate-900">
                  {line.material.name} · ordered {line.orderedQuantity}{" "}
                  {line.unit.symbol}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Accepted" htmlFor={`accepted-${line.id}`}>
                    <Input
                      id={`accepted-${line.id}`}
                      name="acceptedQuantity"
                      type="number"
                      min="0"
                      step="0.001"
                      defaultValue={line.acceptedQuantity}
                      required
                    />
                  </Field>
                  <Field label="Damaged" htmlFor={`damaged-${line.id}`}>
                    <Input
                      id={`damaged-${line.id}`}
                      name="damagedQuantity"
                      type="number"
                      min="0"
                      step="0.001"
                      defaultValue={line.damagedQuantity}
                      required
                    />
                  </Field>
                  <Field label="Rejected" htmlFor={`rejected-${line.id}`}>
                    <Input
                      id={`rejected-${line.id}`}
                      name="rejectedQuantity"
                      type="number"
                      min="0"
                      step="0.001"
                      defaultValue={line.rejectedQuantity}
                      required
                    />
                  </Field>
                </div>
                <Field label="Line notes" htmlFor={`line-notes-${line.id}`}>
                  <Input
                    id={`line-notes-${line.id}`}
                    name="lineNotes"
                    defaultValue={line.notes ?? ""}
                    maxLength={500}
                  />
                </Field>
              </div>
            ))}
          </div>

          <Field label="GRN notes" htmlFor={`grn-notes-${receipt.id}`}>
            <Textarea
              id={`grn-notes-${receipt.id}`}
              name="notes"
              defaultValue={receipt.notes ?? ""}
              maxLength={2000}
            />
          </Field>
          <Button type="submit" disabled={updatePending}>
            {updatePending ? "Saving changes..." : "Save GRN draft"}
          </Button>
          <FormFeedback state={updateState} success="GRN draft updated." />
        </form>
      ) : null}

      <form
        action={cancelAction}
        className="space-y-3 rounded-lg border border-slate-200 p-4"
      >
        <input type="hidden" name="goodsReceiptId" value={receipt.id} />
        <Field label="Cancellation reason" htmlFor={`cancel-grn-${receipt.id}`}>
          <Input
            id={`cancel-grn-${receipt.id}`}
            name="reason"
            maxLength={1000}
            placeholder="Required reason"
            required
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={cancelPending}>
          {cancelPending ? "Cancelling GRN..." : "Cancel GRN draft"}
        </Button>
        <FormFeedback state={cancelState} success="GRN draft cancelled." />
      </form>
    </div>
  );
}
