"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  acknowledgeSiteReceiptAction,
  attachGrnEvidenceAction,
} from "@/features/inventory/grn-evidence-actions";

export function GrnEvidenceControls({
  goodsReceiptId,
  canUpload,
  canAcknowledge,
  acknowledged,
}: {
  goodsReceiptId: string;
  canUpload: boolean;
  canAcknowledge: boolean;
  acknowledged: boolean;
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState(
    attachGrnEvidenceAction,
    null,
  );
  const [ackState, ackAction, ackPending] = useActionState(
    acknowledgeSiteReceiptAction,
    null,
  );

  return (
    <div className="space-y-4">
      {canUpload ? (
        <form
          action={uploadAction}
          className="space-y-3 rounded-lg border border-slate-200 p-3"
        >
          <input type="hidden" name="goodsReceiptId" value={goodsReceiptId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Evidence type"
              htmlFor={`evidence-type-${goodsReceiptId}`}
            >
              <Select
                id={`evidence-type-${goodsReceiptId}`}
                name="documentType"
                required
              >
                <option value="DELIVERY_CHALLAN">Delivery challan</option>
                <option value="MATERIAL_PHOTO">Material photo</option>
                <option value="SUPPLIER_INVOICE">Supplier invoice</option>
                <option value="RECEIVER_SIGNATURE">Receiver signature</option>
              </Select>
            </Field>
            <Field
              label="Evidence file"
              htmlFor={`evidence-file-${goodsReceiptId}`}
            >
              <Input
                id={`evidence-file-${goodsReceiptId}`}
                name="file"
                type="file"
                required
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Maximum 50 MB. Executables and files failing the local security scan
            are quarantined.
          </p>
          <Button type="submit" disabled={uploadPending}>
            {uploadPending ? "Scanning and attaching..." : "Attach evidence"}
          </Button>
          <FormFeedback
            state={uploadState}
            success="Clean evidence attached."
          />
        </form>
      ) : null}

      {canAcknowledge && !acknowledged ? (
        <form action={ackAction} className="space-y-3">
          <input type="hidden" name="goodsReceiptId" value={goodsReceiptId} />
          <Button type="submit" disabled={ackPending}>
            {ackPending ? "Acknowledging..." : "Acknowledge site receipt"}
          </Button>
          <FormFeedback state={ackState} success="Site receipt acknowledged." />
        </form>
      ) : null}

      {acknowledged ? (
        <p className="text-sm font-semibold text-emerald-700">
          Site Supervisor acknowledgment recorded.
        </p>
      ) : null}
    </div>
  );
}
