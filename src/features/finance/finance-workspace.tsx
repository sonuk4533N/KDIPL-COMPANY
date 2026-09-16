"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { financeAction, type FinanceActionState } from "./finance-actions";
import type { FinanceWorkspace } from "./finance-queries";

const input =
  "mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900";

function Result({ state }: { state: FinanceActionState }) {
  return (
    <p
      role="status"
      className={
        state && !state.ok ? "text-sm text-red-700" : "text-sm text-green-800"
      }
    >
      {state?.ok ? "Saved successfully." : state?.error.message}
    </p>
  );
}

function ActionForm({
  operation,
  children,
  label,
  payload,
}: {
  operation: string;
  children: ReactNode;
  label: string;
  payload?: unknown;
}) {
  const [state, action, pending] = useActionState(financeAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="operation" value={operation} />
      {payload !== undefined && (
        <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      )}
      {children}
      <button
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : label}
      </button>
      <Result state={state} />
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

const routes = [
  ["Invoices", "/accounts/invoices"],
  ["New invoice", "/accounts/invoices/new"],
  ["Three-way match", "/accounts/matching"],
  ["Payments", "/accounts/payments"],
  ["Advances", "/accounts/advances"],
  ["Credit/debit notes", "/accounts/notes"],
  ["Tax settings", "/accounts/tax-settings"],
  ["Tally export", "/accounts/tally"],
  ["Reports", "/accounts/reports"],
] as const;

export type FinanceMode =
  | "overview"
  | "invoices"
  | "new-invoice"
  | "matching"
  | "payments"
  | "advances"
  | "notes"
  | "tax"
  | "tally"
  | "reports";

function FinanceNav() {
  return (
    <nav
      aria-label="Accounts workspace"
      className="flex gap-2 overflow-x-auto pb-2"
    >
      {routes.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          className="whitespace-nowrap rounded-full border bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function DocumentUpload() {
  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-lg font-semibold">
        Secure financial document upload
      </h2>
      <p className="mb-3 text-sm text-slate-600">
        Files are signature-scanned and retained for eight financial years.
        Maximum 50 MB.
      </p>
      <ActionForm operation="upload" label="Upload and scan">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Document type">
            <select name="documentType" className={input}>
              <option value="SUPPLIER_INVOICE">Supplier invoice</option>
              <option value="PAYMENT_PROOF">Payment proof</option>
              <option value="ADVANCE_PAYMENT_EVIDENCE">Advance evidence</option>
              <option value="CREDIT_NOTE">Credit note</option>
              <option value="DEBIT_NOTE">Debit note</option>
              <option value="TAX_SUPPORTING_DOCUMENT">Tax support</option>
            </select>
          </Field>
          <Field label="Financial document">
            <input
              className={input}
              type="file"
              name="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              required
            />
          </Field>
        </div>
      </ActionForm>
    </section>
  );
}

type DraftLine = {
  purchaseOrderLineId: string;
  goodsReceiptLineId: string;
  hsnSac: string;
  quantity: string;
  unitPrice: string;
  discountBeforeTax: string;
  discountAfterTax: string;
  freightAmount: string;
  freightTaxable: boolean;
  taxRuleVersionId: string;
  tdsRuleVersionId: string;
  cessRuleVersionId: string;
  reverseCharge: boolean;
  inputTaxCreditEligible: boolean;
};

function InvoiceComposer({ w }: { w: FinanceWorkspace }) {
  const gst = w.taxRules.find((rule) => rule.kind === "GST")?.id ?? "";
  const blank = (): DraftLine => ({
    purchaseOrderLineId: "",
    goodsReceiptLineId: "",
    hsnSac: "",
    quantity: "",
    unitPrice: "",
    discountBeforeTax: "0",
    discountAfterTax: "0",
    freightAmount: "0",
    freightTaxable: false,
    taxRuleVersionId: gst,
    tdsRuleVersionId: "",
    cessRuleVersionId: "",
    reverseCharge: false,
    inputTaxCreditEligible: true,
  });
  const [supplierId, setSupplierId] = useState(w.suppliers[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [placeOfSupply, setPlaceOfSupply] = useState("Haryana");
  const [creditTermsSource, setCreditTermsSource] = useState<
    "SUPPLIER" | "PURCHASE_ORDER"
  >("SUPPLIER");
  const [dueDate, setDueDate] = useState("");
  const [dueReason, setDueReason] = useState("");
  const [roundOff, setRoundOff] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blank()]);
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("kdipl-phase7-invoice-draft");
        if (saved) {
          const draft = JSON.parse(saved) as {
            supplierId?: string;
            invoiceNumber?: string;
            invoiceDate?: string;
            placeOfSupply?: string;
            creditTermsSource?: "SUPPLIER" | "PURCHASE_ORDER";
            dueDate?: string;
            dueReason?: string;
            roundOff?: string;
            remarks?: string;
            documentId?: string;
            lines?: DraftLine[];
          };
          if (draft.supplierId) setSupplierId(draft.supplierId);
          if (draft.invoiceNumber) setInvoiceNumber(draft.invoiceNumber);
          if (draft.invoiceDate) setInvoiceDate(draft.invoiceDate);
          if (draft.placeOfSupply) setPlaceOfSupply(draft.placeOfSupply);
          if (draft.creditTermsSource)
            setCreditTermsSource(draft.creditTermsSource);
          if (draft.dueDate) setDueDate(draft.dueDate);
          if (draft.dueReason) setDueReason(draft.dueReason);
          if (draft.roundOff) setRoundOff(draft.roundOff);
          if (draft.remarks) setRemarks(draft.remarks);
          if (draft.documentId) setDocumentId(draft.documentId);
          if (draft.lines?.length) setLines(draft.lines);
        }
      } catch {
        localStorage.removeItem("kdipl-phase7-invoice-draft");
      }
      setOfflineReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!offlineReady) return;
    localStorage.setItem(
      "kdipl-phase7-invoice-draft",
      JSON.stringify({
        supplierId,
        invoiceNumber,
        invoiceDate,
        placeOfSupply,
        creditTermsSource,
        dueDate,
        dueReason,
        roundOff,
        remarks,
        documentId,
        lines,
      }),
    );
  }, [
    creditTermsSource,
    documentId,
    dueDate,
    dueReason,
    invoiceDate,
    invoiceNumber,
    lines,
    offlineReady,
    placeOfSupply,
    remarks,
    roundOff,
    supplierId,
  ]);
  const supplier = w.suppliers.find((item) => item.id === supplierId);
  const supplierPoIds = new Set(
    w.purchaseOrders
      .filter((po) => po.supplierId === supplierId)
      .map((po) => po.id),
  );
  const eligibleLines = w.poLines.filter((line) =>
    supplierPoIds.has(line.purchaseOrderId),
  );
  const setLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  const payload = useMemo(() => {
    const chosen = lines.map((line) => {
      const grn = w.grnLines.find(
        (item) => item.id === line.goodsReceiptLineId,
      );
      return {
        purchaseOrderLineId: line.purchaseOrderLineId,
        hsnSac: line.hsnSac,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountBeforeTax: line.discountBeforeTax,
        discountAfterTax: line.discountAfterTax,
        freightAmount: line.freightAmount,
        freightTaxable: line.freightTaxable,
        taxRuleVersionId: line.taxRuleVersionId,
        tdsRuleVersionId: line.tdsRuleVersionId || undefined,
        cessRuleVersionId: line.cessRuleVersionId || undefined,
        reverseCharge: line.reverseCharge,
        inputTaxCreditEligible: line.inputTaxCreditEligible,
        allocations: [
          {
            goodsReceiptLineId: line.goodsReceiptLineId,
            quantity: line.quantity,
          },
        ],
        goodsReceiptId: grn?.goodsReceiptId,
      };
    });
    const purchaseOrderIds = Array.from(
      new Set(
        chosen
          .map(
            (line) =>
              w.poLines.find((poLine) => poLine.id === line.purchaseOrderLineId)
                ?.purchaseOrderId,
          )
          .filter((id): id is string => !!id),
      ),
    );
    const goodsReceiptIds = Array.from(
      new Set(
        chosen
          .map((line) => line.goodsReceiptId)
          .filter((id): id is string => !!id),
      ),
    );
    return {
      supplierId,
      supplierInvoiceNumber: invoiceNumber,
      invoiceDate,
      placeOfSupply,
      purchaseOrderIds,
      goodsReceiptIds,
      creditDays: supplier?.creditDays ?? 30,
      creditTermsSource,
      dueDate: dueDate || undefined,
      dueDateOverrideReason: dueReason || undefined,
      roundOff,
      remarks,
      documentId: documentId || undefined,
      lines: chosen.map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        hsnSac: line.hsnSac,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountBeforeTax: line.discountBeforeTax,
        discountAfterTax: line.discountAfterTax,
        freightAmount: line.freightAmount,
        freightTaxable: line.freightTaxable,
        taxRuleVersionId: line.taxRuleVersionId,
        tdsRuleVersionId: line.tdsRuleVersionId,
        cessRuleVersionId: line.cessRuleVersionId,
        reverseCharge: line.reverseCharge,
        inputTaxCreditEligible: line.inputTaxCreditEligible,
        allocations: line.allocations,
      })),
    };
  }, [
    creditTermsSource,
    documentId,
    dueDate,
    dueReason,
    invoiceDate,
    invoiceNumber,
    lines,
    placeOfSupply,
    remarks,
    roundOff,
    supplier?.creditDays,
    supplierId,
    w.grnLines,
    w.poLines,
  ]);
  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-lg font-semibold">New supplier invoice draft</h2>
      <p className="mb-4 text-sm text-slate-600">
        Totals are recalculated on the server. A draft can span multiple POs and
        posted GRNs.
      </p>
      <p className="mb-4 text-xs text-slate-500">
        Draft fields are saved on this device for offline recovery. Submission,
        matching, approval and payment always require the server.
      </p>
      <ActionForm
        operation="invoice_create"
        label="Save invoice draft"
        payload={payload}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Supplier">
            <select
              className={input}
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              {w.suppliers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.gstin ?? "unregistered"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier invoice number">
            <input
              className={input}
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              required
            />
          </Field>
          <Field label="Invoice date">
            <input
              className={input}
              type="date"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
              required
            />
          </Field>
          <Field label="Place of supply">
            <input
              className={input}
              value={placeOfSupply}
              onChange={(event) => setPlaceOfSupply(event.target.value)}
              required
            />
          </Field>
          <Field label="Credit terms source">
            <select
              className={input}
              value={creditTermsSource}
              onChange={(event) =>
                setCreditTermsSource(
                  event.target.value as "SUPPLIER" | "PURCHASE_ORDER",
                )
              }
            >
              <option value="SUPPLIER">Supplier master</option>
              <option value="PURCHASE_ORDER">Purchase order</option>
            </select>
          </Field>
          <Field label="Due date override">
            <input
              className={input}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
          <Field label="Due-date override reason">
            <input
              className={input}
              value={dueReason}
              onChange={(event) => setDueReason(event.target.value)}
            />
          </Field>
          <Field label="Round-off">
            <input
              className={input}
              value={roundOff}
              onChange={(event) => setRoundOff(event.target.value)}
            />
          </Field>
          <Field label="Supplier invoice document">
            <select
              className={input}
              value={documentId}
              onChange={(event) => setDocumentId(event.target.value)}
            >
              <option value="">Attach before submission</option>
              {w.files
                .filter((file) => file.type === "SUPPLIER_INVOICE")
                .map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="Remarks">
          <textarea
            className={input}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </Field>
        <div className="space-y-4">
          {lines.map((line, index) => {
            const grnChoices = w.grnLines.filter(
              (grn) => grn.purchaseOrderLineId === line.purchaseOrderLineId,
            );
            return (
              <fieldset key={index} className="rounded-md border p-3">
                <legend className="px-1 text-sm font-semibold">
                  Invoice item {index + 1}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="PO item">
                    <select
                      className={input}
                      value={line.purchaseOrderLineId}
                      onChange={(event) => {
                        const selected = eligibleLines.find(
                          (item) => item.id === event.target.value,
                        );
                        setLine(index, {
                          purchaseOrderLineId: event.target.value,
                          goodsReceiptLineId: "",
                          unitPrice: selected?.unitPrice ?? "",
                        });
                      }}
                    >
                      <option value="">Select PO item</option>
                      {eligibleLines.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.poNumber} · qty {item.quantity} @ ₹
                          {item.unitPrice}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Posted GRN allocation">
                    <select
                      className={input}
                      value={line.goodsReceiptLineId}
                      onChange={(event) =>
                        setLine(index, {
                          goodsReceiptLineId: event.target.value,
                        })
                      }
                    >
                      <option value="">Select GRN item</option>
                      {grnChoices.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.grnNumber} · accepted {item.acceptedQuantity}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {(
                    [
                      ["HSN/SAC", "hsnSac"],
                      ["Invoiced quantity", "quantity"],
                      ["Unit price", "unitPrice"],
                      ["Discount before tax", "discountBeforeTax"],
                      ["Discount after tax", "discountAfterTax"],
                      ["Freight", "freightAmount"],
                    ] as const
                  ).map(([label, key]) => (
                    <Field key={key} label={label}>
                      <input
                        className={input}
                        type={key === "hsnSac" ? "text" : "number"}
                        step="0.001"
                        value={line[key]}
                        onChange={(event) =>
                          setLine(index, { [key]: event.target.value })
                        }
                      />
                    </Field>
                  ))}
                  {(["GST", "TDS", "CESS"] as const).map((kind) => {
                    const key =
                      kind === "GST"
                        ? "taxRuleVersionId"
                        : kind === "TDS"
                          ? "tdsRuleVersionId"
                          : "cessRuleVersionId";
                    return (
                      <Field key={kind} label={`${kind} rule`}>
                        <select
                          className={input}
                          value={line[key]}
                          onChange={(event) =>
                            setLine(index, { [key]: event.target.value })
                          }
                        >
                          {kind !== "GST" && <option value="">None</option>}
                          {w.taxRules
                            .filter((rule) => rule.kind === kind)
                            .map((rule) => (
                              <option key={rule.id} value={rule.id}>
                                {rule.code} · {rule.rate}%
                              </option>
                            ))}
                        </select>
                      </Field>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  {(
                    [
                      ["freightTaxable", "Tax freight"],
                      ["reverseCharge", "Reverse charge / RCM"],
                      ["inputTaxCreditEligible", "ITC eligible"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={line[key]}
                        onChange={(event) =>
                          setLine(index, { [key]: event.target.checked })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="text-red-700 underline"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove item
                    </button>
                  )}
                </div>
              </fieldset>
            );
          })}
        </div>
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          onClick={() => setLines((current) => [...current, blank()])}
        >
          Add another PO/GRN item
        </button>
      </ActionForm>
    </section>
  );
}

function InvoiceCommand({
  invoice,
  commands,
  w,
}: {
  invoice: FinanceWorkspace["invoices"][number];
  commands: readonly string[];
  w: FinanceWorkspace;
}) {
  const [command, setCommand] = useState(commands[0] ?? "");
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      {invoice.status === "DISPUTED" &&
        w.mismatches
          .filter(
            (mismatch) =>
              mismatch.invoiceId === invoice.id && mismatch.status === "OPEN",
          )
          .map((mismatch) => (
            <ActionForm
              key={mismatch.id}
              operation="invoice_command"
              label={`Accept ${mismatch.field} mismatch`}
              payload={{
                invoiceId: invoice.id,
                command: "ACCEPT_MISMATCH",
                mismatchId: mismatch.id,
                reason: `Authorized review: ${mismatch.expected} vs ${mismatch.actual}`,
              }}
            >
              <p className="text-sm text-amber-800">
                {mismatch.field}: expected {mismatch.expected}, actual{" "}
                {mismatch.actual}
              </p>
            </ActionForm>
          ))}
      {commands.length > 0 && (
        <ActionForm
          operation="invoice_command"
          label="Apply invoice transition"
          payload={{
            invoiceId: invoice.id,
            command,
            reason: reason || undefined,
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Action">
              <select
                className={input}
                value={command}
                onChange={(event) => setCommand(event.target.value)}
              >
                {commands.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Reason">
              <input
                className={input}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

function commandsFor(status: string, roles: readonly string[]) {
  const md = roles.includes("MANAGING_DIRECTOR");
  if (md) {
    if (status === "MD_APPROVAL_PENDING") return ["APPROVE", "REJECT"];
    if (["APPROVED", "PARTIALLY_PAID"].includes(status))
      return ["PAYMENT_HOLD"];
    if (status === "PAYMENT_HOLD") return ["RELEASE_HOLD"];
    return [];
  }
  if (!roles.some((role) => ["ACCOUNTS", "ACCOUNTS_ADMIN"].includes(role)))
    return [];
  return (
    {
      DRAFT: ["SUBMIT", "CANCEL"],
      UNDER_REVIEW: ["RUN_MATCH"],
      DISPUTED: ["RESUBMIT"],
      MATCHED: ["VERIFY"],
      VERIFIED: ["REQUEST_APPROVAL"],
    }[status] ?? []
  );
}

function InvoiceRegister({ w }: { w: FinanceWorkspace }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Supplier invoice register</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {w.invoices.map((invoice) => (
          <article
            key={invoice.id}
            className="min-w-0 rounded-lg border bg-white p-4"
          >
            <h3 className="font-semibold">
              {invoice.number} · {invoice.status}
            </h3>
            <p className="text-sm">
              {invoice.supplier} · supplier invoice{" "}
              {invoice.supplierInvoiceNumber}
            </p>
            <p className="text-sm">
              Invoice ₹{invoice.total} · outstanding ₹{invoice.outstanding} ·
              due {invoice.dueDate}
            </p>
            <div className="mt-3">
              <InvoiceCommand
                invoice={invoice}
                commands={commandsFor(invoice.status, w.roleCodes)}
                w={w}
              />
            </div>
          </article>
        ))}
        {w.invoices.length === 0 && (
          <p className="text-sm text-slate-500">No supplier invoices yet.</p>
        )}
      </div>
    </section>
  );
}

function PaymentWorkspace({ w }: { w: FinanceWorkspace }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [method, setMethod] = useState("NEFT");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bank, setBank] = useState("");
  const [reference, setReference] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [clearanceStatus, setClearanceStatus] = useState("PENDING");
  const [proof, setProof] = useState("");
  const [reason, setReason] = useState("");
  const accounts = w.roleCodes.some((role) =>
    ["ACCOUNTS", "ACCOUNTS_ADMIN"].includes(role),
  );
  const md = w.roleCodes.includes("MANAGING_DIRECTOR");
  return (
    <div className="space-y-5">
      {accounts && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">
            Prepare supplier payment
          </h2>
          <ActionForm
            operation="payment_prepare"
            label="Submit payment for MD approval"
            payload={{
              invoiceId,
              method,
              amount,
              paymentDate: date,
              bankAccountId: bank || undefined,
              referenceNumber: reference || undefined,
              chequeNumber: chequeNumber || undefined,
              chequeDate: chequeDate || undefined,
              clearanceStatus:
                method === "CHEQUE" ? clearanceStatus : undefined,
              proofDocumentId: proof,
              reason,
            }}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Approved invoice">
                <select
                  className={input}
                  value={invoiceId}
                  onChange={(event) => setInvoiceId(event.target.value)}
                >
                  <option value="">Select invoice</option>
                  {w.invoices
                    .filter((invoice) =>
                      ["APPROVED", "PARTIALLY_PAID"].includes(invoice.status),
                    )
                    .map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.number} · ₹{invoice.outstanding}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Payment method">
                <select
                  className={input}
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  {[
                    "NEFT",
                    "RTGS",
                    "IMPS",
                    "UPI",
                    "CHEQUE",
                    "CASH",
                    "COMPANY_CARD",
                    "EMPLOYEE_REIMBURSEMENT",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Amount">
                <input
                  className={input}
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field label="Payment date">
                <input
                  className={input}
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </Field>
              <Field label="Company bank account">
                <select
                  className={input}
                  value={bank}
                  onChange={(event) => setBank(event.target.value)}
                >
                  <option value="">Not applicable</option>
                  {w.banks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="UTR / reference">
                <input
                  className={input}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </Field>
              {method === "CHEQUE" && (
                <>
                  <Field label="Cheque number">
                    <input
                      className={input}
                      value={chequeNumber}
                      onChange={(event) => setChequeNumber(event.target.value)}
                    />
                  </Field>
                  <Field label="Cheque date">
                    <input
                      className={input}
                      type="date"
                      value={chequeDate}
                      onChange={(event) => setChequeDate(event.target.value)}
                    />
                  </Field>
                  <Field label="Clearance status">
                    <select
                      className={input}
                      value={clearanceStatus}
                      onChange={(event) =>
                        setClearanceStatus(event.target.value)
                      }
                    >
                      <option>PENDING</option>
                      <option>CLEARED</option>
                      <option>BOUNCED</option>
                    </select>
                  </Field>
                </>
              )}
              <Field label="Payment proof">
                <select
                  className={input}
                  value={proof}
                  onChange={(event) => setProof(event.target.value)}
                >
                  <option value="">Select proof</option>
                  {w.files
                    .filter((file) => file.type === "PAYMENT_PROOF")
                    .map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Payment reason">
                <input
                  className={input}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </div>
          </ActionForm>
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Payment history and approvals
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {w.payments.map((payment) => (
            <article
              key={payment.id}
              className="rounded-lg border bg-white p-4"
            >
              <h3 className="font-semibold">
                {payment.number} · {payment.status}
              </h3>
              <p className="text-sm">
                {payment.invoiceNumber} · {payment.method} · ₹{payment.amount}
              </p>
              {payment.reversalOfNumber && (
                <p className="text-sm text-amber-700">
                  Reversal of {payment.reversalOfNumber}
                </p>
              )}
              {payment.method === "CHEQUE" && (
                <p className="text-sm">
                  Clearance: {payment.clearanceStatus ?? "PENDING"}
                </p>
              )}
              {accounts &&
                payment.method === "CHEQUE" &&
                payment.status === "PENDING_APPROVAL" &&
                payment.clearanceStatus === "PENDING" && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(["CLEARED", "BOUNCED"] as const).map(
                      (clearanceStatus) => (
                        <ActionForm
                          key={clearanceStatus}
                          operation="payment_clearance"
                          label={`Mark cheque ${clearanceStatus.toLowerCase()}`}
                        >
                          <input type="hidden" name="id" value={payment.id} />
                          <input
                            type="hidden"
                            name="clearanceStatus"
                            value={clearanceStatus}
                          />
                          <Field label="Clearance reason">
                            <input name="reason" className={input} required />
                          </Field>
                        </ActionForm>
                      ),
                    )}
                  </div>
                )}
              {md && payment.status === "PENDING_APPROVAL" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(["APPROVE", "REJECT"] as const).map((decision) => (
                    <ActionForm
                      key={decision}
                      operation="payment_decide"
                      label={
                        decision === "APPROVE"
                          ? "Approve payment"
                          : "Reject payment"
                      }
                    >
                      <input type="hidden" name="id" value={payment.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <Field label={`${decision} reason`}>
                        <input name="reason" className={input} required />
                      </Field>
                    </ActionForm>
                  ))}
                </div>
              )}
              {accounts &&
                payment.status === "APPROVED" &&
                !payment.reversalOfId && (
                  <div className="mt-3">
                    <ActionForm
                      operation="payment_reversal"
                      label="Submit payment reversal for MD approval"
                    >
                      <input type="hidden" name="id" value={payment.id} />
                      <Field label="Reversal evidence">
                        <select
                          className={input}
                          name="proofDocumentId"
                          required
                        >
                          <option value="">Select proof</option>
                          {w.files
                            .filter((file) => file.type === "PAYMENT_PROOF")
                            .map((file) => (
                              <option key={file.id} value={file.id}>
                                {file.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Reversal reason">
                        <input className={input} name="reason" required />
                      </Field>
                    </ActionForm>
                  </div>
                )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function AdvanceWorkspace({ w }: { w: FinanceWorkspace }) {
  const [poId, setPoId] = useState("");
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("NEFT");
  const [reference, setReference] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [reason, setReason] = useState("");
  const accounts = w.roleCodes.some((role) =>
    ["ACCOUNTS", "ACCOUNTS_ADMIN"].includes(role),
  );
  const md = w.roleCodes.includes("MANAGING_DIRECTOR");
  return (
    <div className="space-y-5">
      {accounts && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">
            Prepare supplier advance
          </h2>
          <ActionForm
            operation="advance_create"
            label="Submit advance for MD approval"
            payload={{
              purchaseOrderId: poId,
              advancePercent: percent,
              amount,
              method,
              referenceNumber: reference,
              evidenceDocumentId: documentId,
              reason,
            }}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Advance-enabled purchase order">
                <select
                  className={input}
                  value={poId}
                  onChange={(event) => setPoId(event.target.value)}
                >
                  <option value="">Select purchase order</option>
                  {w.purchaseOrders
                    .filter((po) => po.permitsAdvance)
                    .map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.number} · max {po.maximumAdvancePercent}%
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Advance percent">
                <input
                  className={input}
                  type="number"
                  step="0.01"
                  value={percent}
                  onChange={(event) => setPercent(event.target.value)}
                />
              </Field>
              <Field label="Advance amount">
                <input
                  className={input}
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field label="Payment method">
                <select
                  className={input}
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  {[
                    "NEFT",
                    "RTGS",
                    "IMPS",
                    "UPI",
                    "CHEQUE",
                    "CASH",
                    "COMPANY_CARD",
                    "EMPLOYEE_REIMBURSEMENT",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reference number">
                <input
                  className={input}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </Field>
              <Field label="Advance evidence">
                <select
                  className={input}
                  value={documentId}
                  onChange={(event) => setDocumentId(event.target.value)}
                >
                  <option value="">Select evidence</option>
                  {w.files
                    .filter((file) => file.type === "ADVANCE_PAYMENT_EVIDENCE")
                    .map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Advance reason">
                <input
                  className={input}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </div>
          </ActionForm>
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Advance register</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {w.advances.map((advance) => (
            <article
              key={advance.id}
              className="rounded-lg border bg-white p-4"
            >
              <h3 className="font-semibold">
                {advance.number} · {advance.status}
              </h3>
              <p className="text-sm">
                {advance.supplier} · {advance.purchaseOrder}
              </p>
              <p className="text-sm">
                Approved ₹{advance.amount} · unapplied ₹{advance.remaining}
              </p>
              {md && advance.status === "PENDING_APPROVAL" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(["APPROVE", "REJECT"] as const).map((decision) => (
                    <ActionForm
                      key={decision}
                      operation="advance_decide"
                      label={`${decision === "APPROVE" ? "Approve" : "Reject"} advance`}
                    >
                      <input type="hidden" name="id" value={advance.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <Field label="Decision reason">
                        <input className={input} name="reason" required />
                      </Field>
                    </ActionForm>
                  ))}
                </div>
              )}
              {accounts &&
                ["APPROVED", "PARTIALLY_APPLIED"].includes(advance.status) && (
                  <ActionForm
                    operation="advance_apply"
                    label="Apply advance to invoice"
                  >
                    <input type="hidden" name="id" value={advance.id} />
                    <Field label="Approved supplier invoice">
                      <select className={input} name="invoiceId">
                        {w.invoices
                          .filter(
                            (invoice) =>
                              invoice.supplier === advance.supplier &&
                              ["APPROVED", "PARTIALLY_PAID"].includes(
                                invoice.status,
                              ),
                          )
                          .map((invoice) => (
                            <option key={invoice.id} value={invoice.id}>
                              {invoice.number} · ₹{invoice.outstanding}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Application amount">
                      <input
                        className={input}
                        name="amount"
                        type="number"
                        step="0.01"
                        required
                      />
                    </Field>
                    <Field label="Application reason">
                      <input className={input} name="reason" required />
                    </Field>
                  </ActionForm>
                )}
              {accounts &&
                ["APPROVED", "PARTIALLY_APPLIED"].includes(advance.status) && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(["REFUND", "REVERSE"] as const)
                      .filter(
                        (decision) =>
                          decision !== "REVERSE" ||
                          Number(advance.remaining) === Number(advance.amount),
                      )
                      .map((decision) => (
                        <ActionForm
                          key={decision}
                          operation="advance_settle"
                          label={
                            decision === "REFUND"
                              ? "Record supplier refund"
                              : "Reverse unapplied advance"
                          }
                        >
                          <input type="hidden" name="id" value={advance.id} />
                          <input
                            type="hidden"
                            name="decision"
                            value={decision}
                          />
                          <Field label="Settlement evidence">
                            <select
                              className={input}
                              name="evidenceDocumentId"
                              required
                            >
                              <option value="">Select proof</option>
                              {w.files
                                .filter((file) => file.type === "PAYMENT_PROOF")
                                .map((file) => (
                                  <option key={file.id} value={file.id}>
                                    {file.name}
                                  </option>
                                ))}
                            </select>
                          </Field>
                          <Field label="Settlement reason">
                            <input className={input} name="reason" required />
                          </Field>
                        </ActionForm>
                      ))}
                  </div>
                )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function NoteWorkspace({ w }: { w: FinanceWorkspace }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceLineId, setInvoiceLineId] = useState("");
  const [noteType, setNoteType] = useState("CREDIT");
  const [reasonCode, setReasonCode] = useState("PRICE_CORRECTION");
  const [reason, setReason] = useState("");
  const [hsnSac, setHsnSac] = useState("");
  const [quantity, setQuantity] = useState("");
  const [taxable, setTaxable] = useState("");
  const [taxRuleVersionId, setTaxRuleVersionId] = useState(
    w.taxRules.find((rule) => rule.kind === "GST")?.id ?? "",
  );
  const [documentId, setDocumentId] = useState("");
  const accounts = w.roleCodes.some((role) =>
    ["ACCOUNTS", "ACCOUNTS_ADMIN"].includes(role),
  );
  const md = w.roleCodes.includes("MANAGING_DIRECTOR");
  return (
    <div className="space-y-5">
      {accounts && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">
            Create credit or debit note
          </h2>
          <ActionForm
            operation="note_create"
            label="Save financial note draft"
            payload={{
              invoiceId,
              noteType,
              reasonCode,
              reason,
              documentId,
              lines: [
                {
                  invoiceLineId,
                  hsnSac,
                  quantity,
                  taxableValue: taxable,
                  taxRuleVersionId,
                },
              ],
            }}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Original finalized invoice">
                <select
                  className={input}
                  value={invoiceId}
                  onChange={(event) => {
                    setInvoiceId(event.target.value);
                    setInvoiceLineId("");
                    setHsnSac("");
                    setQuantity("");
                  }}
                >
                  <option value="">Select invoice</option>
                  {w.invoices
                    .filter((invoice) =>
                      [
                        "APPROVED",
                        "PARTIALLY_PAID",
                        "PAID",
                        "PAYMENT_HOLD",
                      ].includes(invoice.status),
                    )
                    .map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.number}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Original invoice item">
                <select
                  className={input}
                  value={invoiceLineId}
                  onChange={(event) => {
                    const selected = w.invoiceLines.find(
                      (line) => line.id === event.target.value,
                    );
                    setInvoiceLineId(event.target.value);
                    setHsnSac(selected?.hsnSac ?? "");
                    setQuantity(selected?.quantity ?? "");
                    setTaxRuleVersionId(
                      selected?.taxRuleVersionId ?? taxRuleVersionId,
                    );
                  }}
                >
                  <option value="">Select item</option>
                  {w.invoiceLines
                    .filter((line) => line.invoiceId === invoiceId)
                    .map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.material} Â· {line.quantity} {line.unit} Â· GST{" "}
                        {line.gstRate}%
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Note type">
                <select
                  className={input}
                  value={noteType}
                  onChange={(event) => setNoteType(event.target.value)}
                >
                  <option>CREDIT</option>
                  <option>DEBIT</option>
                </select>
              </Field>
              <Field label="Reason category">
                <select
                  className={input}
                  value={reasonCode}
                  onChange={(event) => setReasonCode(event.target.value)}
                >
                  {[
                    "RETURN_TO_VENDOR",
                    "DAMAGED_REJECTED",
                    "PRICE_CORRECTION",
                    "QUANTITY_CORRECTION",
                    "GST_CORRECTION",
                    "DISCOUNT",
                    "FREIGHT_CORRECTION",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="HSN/SAC">
                <input
                  className={input}
                  value={hsnSac}
                  onChange={(event) => setHsnSac(event.target.value)}
                  required
                />
              </Field>
              <Field label="Affected quantity">
                <input
                  className={input}
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </Field>
              <Field label="Taxable value">
                <input
                  className={input}
                  type="number"
                  step="0.01"
                  value={taxable}
                  onChange={(event) => setTaxable(event.target.value)}
                />
              </Field>
              <Field label="GST rule">
                <select
                  className={input}
                  value={taxRuleVersionId}
                  onChange={(event) => setTaxRuleVersionId(event.target.value)}
                >
                  <option value="">Select GST rule</option>
                  {w.taxRules
                    .filter((rule) => rule.kind === "GST")
                    .map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.code} Â· {rule.rate}%
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Note document">
                <select
                  className={input}
                  value={documentId}
                  onChange={(event) => setDocumentId(event.target.value)}
                >
                  <option value="">Select document</option>
                  {w.files
                    .filter((file) => file.type === `${noteType}_NOTE`)
                    .map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Note reason">
                <input
                  className={input}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </div>
            <p className="text-sm text-slate-600">
              GST and note total are calculated on the server from this
              immutable tax-rule version.
            </p>
          </ActionForm>
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Credit/debit note register
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {w.notes.map((note) => (
            <article key={note.id} className="rounded-lg border bg-white p-4">
              <h3 className="font-semibold">
                {note.number} · {note.status}
              </h3>
              <p className="text-sm">
                {note.type} · {note.invoiceNumber} · ₹{note.total}
              </p>
              <p className="text-sm text-slate-600">{note.reason}</p>
              <p className="text-sm text-slate-600">
                Applied {note.applied} Â· remaining unapplied {note.remaining}
              </p>
              {accounts && note.status === "DRAFT" && (
                <ActionForm
                  operation="note_command"
                  label="Submit note for MD approval"
                >
                  <input type="hidden" name="id" value={note.id} />
                  <input type="hidden" name="decision" value="SUBMIT" />
                  <input
                    type="hidden"
                    name="reason"
                    value="Accounts completed note review"
                  />
                </ActionForm>
              )}
              {md && note.status === "PENDING_APPROVAL" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(["APPROVE", "REJECT"] as const).map((decision) => (
                    <ActionForm
                      key={decision}
                      operation="note_command"
                      label={`${decision === "APPROVE" ? "Approve" : "Reject"} note`}
                    >
                      <input type="hidden" name="id" value={note.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <Field label="Decision reason">
                        <input className={input} name="reason" required />
                      </Field>
                    </ActionForm>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function TaxWorkspace({ w }: { w: FinanceWorkspace }) {
  const admin = w.roleCodes.includes("ACCOUNTS_ADMIN");
  return (
    <div className="space-y-5">
      {admin && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">
            Create effective-dated tax-rule version
          </h2>
          <ActionForm
            operation="tax_create"
            label="Create immutable tax version"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Rule code">
                <input className={input} name="code" required />
              </Field>
              <Field label="Tax kind">
                <select className={input} name="kind">
                  <option>GST</option>
                  <option>TDS</option>
                  <option>CESS</option>
                  <option>OTHER</option>
                </select>
              </Field>
              <Field label="Rate percent">
                <input
                  className={input}
                  name="rate"
                  type="number"
                  step="0.0001"
                  required
                />
              </Field>
              <Field label="Effective from">
                <input
                  className={input}
                  name="effectiveFrom"
                  type="date"
                  required
                />
              </Field>
              <Field label="Effective to">
                <input className={input} name="effectiveTo" type="date" />
              </Field>
              <Field label="CA approval reference">
                <input className={input} name="approvalReference" required />
              </Field>
            </div>
          </ActionForm>
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Versioned tax settings</h2>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3">Code</th>
                <th className="p-3">Kind</th>
                <th className="p-3">Rate</th>
                <th className="p-3">Effective</th>
              </tr>
            </thead>
            <tbody>
              {w.taxRules.map((rule) => (
                <tr className="border-b" key={rule.id}>
                  <td className="p-3">{rule.code}</td>
                  <td className="p-3">{rule.kind}</td>
                  <td className="p-3">{rule.rate}%</td>
                  <td className="p-3">
                    {rule.effectiveFrom} to {rule.effectiveTo ?? "open"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TallyWorkspace({ w }: { w: FinanceWorkspace }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">TallyPrime export queue</h2>
      <p className="mb-3 text-sm text-slate-600">
        Durable XML/file export with checksums and idempotent
        finalized-transaction keys.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {w.exports.map((event) => (
          <article key={event.id} className="rounded-lg border bg-white p-4">
            <h3 className="font-semibold">
              {event.number} · {event.status}
            </h3>
            <p className="text-sm">
              {event.entityType} · attempts {event.attempts}
            </p>
            {event.error && (
              <p className="text-sm text-red-700">{event.error}</p>
            )}
            {["PENDING", "FAILED", "RETRY_PENDING"].includes(event.status) && (
              <ActionForm
                operation="tally_process"
                label={
                  event.status === "FAILED"
                    ? "Retry XML export"
                    : "Generate XML export"
                }
              >
                <input type="hidden" name="id" value={event.id} />
                <input type="hidden" name="decision" value="PROCESS" />
                <input
                  type="hidden"
                  name="reason"
                  value="Accounts initiated TallyPrime file export"
                />
              </ActionForm>
            )}
            {["EXPORTED", "ACKNOWLEDGED"].includes(event.status) && (
              <a
                className="text-sm underline"
                href={`/accounts/tally/${event.id}/download`}
              >
                Download Tally XML
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportsWorkspace({ w }: { w: FinanceWorkspace }) {
  const [report, setReport] = useState("payables");
  const reports = [
    ["payables", "Supplier payables"],
    ["ageing", "Outstanding invoice ageing"],
    ["payments", "Partial, completed and payment history"],
    ["gst", "GST purchase register"],
    ["tds", "TDS register"],
    ["rcm", "RCM register"],
    ["notes", "Credit/debit notes"],
    ["advances", "Supplier advances"],
    ["mismatches", "Invoice mismatches"],
    ["invoice-approvals", "Invoices pending approval"],
    ["payment-approvals", "Payment approvals pending"],
    ["project-cost", "Project material cost"],
    ["work-package-budget", "Work-package budget vs commitment vs actual"],
    ["tally", "Tally export status and failures"],
  ] as const;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Financial reports</h2>
        <p className="text-sm text-slate-600">
          Company-wide Accounts scope with permission-checked exports.
        </p>
      </div>
      <Field label="Report">
        <select
          className={input}
          value={report}
          onChange={(event) => setReport(event.target.value)}
        >
          {reports.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap gap-2 print:hidden">
        {(["csv", "xlsx", "pdf"] as const).map((format) => (
          <a
            key={format}
            className="rounded border bg-white px-3 py-2 text-sm uppercase"
            href={`/accounts/reports/export?report=${report}&format=${format}`}
          >
            Export {format}
          </a>
        ))}
        <button
          className="rounded border bg-white px-3 py-2 text-sm"
          onClick={() => window.print()}
        >
          Print view
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3">Project</th>
              <th className="p-3">Budget</th>
              <th className="p-3">Actual invoices</th>
              <th className="p-3">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {w.projects.map((project) => {
              const remaining = project.budget
                ? Number(project.budget) - Number(project.actual)
                : null;
              return (
                <tr key={project.id} className="border-b">
                  <td className="p-3">{project.name}</td>
                  <td className="p-3">
                    {project.budget ? `₹${project.budget}` : "Not set"}
                  </td>
                  <td className="p-3">₹{project.actual}</td>
                  <td
                    className={`p-3 ${remaining !== null && remaining < 0 ? "text-amber-700" : ""}`}
                  >
                    {remaining === null ? "—" : `₹${remaining.toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FinanceWorkspaceView({
  w,
  mode,
}: {
  w: FinanceWorkspace;
  mode: FinanceMode;
}) {
  const accounts = w.roleCodes.some((role) =>
    ["ACCOUNTS", "ACCOUNTS_ADMIN"].includes(role),
  );
  return (
    <div className="space-y-6">
      <FinanceNav />
      {mode === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Invoices", w.invoices.length],
            [
              "Outstanding",
              `₹${w.invoices.reduce((sum, item) => sum + Number(item.outstanding), 0).toFixed(2)}`,
            ],
            [
              "Pending payments",
              w.payments.filter((item) => item.status === "PENDING_APPROVAL")
                .length,
            ],
            [
              "Failed exports",
              w.exports.filter((item) => item.status === "FAILED").length,
            ],
          ].map(([label, value]) => (
            <article key={label} className="rounded-lg border bg-white p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </article>
          ))}
        </div>
      )}
      {accounts && ["new-invoice", "invoices"].includes(mode) && (
        <DocumentUpload />
      )}
      {accounts && mode === "new-invoice" && <InvoiceComposer w={w} />}
      {["overview", "invoices", "matching"].includes(mode) && (
        <InvoiceRegister w={w} />
      )}
      {mode === "payments" && (
        <>
          <DocumentUpload />
          <PaymentWorkspace w={w} />
        </>
      )}
      {mode === "tax" && <TaxWorkspace w={w} />}
      {mode === "tally" && <TallyWorkspace w={w} />}
      {mode === "reports" && <ReportsWorkspace w={w} />}
      {mode === "advances" && (
        <>
          <DocumentUpload />
          <AdvanceWorkspace w={w} />
        </>
      )}
      {mode === "notes" && (
        <>
          <DocumentUpload />
          <NoteWorkspace w={w} />
        </>
      )}
    </div>
  );
}
