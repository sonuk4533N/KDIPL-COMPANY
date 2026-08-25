"use client";

import { useActionState } from "react";
import { Check, FileUp, Send, Star, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  cancelRfqAction,
  decideRfqAction,
  issueRfqAction,
  recommendQuotationAction,
  recordSupplierQuotationAction,
} from "@/features/procurement/rfq-actions";
import type { RfqDetail } from "@/features/procurement/rfq-queries";

type Rfq = RfqDetail["rfq"];

export function IssueRfqForm({ rfqId }: { rfqId: string }) {
  const [state, action, pending] = useActionState(issueRfqAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="rfqId" value={rfqId} />
      <Button type="submit" disabled={pending}>
        <Send className="size-4" />
        {pending ? "Issuing..." : "Issue RFQ"}
      </Button>
      <p className="text-xs text-slate-500">
        Requires at least three active suppliers. Issue locks the RFQ scope.
      </p>
      <FormFeedback state={state} success="RFQ issued." />
    </form>
  );
}

export function QuotationCaptureForm({ rfq }: { rfq: Rfq }) {
  const [state, action, pending] = useActionState(
    recordSupplierQuotationAction,
    null,
  );
  const fields = state && !state.ok ? state.error.fields : undefined;
  const recordedSupplierIds = new Set(
    rfq.quotations.map(({ supplierId }) => supplierId),
  );
  const availableSuppliers = rfq.invitedSuppliers.filter(
    ({ supplier }) => !recordedSupplierIds.has(supplier.id),
  );
  if (!availableSuppliers.length) {
    return (
      <p className="text-sm text-slate-500">
        All invited supplier quotations are recorded.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="rfqId" value={rfq.id} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field
          label="Supplier"
          htmlFor="quote-supplier"
          error={fields?.supplierId?.[0]}
        >
          <Select id="quote-supplier" name="supplierId" required>
            <option value="">Select invited supplier</option>
            {availableSuppliers.map(({ supplier }) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.tradeName ?? supplier.legalName} ·{" "}
                {supplier.supplierCode}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Supplier quote reference"
          htmlFor="quote-reference"
          error={fields?.quoteReference?.[0]}
        >
          <Input
            id="quote-reference"
            name="quoteReference"
            maxLength={100}
            required
          />
        </Field>
        <Field
          label="Quote date"
          htmlFor="quote-date"
          error={fields?.quoteDate?.[0]}
        >
          <Input id="quote-date" name="quoteDate" type="date" required />
        </Field>
        <Field
          label="Valid until"
          htmlFor="quote-valid"
          error={fields?.validUntil?.[0]}
        >
          <Input id="quote-valid" name="validUntil" type="date" required />
        </Field>
        <Field
          label="Offered delivery"
          htmlFor="quote-delivery"
          error={fields?.offeredDeliveryDate?.[0]}
        >
          <Input
            id="quote-delivery"
            name="offeredDeliveryDate"
            type="date"
            required
          />
        </Field>
        <Field
          label="GST rate (%)"
          htmlFor="quote-gst"
          error={fields?.gstRate?.[0]}
        >
          <Input
            id="quote-gst"
            name="gstRate"
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
          />
        </Field>
        <Field
          label="Freight amount (INR)"
          htmlFor="quote-freight"
          error={fields?.freightAmount?.[0]}
        >
          <Input
            id="quote-freight"
            name="freightAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            required
          />
        </Field>
        <Field
          label="Payment terms"
          htmlFor="quote-payment"
          error={fields?.paymentTerms?.[0]}
        >
          <Input
            id="quote-payment"
            name="paymentTerms"
            maxLength={500}
            required
          />
        </Field>
        <Field
          label="Quotation document"
          htmlFor="quote-document"
          error={fields?.document?.[0]}
          hint="PDF, JPG, PNG, or WebP within the configured upload limit."
        >
          <Input
            id="quote-document"
            name="document"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            required
          />
        </Field>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Unit prices</h3>
        {fields?.linePrices?.[0] ? (
          <p className="mt-1 text-sm text-red-700">{fields.linePrices[0]}</p>
        ) : null}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {rfq.requirement.lines.map((line) => (
            <div
              key={line.id}
              className="rounded-lg border border-slate-200 p-3"
            >
              <input type="hidden" name="requirementLineId" value={line.id} />
              <Field
                label={`${line.material.name} · ${line.quantity} ${line.unit.symbol}`}
                htmlFor={`quote-price-${line.id}`}
              >
                <Input
                  id={`quote-price-${line.id}`}
                  name="unitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit price (INR)"
                  required
                />
              </Field>
            </div>
          ))}
        </div>
      </div>
      <Field
        label="Quotation notes"
        htmlFor="quote-notes"
        error={fields?.notes?.[0]}
      >
        <Textarea id="quote-notes" name="notes" maxLength={2_000} />
      </Field>
      <Button type="submit" disabled={pending}>
        <FileUp className="size-4" />
        {pending ? "Recording..." : "Record quotation"}
      </Button>
      <FormFeedback state={state} success="Supplier quotation recorded." />
    </form>
  );
}

export function RecommendationForm({ rfq }: { rfq: Rfq }) {
  const [state, action, pending] = useActionState(
    recommendQuotationAction,
    null,
  );
  const fields = state && !state.ok ? state.error.fields : undefined;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="rfqId" value={rfq.id} />
      <Field
        label="Recommended quotation"
        htmlFor="recommended-quotation"
        error={fields?.quotationId?.[0]}
      >
        <Select id="recommended-quotation" name="quotationId" required>
          <option value="">Select supplier quotation</option>
          {rfq.quotations.map((quotation) => (
            <option key={quotation.id} value={quotation.id}>
              {quotation.supplier.tradeName ?? quotation.supplier.legalName} ·
              INR {quotation.landedTotal}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Recommendation justification"
        htmlFor="recommendation-reason"
        error={fields?.reason?.[0]}
      >
        <Textarea
          id="recommendation-reason"
          name="reason"
          maxLength={1_000}
          required
        />
      </Field>
      <Button type="submit" disabled={pending}>
        <Star className="size-4" />
        {pending ? "Submitting..." : "Submit recommendation"}
      </Button>
      <FormFeedback state={state} success="Recommendation submitted." />
    </form>
  );
}

export function RfqDecisionForm({ rfqId }: { rfqId: string }) {
  const [state, action, pending] = useActionState(decideRfqAction, null);
  const fields = state && !state.ok ? state.error.fields : undefined;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="rfqId" value={rfqId} />
      <Field
        label="Decision reason"
        htmlFor="rfq-decision-reason"
        error={fields?.reason?.[0]}
        hint="Required for rejection or send-back."
      >
        <Textarea id="rfq-decision-reason" name="reason" maxLength={1_000} />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          name="decision"
          value="APPROVE"
          disabled={pending}
        >
          <Check className="size-4" /> Approve and create draft PO
        </Button>
        <Button
          type="submit"
          name="decision"
          value="SEND_BACK"
          variant="secondary"
          disabled={pending}
        >
          <Send className="size-4" /> Send back
        </Button>
        <Button
          type="submit"
          name="decision"
          value="REJECT"
          variant="destructive"
          disabled={pending}
        >
          <X className="size-4" /> Reject
        </Button>
      </div>
      <FormFeedback state={state} success="Decision recorded." />
    </form>
  );
}

export function CancelRfqForm({ rfqId }: { rfqId: string }) {
  const [state, action, pending] = useActionState(cancelRfqAction, null);
  const fields = state && !state.ok ? state.error.fields : undefined;
  return (
    <form action={action} className="space-y-3 border-t border-slate-200 pt-4">
      <input type="hidden" name="rfqId" value={rfqId} />
      <Field
        label="Cancellation reason"
        htmlFor="rfq-cancel-reason"
        error={fields?.reason?.[0]}
      >
        <Textarea
          id="rfq-cancel-reason"
          name="reason"
          maxLength={1_000}
          required
        />
      </Field>
      <Button type="submit" variant="destructive" disabled={pending}>
        <X className="size-4" /> {pending ? "Cancelling..." : "Cancel RFQ"}
      </Button>
      <FormFeedback state={state} success="RFQ cancelled." />
    </form>
  );
}
