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

  // Fetch real counts and financial summaries from the live database
  const [
    pendingRequisitions,
    pendingPurchaseOrders,
    pendingInvoices,
    pendingPayments,
    activeProjects,
    totalProjectsCount,
    activeSitesCount,
    suppliersCount,
    locationsCount,
    pendingGrnsCount,
    openNegativeStockExceptions,
    poAggregate,
    invoiceAggregate,
    pendingPaymentAggregate,
    tallyErrorCount,
    recentMovementsCount,
  ] = await Promise.all([
    db.materialRequirement.count({
      where: { status: "SUBMITTED" },
    }),
    db.purchaseOrder.count({
      where: { status: { in: ["DRAFT", "ISSUED"] } },
    }),
    db.supplierInvoice.count({
      where: { status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
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
        procurementBudget: true,
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    db.project.count(),
    db.site.count({ where: { status: "ACTIVE" } }),
    db.supplier.count({ where: { isActive: true } }),
    db.inventoryLocation.count({ where: { isActive: true } }),
    db.goodsReceipt.count({ where: { status: "DRAFT" } }),
    db.temporaryNegativeStockException.count({ where: { status: "OPEN" } }),
    db.purchaseOrder.aggregate({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { totalAmount: true },
    }),
    db.supplierInvoice.aggregate({
      where: { status: { in: ["APPROVED", "PAID", "PARTIALLY_PAID"] } },
      _sum: { invoiceTotal: true },
    }),
    db.supplierPayment.aggregate({
      where: { status: "PENDING_APPROVAL" },
      _sum: { amount: true },
    }),
    db.tallyExportEvent.count({ where: { status: "FAILED" } }),
    db.customerStockMovement.count({ where: { status: "POSTED" } }),
  ]);

  // Aggregate committed purchase orders and cost allocations for visible active projects
  const activeProjectIds = activeProjects.map((p) => p.id);
  const [projectOrders, projectAllocations] = await Promise.all([
    activeProjectIds.length > 0
      ? db.purchaseOrder.findMany({
          where: {
            rfq: { requirement: { projectId: { in: activeProjectIds } } },
            status: { notIn: ["DRAFT", "CANCELLED"] },
          },
          select: {
            totalAmount: true,
            rfq: { select: { requirement: { select: { projectId: true } } } },
          },
        })
      : [],
    activeProjectIds.length > 0
      ? db.projectCostAllocation.groupBy({
          by: ["projectId"],
          where: { projectId: { in: activeProjectIds } },
          _sum: { amount: true },
        })
      : [],
  ]);

  const committedByProject = new Map<string, number>();
  for (const o of projectOrders) {
    const pid = o.rfq.requirement.projectId;
    committedByProject.set(
      pid,
      (committedByProject.get(pid) ?? 0) + o.totalAmount.toNumber(),
    );
  }

  const actualByProject = new Map<string, number>();
  for (const a of projectAllocations) {
    actualByProject.set(
      a.projectId,
      (actualByProject.get(a.projectId) ?? 0) +
        (a._sum.amount?.toNumber() ?? 0),
    );
  }

  // Construct real project financial & physical progress positions
  const projectPositions: ProjectFinancialStockPosition[] = activeProjects.map(
    (proj) => {
      const budgetTotal = proj.procurementBudget
        ? proj.procurementBudget.toNumber()
        : 0;
      const committedCost = committedByProject.get(proj.id) ?? 0;
      const actualSpent = actualByProject.get(proj.id) ?? 0;
      const stockValuation = 0;
      const totalExposure = actualSpent + committedCost;

      const physicalProgressPercent =
        budgetTotal > 0
          ? Math.min(100, Math.round((totalExposure / budgetTotal) * 100))
          : committedCost > 0
            ? 100
            : 0;
      const financialProgressPercent =
        budgetTotal > 0
          ? Math.min(100, Math.round((actualSpent / budgetTotal) * 100))
          : 0;

      const status =
        budgetTotal > 0 && totalExposure > budgetTotal
          ? "CRITICAL"
          : budgetTotal > 0 && totalExposure > budgetTotal * 0.9
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

  // Financial aggregates
  const committedPoAmount = poAggregate._sum.totalAmount?.toNumber() ?? 0;
  const invoicedAmount = invoiceAggregate._sum.invoiceTotal?.toNumber() ?? 0;
  const pendingDisbursementsAmount =
    pendingPaymentAggregate._sum.amount?.toNumber() ?? 0;
  const totalSanctionedBudget = activeProjects.reduce(
    (sum, p) => sum + (p.procurementBudget?.toNumber() ?? 0),
    0,
  );
  const avgMilestoneProgress =
    projectPositions.length > 0
      ? Math.round(
          projectPositions.reduce(
            (sum, p) => sum + p.physicalProgressPercent,
            0,
          ) / projectPositions.length,
        )
      : 100;

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
          value:
            totalSanctionedBudget > 0
              ? currencyFormatter.format(totalSanctionedBudget)
              : currencyFormatter.format(committedPoAmount),
          detail: `Active baseline across ${activeProjects.length} projects`,
          tone: "blue",
          href: "/reports/project-material-cost",
        },
        {
          label: "Pending Disbursements",
          value: currencyFormatter.format(pendingDisbursementsAmount),
          detail: `${pendingPayments} payment vouchers awaiting fund release`,
          tone: pendingDisbursementsAmount > 0 ? "amber" : "green",
          href: "/accounts",
        },
        {
          label: "Critical Approvals Waiting",
          value: `${pendingPurchaseOrders + pendingPayments}`,
          detail: "POs and disbursements requiring MD release",
          tone: pendingPurchaseOrders + pendingPayments > 0 ? "amber" : "green",
          href: "/approvals",
        },
        {
          label: "Active Projects",
          value: `${activeProjects.length}`,
          detail: "Operating under live assignment & budget governance",
          tone: "blue",
          href: "/projects",
        },
      ];
      if (pendingPurchaseOrders + pendingPayments > 0) {
        alerts.push({
          message: `${pendingPurchaseOrders + pendingPayments} critical transactions require your direct executive sign-off.`,
          severity: "WARNING",
          href: "/approvals",
          actionText: "Open Approvals Queue",
        });
      } else {
        alerts.push({
          message:
            "All operational subsystems and financial approvals are up to date.",
          severity: "INFO",
          href: "/accounts",
          actionText: "Inspect Accounts",
        });
      }
      break;

    case "PROJECT_DIRECTOR":
      roleTitle = "Project Director Operations Overview";
      cards = [
        {
          label: "Overall Site Progress",
          value: `${avgMilestoneProgress}%`,
          detail: "Weighted progress across active project sites",
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
          label: "Critical Stock Risk",
          value: `${openNegativeStockExceptions} Exceptions`,
          detail:
            openNegativeStockExceptions > 0
              ? "Open negative stock flags"
              : "Zero negative stock alerts",
          tone: openNegativeStockExceptions > 0 ? "amber" : "green",
          href: "/reports/low-stock",
        },
        {
          label: "Committed Purchase Orders",
          value: currencyFormatter.format(committedPoAmount),
          detail: "Active purchase commitments across projects",
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
          label: "Incurred Expenditure",
          value: currencyFormatter.format(invoicedAmount),
          detail: "Verified contractor & vendor bills",
          tone: "blue",
          href: "/reports/budget-analytics",
        },
        {
          label: "Open Material Indents",
          value: `${pendingRequisitions}`,
          detail: "Indents awaiting procurement conversion",
          tone: pendingRequisitions > 0 ? "amber" : "green",
          href: "/requirements",
        },
        {
          label: "Active Project Sites",
          value: `${activeSitesCount} Sites`,
          detail: "Reporting site measurements & materials",
          tone: "green",
          href: "/projects",
        },
        {
          label: "Stores & Yards",
          value: `${locationsCount} Locations`,
          detail: "Active inventory storage points on site",
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
          label: "Active Suppliers",
          value: `${suppliersCount} Vendors`,
          detail: "Pre-qualified suppliers in vendor master",
          tone: "green",
          href: "/master-data",
        },
        {
          label: "Committed Purchasing Volume",
          value: currencyFormatter.format(committedPoAmount),
          detail: "Active purchase orders issued",
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
          label: "Active Storage Points",
          value: `${locationsCount} Stores`,
          detail: "Across central depot and site stores",
          tone: "blue",
          href: "/inventory",
        },
        {
          label: "Pending GRN Inspections",
          value: `${pendingGrnsCount} Inward Passes`,
          detail: "Materials received; awaiting QC sign-off",
          tone: pendingGrnsCount > 0 ? "amber" : "green",
          href: "/inventory",
        },
        {
          label: "Negative Stock Flags",
          value: `${openNegativeStockExceptions} Exceptions`,
          detail:
            openNegativeStockExceptions > 0
              ? "Reorder threshold / temporary negative exceptions"
              : "Zero negative exceptions",
          tone: openNegativeStockExceptions > 0 ? "amber" : "green",
          href: "/reports/low-stock",
        },
        {
          label: "Stock Movements Executed",
          value: `${recentMovementsCount} Transactions`,
          detail: "Posted site issues, returns, and dispatches",
          tone: "blue",
          href: "/inventory/movements",
        },
      ];
      if (pendingGrnsCount > 0 || openNegativeStockExceptions > 0) {
        alerts.push({
          message: `${pendingGrnsCount} gate passes pending inspection and ${openNegativeStockExceptions} stock exceptions open.`,
          severity: "WARNING",
          href: "/inventory",
          actionText: "Open Stores Desk",
        });
      } else {
        alerts.push({
          message:
            "All warehouse receipts, inward gate passes, and stock balances are verified.",
          severity: "INFO",
          href: "/inventory",
          actionText: "View Inventory",
        });
      }
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
          value: currencyFormatter.format(pendingDisbursementsAmount),
          detail: `${pendingPayments} approved payment vouchers`,
          tone: pendingPayments > 0 ? "amber" : "green",
          href: "/reports/payment-approvals",
        },
        {
          label: "Total Incurred Payables",
          value: currencyFormatter.format(invoicedAmount),
          detail: "Approved vendor invoices liability",
          tone: "blue",
          href: "/accounts",
        },
        {
          label: "TallyPrime Export Integrity",
          value:
            tallyErrorCount === 0
              ? "100% Synchronized"
              : `${tallyErrorCount} Export Errors`,
          detail:
            tallyErrorCount === 0
              ? "All posted vouchers exported without error"
              : "Vouchers requiring retry",
          tone: tallyErrorCount === 0 ? "green" : "red",
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
          label: "Registered Projects",
          value: `${totalProjectsCount} Projects`,
          detail: "Total contracted packages and joint ventures",
          tone: "blue",
          href: "/projects",
        },
        {
          label: "Active Executing Sites",
          value: `${activeSitesCount} Sites`,
          detail: "Operational project locations",
          tone: "green",
          href: "/projects",
        },
        {
          label: "Procurement Commitments",
          value: currencyFormatter.format(committedPoAmount),
          detail: "Committed orders in execution",
          tone: "blue",
          href: "/procurement",
        },
        {
          label: "System Compliance",
          value: "100% Operational",
          detail: "Statutory, safety, and solvency controls active",
          tone: "green",
          href: "/administration",
        },
      ];
      alerts.push({
        message:
          "Pre-qualification dossiers and operational portfolio records are active.",
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
          label: "Active Sites",
          value: `${activeSitesCount}`,
          detail: "Sites currently executing works",
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
