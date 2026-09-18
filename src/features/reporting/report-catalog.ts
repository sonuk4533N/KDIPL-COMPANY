import type {
  AuthenticatedPrincipal,
  PermissionCode,
} from "@/types/application";

export type ReportDefinition = {
  id: string;
  name: string;
  category: "Inventory" | "Procurement" | "Accounts" | "Management";
  description: string;
  permission: PermissionCode;
  sensitive?: boolean;
};

const inventory = [
  ["current-stock-location", "Current stock by inventory location"],
  ["current-stock-project", "Current stock by project and site"],
  ["stock-ledger", "Stock ledger and movement history"],
  ["stock-as-of", "Stock as of selected date"],
  ["low-stock", "Low project stock"],
  ["negative-stock", "Temporary negative stock"],
  ["damaged-rejected", "Damaged and rejected stock"],
  [
    "stock-losses",
    "Wastage, theft/loss, breakage, scrap and obsolete material",
  ],
  ["transfers-pending", "Transfers pending receipt"],
  ["physical-count-variance", "Physical-count variance"],
  ["unused-returns", "Unused-material returns"],
  ["project-closing-stock", "Project-closing stock disposition"],
] as const;

const procurement = [
  ["pending-po-deliveries", "Pending PO deliveries"],
  ["partial-po-deliveries", "Partial PO deliveries"],
  ["purchases-project", "Purchases by project"],
  ["purchases-supplier", "Purchases by supplier"],
  ["purchases-material", "Purchase quantities and values by material"],
  ["quotation-history", "RFQ and quotation comparison history"],
  ["selected-vs-lowest", "Selected quotation versus lowest quotation"],
  ["expired-quotations", "Expired-quotation exceptions"],
  ["po-amendments", "PO amendment history"],
  ["unregistered-suppliers", "One-time/unregistered supplier purchases"],
  ["direct-purchases", "Emergency and cash/direct purchases"],
] as const;

const accounts = [
  ["payables", "Supplier payables"],
  ["ageing", "Outstanding invoice ageing"],
  ["payments", "Supplier payments and partial payments"],
  ["advances", "Supplier advances"],
  ["notes", "Credit and debit notes"],
  ["gst", "GST purchase register"],
  ["tds", "TDS register"],
  ["rcm", "RCM register"],
  ["mismatches", "Invoice mismatches"],
  ["payment-approvals", "Payments awaiting approval"],
  ["tally", "Failed Tally exports"],
] as const;

const management = [
  ["pending-approvals", "Pending approvals"],
  ["project-material-cost", "Project material cost"],
  ["budget-analytics", "Budget versus committed versus actual"],
  ["procurement-trend", "Procurement trend"],
  ["supplier-exposure", "Supplier exposure"],
  ["overdue-delivery-value", "Overdue supplier delivery value"],
  ["stock-exceptions", "Stock exceptions"],
  ["project-close-readiness", "Project-close readiness"],
  ["audit-exceptions", "Audit and exception summary"],
  ["supplier-performance", "Supplier performance"],
] as const;

function definitions(
  category: ReportDefinition["category"],
  rows: readonly (readonly [string, string])[],
  permission: PermissionCode,
  sensitive = false,
): ReportDefinition[] {
  return rows.map(([id, name]) => ({
    id,
    name,
    category,
    permission,
    sensitive,
    description: `${name} derived from authorized source transactions.`,
  }));
}

export const reportCatalog: readonly ReportDefinition[] = [
  ...definitions("Inventory", inventory, "inventory.view"),
  ...definitions("Procurement", procurement, "purchase.view"),
  ...definitions("Accounts", accounts, "invoice.view", true),
  ...definitions("Management", management, "report.view"),
];

export function getReportDefinition(id: string) {
  return reportCatalog.find((report) => report.id === id);
}

export function canViewReport(
  principal: AuthenticatedPrincipal,
  report: ReportDefinition,
) {
  if (!principal.permissions.includes(report.permission)) return false;
  if (report.id === "audit-exceptions")
    return principal.permissions.includes("audit.view");
  if (report.category !== "Management") return true;
  const roles = principal.roleCodes;
  if (
    roles.includes("SYSTEM_ADMINISTRATOR") ||
    roles.includes("MANAGING_DIRECTOR") ||
    roles.includes("PROJECT_DIRECTOR")
  )
    return true;
  if (roles.includes("BUSINESS_DEVELOPMENT_DIRECTOR"))
    return report.id !== "supplier-performance";
  if (roles.includes("PURCHASE_MANAGER"))
    return [
      "pending-approvals",
      "procurement-trend",
      "supplier-exposure",
      "overdue-delivery-value",
      "supplier-performance",
      "audit-exceptions",
    ].includes(report.id);
  if (roles.includes("PROJECT_MANAGER"))
    return [
      "pending-approvals",
      "project-material-cost",
      "budget-analytics",
      "stock-exceptions",
      "project-close-readiness",
    ].includes(report.id);
  return false;
}
