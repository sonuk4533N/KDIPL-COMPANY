"use client";

import { useActionState, useMemo, useState } from "react";
import { PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  createGoodsReceiptDraftAction,
  type InventoryActionState,
} from "@/features/inventory/inventory-actions";
import type { InventoryWorkspace } from "@/features/inventory/inventory-queries";

function fieldsFor(state: InventoryActionState) {
  return state && !state.ok ? state.error.fields : undefined;
}

export function GoodsReceiptForm({
  purchaseOrders,
  locations,
}: {
  purchaseOrders: InventoryWorkspace["purchaseOrders"];
  locations: InventoryWorkspace["locations"];
}) {
  const [state, action, pending] = useActionState(
    createGoodsReceiptDraftAction,
    null,
  );
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const selectedPurchaseOrder = useMemo(
    () => purchaseOrders.find(({ id }) => id === purchaseOrderId),
    [purchaseOrderId, purchaseOrders],
  );
  const fields = fieldsFor(state);

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Purchase order" htmlFor="grn-po" error={fields?.purchaseOrderId?.[0]}>
          <Select
            id="grn-po"
            name="purchaseOrderId"
            value={purchaseOrderId}
            onChange={(event) => setPurchaseOrderId(event.target.value)}
            required
          >
            <option value="">Select supplier-accepted PO</option>
            {purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.poNumber} · {po.supplierName} · {po.site.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Receiving location" htmlFor="grn-location" error={fields?.locationId?.[0]}>
          <Select id="grn-location" name="locationId" required>
            <option value="">Select store/site store</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.locationCode} · {location.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Received date/time" htmlFor="grn-received-at" error={fields?.receivedAt?.[0]}>
          <Input id="grn-received-at" name="receivedAt" type="datetime-local" required />
        </Field>
        <Field label="Delivery challan / note" htmlFor="grn-note-no">
          <Input id="grn-note-no" name="supplierDeliveryNote" maxLength={100} />
        </Field>
        <Field label="Challan date" htmlFor="grn-note-date">
          <Input id="grn-note-date" name="supplierDeliveryNoteDate" type="date" />
        </Field>
        <Field label="Vehicle number" htmlFor="grn-vehicle">
          <Input id="grn-vehicle" name="vehicleNumber" maxLength={50} />
        </Field>
        <Field label="Transporter" htmlFor="grn-transporter">
          <Input id="grn-transporter" name="transporter" maxLength={160} />
        </Field>
      </div>

      {selectedPurchaseOrder ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-semibold">
              {selectedPurchaseOrder.poNumber} · {selectedPurchaseOrder.supplierName}
            </p>
            <p className="mt-1 text-xs text-blue-800">
              {selectedPurchaseOrder.project.name} · {selectedPurchaseOrder.site.name} · {selectedPurchaseOrder.status}
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Material</th>
                  <th className="px-3 py-3">PO qty</th>
                  <th className="px-3 py-3">Accepted</th>
                  <th className="px-3 py-3">Damaged</th>
                  <th className="px-3 py-3">Rejected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedPurchaseOrder.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-3">
                      <input type="hidden" name="purchaseOrderLineId" value={line.id} />
                      <p className="font-semibold text-slate-900">{line.material.name}</p>
                      <p className="text-xs text-slate-500">{line.material.materialCode}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {line.quantity} {line.unit.symbol}
                    </td>
                    <td className="px-3 py-3">
                      <Input name="acceptedQuantity" type="number" min="0" step="0.001" defaultValue="0" required />
                    </td>
                    <td className="px-3 py-3">
                      <Input name="damagedQuantity" type="number" min="0" step="0.001" defaultValue="0" required />
                    </td>
                    <td className="px-3 py-3">
                      <Input name="rejectedQuantity" type="number" min="0" step="0.001" defaultValue="0" required />
                      <input type="hidden" name="lineNotes" value="" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Field label="Receiving notes" htmlFor="grn-notes">
        <Textarea id="grn-notes" name="notes" maxLength={2000} placeholder="Condition, shortage, damage, rejection or receiving remarks" />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !selectedPurchaseOrder}>
          <PackageCheck className="size-4" />
          {pending ? "Saving GRN draft..." : "Create GRN draft"}
        </Button>
        <p className="text-xs text-slate-500">
          Creating a draft does not change stock. Stock increases only when the GRN is posted.
        </p>
      </div>
      <FormFeedback state={state} success="GRN draft created." />
    </form>
  );
}
