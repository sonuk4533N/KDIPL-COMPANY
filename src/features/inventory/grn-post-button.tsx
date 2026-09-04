"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  postGoodsReceiptAction,
  type InventoryActionState,
} from "@/features/inventory/inventory-actions";

export function GrnPostButton({ goodsReceiptId }: { goodsReceiptId: string }) {
  const [state, action, pending] = useActionState<
    InventoryActionState,
    FormData
  >(postGoodsReceiptAction, null);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="goodsReceiptId" value={goodsReceiptId} />
      <Button type="submit" disabled={pending}>
        <CheckCircle2 className="size-4" />
        {pending ? "Posting..." : "Post GRN"}
      </Button>
      <FormFeedback state={state} success="GRN posted to stock." />
    </form>
  );
}
