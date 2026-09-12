"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  postGoodsReceiptAction,
  verifyGoodsReceiptAction,
  type InventoryActionState,
} from "@/features/inventory/inventory-actions";

export function GrnPostButton({
  goodsReceiptId,
  mode,
}: {
  goodsReceiptId: string;
  mode: "verify" | "approve";
}) {
  const selectedAction =
    mode === "verify" ? verifyGoodsReceiptAction : postGoodsReceiptAction;
  const [state, action, pending] = useActionState<
    InventoryActionState,
    FormData
  >(selectedAction, null);
  const label =
    mode === "verify"
      ? pending
        ? "Verifying..."
        : "Verify physical receipt"
      : pending
        ? "Approving..."
        : "Approve and post GRN";

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="goodsReceiptId" value={goodsReceiptId} />
      {mode === "approve" ? (
        <Input
          name="excessApprovalReason"
          maxLength={1000}
          placeholder="Reason required only when accepted quantity exceeds PO"
        />
      ) : null}
      <Button type="submit" disabled={pending}>
        <CheckCircle2 className="size-4" />
        {label}
      </Button>
      <FormFeedback
        state={state}
        success={
          mode === "verify"
            ? "Physical receipt verified and sent for PM approval."
            : "GRN approved and posted to stock."
        }
      />
    </form>
  );
}
