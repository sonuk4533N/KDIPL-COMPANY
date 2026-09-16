import Link from "next/link";
import { db } from "@/db/prisma";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const principal = await getCurrentPrincipal();
  if (!principal) return null;
  const query = (await searchParams).q?.trim().slice(0, 100) ?? "";
  const finance = hasPermission(principal, "invoice.view");
  const procurement = hasPermission(principal, "purchase.view");
  const suppliers = hasPermission(principal, "supplier.view") || finance;
  const contains = { contains: query, mode: "insensitive" as const };
  const [
    invoiceRows,
    paymentRows,
    noteRows,
    advanceRows,
    supplierRows,
    poRows,
    grnRows,
  ] =
    query.length >= 2
      ? await Promise.all([
          finance
            ? db.supplierInvoice.findMany({
                where: {
                  OR: [
                    { internalNumber: contains },
                    { supplierInvoiceNumber: contains },
                    { normalizedInvoiceNumber: contains },
                  ],
                },
                take: 20,
              })
            : [],
          finance
            ? db.supplierPayment.findMany({
                where: { paymentNumber: contains },
                take: 20,
              })
            : [],
          finance
            ? db.supplierFinancialNote.findMany({
                where: { noteNumber: contains },
                take: 20,
              })
            : [],
          finance
            ? db.supplierAdvance.findMany({
                where: { advanceNumber: contains },
                take: 20,
              })
            : [],
          suppliers
            ? db.supplier.findMany({
                where: {
                  OR: [{ legalName: contains }, { supplierCode: contains }],
                },
                take: 20,
              })
            : [],
          procurement || finance
            ? db.purchaseOrder.findMany({
                where: { poNumber: contains },
                take: 20,
              })
            : [],
          finance
            ? db.goodsReceipt.findMany({
                where: { grnNumber: contains },
                take: 20,
              })
            : [],
        ])
      : [[], [], [], [], [], [], []];
  const results = [
    ...invoiceRows.map((item) => ({
      type: "Supplier invoice",
      label: `${item.internalNumber} · ${item.supplierInvoiceNumber}`,
      href: "/accounts/invoices",
    })),
    ...paymentRows.map((item) => ({
      type: "Payment",
      label: item.paymentNumber,
      href: "/accounts/payments",
    })),
    ...noteRows.map((item) => ({
      type: `${item.noteType.toLowerCase()} note`,
      label: item.noteNumber,
      href: "/accounts/notes",
    })),
    ...advanceRows.map((item) => ({
      type: "Supplier advance",
      label: item.advanceNumber,
      href: "/accounts/advances",
    })),
    ...supplierRows.map((item) => ({
      type: "Supplier",
      label: `${item.supplierCode} · ${item.legalName}`,
      href: `/master-data/suppliers/${item.id}`,
    })),
    ...poRows.map((item) => ({
      type: "Purchase order",
      label: item.poNumber,
      href: "/procurement",
    })),
    ...grnRows.map((item) => ({
      type: "GRN",
      label: item.grnNumber,
      href: "/inventory",
    })),
  ];
  return (
    <main className="space-y-5">
      <div>
        <p className="text-sm font-medium text-blue-700">Permission-scoped</p>
        <h1 className="text-2xl font-semibold">Global search</h1>
      </div>
      <form className="flex gap-2" action="/search">
        <input
          aria-label="Search query"
          className="w-full rounded-md border bg-white p-3"
          name="q"
          defaultValue={query}
          placeholder="Invoice, payment, supplier, PO, GRN, note or advance"
        />
        <button className="rounded-md bg-slate-900 px-4 text-white">
          Search
        </button>
      </form>
      <div className="grid gap-3 lg:grid-cols-2">
        {results.map((result, index) => (
          <Link
            key={`${result.type}-${result.label}-${index}`}
            href={result.href}
            className="rounded-lg border bg-white p-4 hover:bg-slate-50"
          >
            <p className="text-xs font-medium uppercase text-slate-500">
              {result.type}
            </p>
            <p className="font-semibold">{result.label}</p>
          </Link>
        ))}
        {query.length >= 2 && results.length === 0 && (
          <p>No authorized results.</p>
        )}
      </div>
    </main>
  );
}
