export type AutomatedAlertTrigger =
  | "APPROVAL_REMINDER"
  | "OVERDUE_PO"
  | "DELAYED_GRN"
  | "LOW_STOCK"
  | "PAYMENT_REMINDER"
  | "PENDING_INVOICE_VERIFICATION"
  | "STOCK_COUNT_REMINDER"
  | "PROJECT_CLOSE_REMINDER"
  | "SCHEDULED_MANAGEMENT_REPORT";

export type WorkflowAlert = {
  id: string;
  trigger: AutomatedAlertTrigger;
  severity: "INFO" | "WARNING" | "CRITICAL";
  targetRole: string;
  title: string;
  body: string;
  actionUrl: string;
  referenceId: string;
  generatedAt: string;
};

export class WorkflowAutomationEngine {
  /**
   * Evaluates pending documents and operational timelines to generate automated actionable alerts.
   */
  static runAutomationCycle(context: {
    pendingRequisitions: { id: string; code: string; ageHours: number }[];
    overduePurchaseOrders: {
      id: string;
      poNumber: string;
      vendorName: string;
      overdueDays: number;
    }[];
    delayedGoodsReceipts: {
      id: string;
      challanNumber: string;
      hoursSinceGatePass: number;
    }[];
    lowStockMaterials: {
      id: string;
      materialName: string;
      currentStock: number;
      unit: string;
      siteName: string;
    }[];
    pendingPaymentsDue: {
      id: string;
      invoiceNumber: string;
      vendorName: string;
      amount: number;
      daysUntilDue: number;
    }[];
    pendingInvoiceVerifications: {
      id: string;
      invoiceNumber: string;
      ageHours: number;
    }[];
    projectsNearCompletion: {
      id: string;
      projectName: string;
      openPOsCount: number;
      unconsumedStockCount: number;
    }[];
  }): WorkflowAlert[] {
    const alerts: WorkflowAlert[] = [];
    const timestamp = new Date().toISOString();

    // 1. Approval Reminders (Pending Requisitions > 24 hours)
    for (const req of context.pendingRequisitions) {
      if (req.ageHours >= 24) {
        alerts.push({
          id: `alert-req-${req.id}`,
          trigger: "APPROVAL_REMINDER",
          severity: req.ageHours >= 48 ? "CRITICAL" : "WARNING",
          targetRole: "PROJECT_DIRECTOR",
          title: `Requisition Approval Overdue: ${req.code}`,
          body: `Material requirement ${req.code} has been awaiting approval for ${req.ageHours} hours. Expedite review to prevent site downtime.`,
          actionUrl: `/requirements`,
          referenceId: req.id,
          generatedAt: timestamp,
        });
      }
    }

    // 2. Overdue Purchase Orders
    for (const po of context.overduePurchaseOrders) {
      alerts.push({
        id: `alert-po-${po.id}`,
        trigger: "OVERDUE_PO",
        severity: po.overdueDays >= 5 ? "CRITICAL" : "WARNING",
        targetRole: "PURCHASE_MANAGER",
        title: `Overdue PO Delivery: ${po.poNumber}`,
        body: `PO ${po.poNumber} for ${po.vendorName} is delayed by ${po.overdueDays} days beyond agreed delivery schedule. Contact vendor.`,
        actionUrl: `/procurement`,
        referenceId: po.id,
        generatedAt: timestamp,
      });
    }

    // 3. Delayed GRN Inspections (> 4 hours since gate pass entry)
    for (const grn of context.delayedGoodsReceipts) {
      if (grn.hoursSinceGatePass >= 4) {
        alerts.push({
          id: `alert-grn-${grn.id}`,
          trigger: "DELAYED_GRN",
          severity: "WARNING",
          targetRole: "STORES_MANAGER",
          title: `Pending QC Inspection: Challan #${grn.challanNumber}`,
          body: `Materials under Challan ${grn.challanNumber} arrived ${grn.hoursSinceGatePass} hours ago and have not completed quality inspection.`,
          actionUrl: `/inventory`,
          referenceId: grn.id,
          generatedAt: timestamp,
        });
      }
    }

    // 4. Low Stock Alerts
    for (const mat of context.lowStockMaterials) {
      alerts.push({
        id: `alert-stock-${mat.id}`,
        trigger: "LOW_STOCK",
        severity: "CRITICAL",
        targetRole: "PURCHASE_MANAGER",
        title: `Critical Low Stock at ${mat.siteName}`,
        body: `${mat.materialName} is at ${mat.currentStock} ${mat.unit}, breaching minimum safety stock levels.`,
        actionUrl: `/inventory`,
        referenceId: mat.id,
        generatedAt: timestamp,
      });
    }

    // 5. Payment Reminders (Maturity within 3 days or overdue)
    for (const pay of context.pendingPaymentsDue) {
      const isOverdue = pay.daysUntilDue < 0;
      alerts.push({
        id: `alert-pay-${pay.id}`,
        trigger: "PAYMENT_REMINDER",
        severity: isOverdue ? "CRITICAL" : "WARNING",
        targetRole: "ACCOUNTS_ADMIN",
        title: isOverdue
          ? `Overdue Payment: Invoice ${pay.invoiceNumber}`
          : `Payment Due in ${pay.daysUntilDue} Days: ${pay.invoiceNumber}`,
        body: `Payment of ₹${pay.amount.toLocaleString("en-IN")} to ${pay.vendorName} is ${isOverdue ? "overdue" : "maturing soon"}. Prepare disbursement voucher.`,
        actionUrl: `/accounts`,
        referenceId: pay.id,
        generatedAt: timestamp,
      });
    }

    // 6. Pending Invoice Verification
    for (const inv of context.pendingInvoiceVerifications) {
      if (inv.ageHours >= 24) {
        alerts.push({
          id: `alert-inv-${inv.id}`,
          trigger: "PENDING_INVOICE_VERIFICATION",
          severity: "WARNING",
          targetRole: "ACCOUNTS",
          title: `Pending 3-Way Match: ${inv.invoiceNumber}`,
          body: `Vendor invoice ${inv.invoiceNumber} has been awaiting 3-way match verification for ${inv.ageHours} hours.`,
          actionUrl: `/accounts`,
          referenceId: inv.id,
          generatedAt: timestamp,
        });
      }
    }

    // 7. Project Close Reminders
    for (const proj of context.projectsNearCompletion) {
      if (proj.openPOsCount > 0 || proj.unconsumedStockCount > 0) {
        alerts.push({
          id: `alert-proj-close-${proj.id}`,
          trigger: "PROJECT_CLOSE_REMINDER",
          severity: "INFO",
          targetRole: "PROJECT_DIRECTOR",
          title: `Project Close Blockers: ${proj.projectName}`,
          body: `Project nearing completion has ${proj.openPOsCount} unclosed POs and ${proj.unconsumedStockCount} unconsumed stock line items requiring settlement.`,
          actionUrl: `/projects`,
          referenceId: proj.id,
          generatedAt: timestamp,
        });
      }
    }

    return alerts;
  }
}
