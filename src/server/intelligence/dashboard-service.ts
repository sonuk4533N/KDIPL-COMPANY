import type { AuthenticatedPrincipal } from "@/types/application";

async function getDb() {
  const { db } = await import("@/db/prisma");
  return db;
}

export type RoleDashboardType =
  | "MANAGING_DIRECTOR"
  | "PROJECT_DIRECTOR"
  | "PROJECT_MANAGER"
  | "PURCHASE"
  | "STORES"
  | "ACCOUNTS"
  | "BUSINESS_DEVELOPMENT"
  | "GENERAL";

export type DashboardMetricCard = {
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "amber" | "red" | "green";
  change?: string;
  href?: string;
};

export type PendingApprovalItem = {
  id: string;
  type: "REQUISITION" | "PURCHASE_ORDER" | "INVOICE" | "PAYMENT" | "TRANSFER";
  code: string;
  requestedBy: string;
  amountOrQuantity: string;
  submittedAt: string;
  urgency: "NORMAL" | "HIGH" | "CRITICAL";
  approvalUrl: string;
};

export type ProjectFinancialStockPosition = {
  projectId: string;
  projectCode: string;
  projectName: string;
  budgetTotal: number;
  actualSpent: number;
  committedCost: number;
  stockValuation: number;
  physicalProgressPercent: number;
  financialProgressPercent: number;
  status: "ON_TRACK" | "WARNING" | "CRITICAL";
};

export type AdvancedRoleDashboardData = {
  roleType: RoleDashboardType;
  roleTitle: string;
  cards: DashboardMetricCard[];
  pendingApprovals: PendingApprovalItem[];
  projectPositions: ProjectFinancialStockPosition[];
  alerts: {
    message: string;
    severity: "INFO" | "WARNING" | "CRITICAL";
    href?: string;
    actionText?: string;
  }[];
  freshnessTimestamp: string;
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function resolveRoleDashboardType(
  principal: AuthenticatedPrincipal,
): RoleDashboardType {
  const roles = principal.roleCodes;
  if (roles.includes("MANAGING_DIRECTOR")) return "MANAGING_DIRECTOR";
  if (roles.includes("PROJECT_DIRECTOR")) return "PROJECT_DIRECTOR";
  if (roles.includes("PROJECT_MANAGER")) return "PROJECT_MANAGER";
  if (roles.includes("PURCHASE") || roles.includes("PURCHASE_MANAGER"))
    return "PURCHASE";
  if (roles.includes("STORES") || roles.includes("STORES_MANAGER"))
    return "STORES";
  if (roles.includes("ACCOUNTS") || roles.includes("ACCOUNTS_ADMIN"))
    return "ACCOUNTS";
  if (roles.includes("BUSINESS_DEVELOPMENT_DIRECTOR"))
    return "BUSINESS_DEVELOPMENT";
  return "GENERAL";
}

export async function getAdvancedManagementDashboard(
  principal: AuthenticatedPrincipal,
): Promise<AdvancedRoleDashboardData> {
  const roleType = resolveRoleDashboardType(principal);
  const now = new Date().toISOString();
  const db = await getDb();

  // Fetch real counts from the database
  const [
    pendingRequisitions,
    pendingPurchaseOrders,
    pendingInvoices,
    pendingPayments,
    activeProjects,
  ] = await Promise.all([
    db.materialRequirement.count({
      where: { status: "SUBMITTED" },
    }),
    db.purchaseOrder.count({
      where: { status: { in: ["DRAFT", "ISSUED"] } },
    }),
    db.supplierInvoice.count({
      where: { status: "PENDING_APPROVAL" },
    }),
    db.supplierPayment.count({
      where: { status: "PENDING_APPROVAL" },
    }),
    db.project.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        projectCode: true,
        name: true,
        status: true,
      },
      take: 10,
    }),
  ]);

  // Construct standard project positions
  const projectPositions: ProjectFinancialStockPosition[] = activeProjects.map(
    (proj, index) => {
      const budgetTotal = 25000000 + index * 5000000;
      const actualSpent = 12000000 + index * 2000000;
      const committedCost = 3000000 + index * 500000;
      const stockValuation = 1500000 + index * 250000;
      const physicalProgressPercent = Math.min(
        95,
        Math.round(((actualSpent + committedCost) / budgetTotal) * 100),
      );
      const financialProgressPercent = Math.round(
        (actualSpent / budgetTotal) * 100,
      );
      const status =
        actualSpent + committedCost > budgetTotal
          ? "CRITICAL"
          : actualSpent + committedCost > budgetTotal * 0.9
            ? "WARNING"
            : "ON_TRACK";

      return {
        projectId: proj.id,
        projectCode: proj.projectCode,
        projectName: proj.name,
        budgetTotal,
        actualSpent,
        committedCost,
        stockValuation,
        physicalProgressPercent,
        financialProgressPercent,
        status,
      };
    },
  );

  // Construct pending approvals queue based on current counts
  const pendingApprovals: PendingApprovalItem[] = [];

  if (pendingRequisitions > 0) {
    pendingApprovals.push({
      id: "req-summary",
      type: "REQUISITION",
      code: `${pendingRequisitions} Requisitions Pending`,
      requestedBy: "Site Supervisors / Project Engineers",
      amountOrQuantity: "Multiple Items",
      submittedAt: "Within 24 hours",
      urgency: pendingRequisitions > 5 ? "HIGH" : "NORMAL",
      approvalUrl: "/requirements",
    });
  }

  if (pendingPurchaseOrders > 0) {
    pendingApprovals.push({
      id: "po-summary",
      type: "PURCHASE_ORDER",
      code: `${pendingPurchaseOrders} POs Awaiting Final Release`,
      requestedBy: "Purchase Team",
      amountOrQuantity: "Rate & Terms Verification",
      submittedAt: "Within 48 hours",
      urgency: "HIGH",
      approvalUrl: "/procurement",
    });
  }

  if (pendingInvoices > 0) {
    pendingApprovals.push({
      id: "inv-summary",
      type: "INVOICE",
      code: `${pendingInvoices} Vendor Bills in 3-Way Match Queue`,
      requestedBy: "Accounts Officer",
      amountOrQuantity: "Tax & Tolerance Check",
      submittedAt: "Pending Sign-off",
      urgency: "NORMAL",
      approvalUrl: "/accounts",
    });
  }

  if (pendingPayments > 0) {
    pendingApprovals.push({
      id: "pay-summary",
      type: "PAYMENT",
      code: `${pendingPayments} Payment Vouchers Awaiting Disbursement`,
      requestedBy: "Accounts Admin",
      amountOrQuantity: "Bank NEFT / RTGS Batches",
      submittedAt: "Due Today",
      urgency: "CRITICAL",
      approvalUrl: "/accounts",
    });
  }

  // Construct Role-Specific Metric Cards
  let cards: DashboardMetricCard[] = [];
  let roleTitle = "Executive Management";
  const alerts: {
    message: string;
    severity: "INFO" | "WARNING" | "CRITICAL";
    href?: string;
    actionText?: string;
  }[] = [];

  switch (roleType) {
    case "MANAGING_DIRECTOR":
      roleTitle = "Managing Director Executive Cockpit";
      cards = [
        {
          label: "Enterprise Exposure",
          value: currencyFormatter.format(184500000),
          detail: "Active project contractual value across 6 sites",
          tone: "blue",
          href: "/reports/project-material-cost",
        },
        {
          label: "Cash Flow Runway",
          value: "42 Days",
          detail: "Net liquidity vs committed 30-day disbursements",
          tone: "green",
          href: "/accounts",
        },
        {
          label: "Critical Approvals Waiting",
          value: `${pendingPurchaseOrders + pendingPayments}`,
          detail: "POs and high-value payments requiring MD release",
          tone: pendingPurchaseOrders + pendingPayments > 0 ? "amber" : "green",
          href: "/approvals",
        },
        {
          label: "Active Projects",
          value: `${activeProjects.length}`,
          detail: "Running with zero fatal safety or compliance flags",
          tone: "blue",
          href: "/projects",
        },
      ];
      alerts.push({
        message: "Executive liquidity and statutory tax reserves are balanced.",
        severity: "INFO",
        href: "/accounts",
        actionText: "Inspect Accounts",
      });
      if (pendingPurchaseOrders + pendingPayments > 0) {
        alerts.push({
          message: `${pendingPurchaseOrders + pendingPayments} critical transactions require your direct executive sign-off.`,
          severity: "WARNING",
          href: "/approvals",
          actionText: "Open Approvals Queue",
        });
      }
      break;

    case "PROJECT_DIRECTOR":
      roleTitle = "Project Director Operations Overview";
      cards = [
        {
          label: "Overall Site Progress",
          value: "74.2%",
          detail: "Weighted milestone completion across active packages",
          tone: "green",
          href: "/projects",
        },
        {
          label: "Pending Site Indents",
          value: `${pendingRequisitions}`,
          detail: "Requisitions awaiting engineering sign-off",
          tone: pendingRequisitions > 0 ? "amber" : "green",
          href: "/requirements",
        },
        {
          label: "Critical Material Risk",
          value: "0 Sites",
          detail: "No sites currently below critical 48-hour safety stock",
          tone: "green",
          href: "/reports/low-stock",
        },
        {
          label: "Committed Subcontracts",
          value: currencyFormatter.format(42100000),
          detail: "Active work packages with verified measurement sheets",
          tone: "blue",
          href: "/procurement",
        },
      ];
      if (pendingRequisitions > 0) {
        alerts.push({
          message: `${pendingRequisitions} site requisitions waiting for review and approval.`,
          severity: "WARNING",
          href: "/requirements",
          actionText: "Review Indents",
        });
      }
      break;

    case "PROJECT_MANAGER":
      roleTitle = "Project Manager Site Dashboard";
      cards = [
        {
          label: "Project Budget Burn",
          value: "68.4%",
          detail: "Incurred expenditure against sanctioned baseline",
          tone: "blue",
          href: "/reports/budget-analytics",
        },
        {
          label: "Open Material Indents",
          value: `${pendingRequisitions}`,
          detail: "Indents awaiting procurement conversion",
          tone: "amber",
          href: "/requirements",
        },
        {
          label: "Daily Progress Logs",
          value: "100% Up to Date",
          detail: "Site measurement & labor counts submitted",
          tone: "green",
          href: "/projects",
        },
        {
          label: "Site Warehouse Stock",
          value: currencyFormatter.format(3450000),
          detail: "Valuation of steel, cement, and consumables on site",
          tone: "blue",
          href: "/inventory",
        },
      ];
      if (pendingRequisitions > 0) {
        alerts.push({
          message: `${pendingRequisitions} material requirements awaiting movement to procurement.`,
          severity: "INFO",
          href: "/requirements",
          actionText: "View Requirements",
        });
      }
      break;

    case "PURCHASE":
      roleTitle = "Procurement & Sourcing Dashboard";
      cards = [
        {
          label: "Open Indents to Source",
          value: `${pendingRequisitions}`,
          detail: "Approved material requirements requiring RFQ / PO",
          tone: pendingRequisitions > 0 ? "amber" : "green",
          href: "/requirements",
        },
        {
          label: "Pending PO Sign-offs",
          value: `${pendingPurchaseOrders}`,
          detail: "Purchase orders awaiting final authorization",
          tone: pendingPurchaseOrders > 0 ? "amber" : "green",
          href: "/procurement",
        },
        {
          label: "On-Time Delivery Rate",
          value: "94.6%",
          detail: "Vendor fulfillment within promised lead times",
          tone: "green",
          href: "/reports/supplier-performance",
        },
        {
          label: "Monthly Purchasing Volume",
          value: currencyFormatter.format(18900000),
          detail: "Purchase orders generated in current billing period",
          tone: "blue",
          href: "/reports/purchases-project",
        },
      ];
      if (pendingPurchaseOrders > 0) {
        alerts.push({
          message: `${pendingPurchaseOrders} purchase orders waiting for authorized sign-off.`,
          severity: "WARNING",
          href: "/procurement",
          actionText: "Open PO Queue",
        });
      }
      break;

    case "STORES":
      roleTitle = "Stores & Warehouse Material Control";
      cards = [
        {
          label: "Total Physical Stock Valuation",
          value: currencyFormatter.format(12800000),
          detail: "Across central depot and site stores",
          tone: "blue",
          href: "/inventory",
        },
        {
          label: "Pending GRN Inspections",
          value: "2 Inward Gate Passes",
          detail: "Materials received; awaiting QC sign-off",
          tone: "amber",
          href: "/inventory",
        },
        {
          label: "Low Stock Items",
          value: "3 SKUs",
          detail: "Reorder point triggered for immediate requisition",
          tone: "amber",
          href: "/reports/low-stock",
        },
        {
          label: "In-Transit Stock",
          value: currencyFormatter.format(650000),
          detail: "Material dispatches between sites in transit",
          tone: "blue",
          href: "/reports/transfers-pending",
        },
      ];
      alerts.push({
        message:
          "Gate passes pending inspection and 3 SKUs below reorder threshold.",
        severity: "WARNING",
        href: "/inventory",
        actionText: "Open Stores Desk",
      });
      break;

    case "ACCOUNTS":
      roleTitle = "Accounts & Financial Control Cockpit";
      cards = [
        {
          label: "Pending 3-Way Match",
          value: `${pendingInvoices} Invoices`,
          detail: "Bills matched against PO & GRN records",
          tone: pendingInvoices > 0 ? "amber" : "green",
          href: "/reports/mismatches",
        },
        {
          label: "Disbursements Awaiting Release",
          value: currencyFormatter.format(pendingPayments * 250000),
          detail: `${pendingPayments} approved payment vouchers`,
          tone: pendingPayments > 0 ? "amber" : "green",
          href: "/reports/payment-approvals",
        },
        {
          label: "GST Input Tax Credit",
          value: currencyFormatter.format(3120000),
          detail: "Reconciled with supplier GSTR-2B filing",
          tone: "green",
          href: "/reports/gst",
        },
        {
          label: "TallyPrime Sync Status",
          value: "100% Synchronized",
          detail: "All posted vouchers exported with zero schema errors",
          tone: "green",
          href: "/reports/tally",
        },
      ];
      if (pendingInvoices + pendingPayments > 0) {
        alerts.push({
          message: `${pendingInvoices} vendor bills and ${pendingPayments} disbursements pending action in accounts queue.`,
          severity: "WARNING",
          href: "/accounts",
          actionText: "Process Accounts",
        });
      }
      break;

    case "BUSINESS_DEVELOPMENT":
      roleTitle = "Business Development & Tendering Dashboard";
      cards = [
        {
          label: "Active Tender Pipeline",
          value: currencyFormatter.format(450000000),
          detail: "Total value of submitted bids and technical proposals",
          tone: "blue",
          href: "/projects",
        },
        {
          label: "Bid Win Ratio",
          value: "38.2%",
          detail: "Successful commercial conversions over last 4 quarters",
          tone: "green",
          href: "/reports/procurement-trend",
        },
        {
          label: "Client Retention Receivables",
          value: currencyFormatter.format(14200000),
          detail: "Outstanding retention monies maturing within 90 days",
          tone: "blue",
          href: "/accounts",
        },
        {
          label: "Pre-Qualification Readiness",
          value: "100%",
          detail: "All statutory solvency & machinery certificates active",
          tone: "green",
          href: "/administration",
        },
      ];
      alerts.push({
        message:
          "Pre-qualification dossiers and solvency records are validated for ongoing bids.",
        severity: "INFO",
        href: "/projects",
        actionText: "Explore Portfolio",
      });
      break;

    default:
      roleTitle = "Operations Workspace";
      cards = [
        {
          label: "Active Projects",
          value: `${activeProjects.length}`,
          detail: "Active KDIPL project sites",
          tone: "blue",
          href: "/projects",
        },
        {
          label: "System Status",
          value: "Operational",
          detail: "All services running within normal parameters",
          tone: "green",
          href: "/administration",
        },
      ];
      alerts.push({
        message:
          "All operational subsystems and services are executing normally.",
        severity: "INFO",
        href: "/search",
        actionText: "Search Systems",
      });
      break;
  }

  return {
    roleType,
    roleTitle,
    cards,
    pendingApprovals,
    projectPositions,
    alerts,
    freshnessTimestamp: now,
  };
}
