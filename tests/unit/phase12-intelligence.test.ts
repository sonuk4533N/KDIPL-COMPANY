import { describe, expect, it } from "vitest";

import { resolveRoleDashboardType } from "@/server/intelligence/dashboard-service";
import { AdvancedAnalyticsEngine } from "@/server/intelligence/analytics-service";
import { BudgetCostControlEngine } from "@/server/intelligence/budget-control-service";
import { SupplierIntelligenceEngine } from "@/server/intelligence/supplier-intelligence-service";
import { InventoryOptimizationEngine } from "@/server/intelligence/inventory-optimization-service";
import { WorkflowAutomationEngine } from "@/server/intelligence/workflow-automation-service";
import { DocumentSearchIntelligenceEngine } from "@/server/intelligence/document-search-intelligence";
import { EnterpriseIntegrationHub } from "@/server/intelligence/integration-layer";
import { MobileFieldOptimizationEngine } from "@/server/intelligence/mobile-field-service";
import { GovernanceAuditEngine } from "@/server/intelligence/governance-audit-service";
import { PredictiveAdvisoryEngine } from "@/server/intelligence/predictive-advisory-service";
import type { AuthenticatedPrincipal } from "@/types/application";

describe("Phase 12A: Advanced Management Dashboard", () => {
  it("correctly resolves specialized dashboard types based on role priority", () => {
    const mdPrincipal = {
      userId: "u-md",
      roleCodes: ["MANAGING_DIRECTOR", "ADMIN"],
    } as unknown as AuthenticatedPrincipal;
    const pdPrincipal = {
      userId: "u-pd",
      roleCodes: ["PROJECT_DIRECTOR"],
    } as unknown as AuthenticatedPrincipal;
    const pmPrincipal = {
      userId: "u-pm",
      roleCodes: ["PROJECT_MANAGER"],
    } as unknown as AuthenticatedPrincipal;
    const purchasePrincipal = {
      userId: "u-pur",
      roleCodes: ["PURCHASE_MANAGER"],
    } as unknown as AuthenticatedPrincipal;
    const storesPrincipal = {
      userId: "u-str",
      roleCodes: ["STORES_MANAGER"],
    } as unknown as AuthenticatedPrincipal;
    const accountsPrincipal = {
      userId: "u-acc",
      roleCodes: ["ACCOUNTS_ADMIN"],
    } as unknown as AuthenticatedPrincipal;
    const bdPrincipal = {
      userId: "u-bd",
      roleCodes: ["BUSINESS_DEVELOPMENT_DIRECTOR"],
    } as unknown as AuthenticatedPrincipal;

    expect(resolveRoleDashboardType(mdPrincipal)).toBe("MANAGING_DIRECTOR");
    expect(resolveRoleDashboardType(pdPrincipal)).toBe("PROJECT_DIRECTOR");
    expect(resolveRoleDashboardType(pmPrincipal)).toBe("PROJECT_MANAGER");
    expect(resolveRoleDashboardType(purchasePrincipal)).toBe("PURCHASE");
    expect(resolveRoleDashboardType(storesPrincipal)).toBe("STORES");
    expect(resolveRoleDashboardType(accountsPrincipal)).toBe("ACCOUNTS");
    expect(resolveRoleDashboardType(bdPrincipal)).toBe("BUSINESS_DEVELOPMENT");
  });
});

describe("Phase 12B: Advanced Reports & Analytics", () => {
  it("accurately computes project profitability margins", () => {
    const report = AdvancedAnalyticsEngine.computeProjectProfitability({
      projectId: "p-01",
      projectName: "KDIPL Tech Park",
      contractValue: 10000000,
      billedToClient: 6000000,
      collectedFromClient: 5500000,
      materialCost: 2400000,
      laborCost: 1200000,
      equipmentCost: 400000,
      subcontractorCost: 500000,
      overheadCost: 300000,
    });

    // Direct = 24L + 12L + 4L + 5L = 45L
    // Gross = 60L - 45L = 15L (25%)
    // Total Cost = 45L + 3L = 48L
    // Net Profit = 60L - 48L = 12L (20%)
    expect(report.totalCost).toBe(4800000);
    expect(report.grossProfit).toBe(1500000);
    expect(report.grossProfitMarginPercent).toBe(25.0);
    expect(report.netProfit).toBe(1200000);
    expect(report.netProfitMarginPercent).toBe(20.0);
  });

  it("calculates material consumption moving average and trend direction", () => {
    const trend = AdvancedAnalyticsEngine.evaluateConsumptionTrend(
      "MAT-STEEL-16",
      "16mm TMT Fe550D Steel",
      "MT",
      [
        { period: "April", consumedQuantity: 100, cost: 5500000 },
        { period: "May", consumedQuantity: 120, cost: 6600000 },
        { period: "June", consumedQuantity: 140, cost: 7700000 },
      ],
    );

    expect(trend.movingAverageQuantity).toBe(120.0);
    expect(trend.trendDirection).toBe("UPWARD");
  });

  it("classifies stock into accurate aging buckets and identifies dead stock", () => {
    const buckets = AdvancedAnalyticsEngine.calculateStockAgingBuckets([
      { daysInStock: 15, valuation: 100000 },
      { daysInStock: 45, valuation: 200000 },
      { daysInStock: 75, valuation: 150000 },
      { daysInStock: 120, valuation: 50000 },
    ]);

    expect(buckets[0].bucketName).toBe("0-30 Days");
    expect(buckets[0].valuation).toBe(100000);
    expect(buckets[3].bucketName).toBe("90+ Days");
    expect(buckets[3].valuation).toBe(50000);

    const deadStock = AdvancedAnalyticsEngine.identifyDeadStock([
      {
        materialId: "m-01",
        materialCode: "MAT-OBSOLETE",
        materialName: "Obsolete Admixture",
        locationName: "Central Store",
        currentStock: 25,
        unit: "Litre",
        daysSinceLastIssue: 105,
        unitRate: 400,
      },
      {
        materialId: "m-02",
        materialCode: "MAT-ACTIVE",
        materialName: "Active Cement",
        locationName: "Site Store",
        currentStock: 100,
        unit: "Bags",
        daysSinceLastIssue: 10,
        unitRate: 350,
      },
    ]);

    expect(deadStock).toHaveLength(1);
    expect(deadStock[0].category).toBe("DEAD_STOCK");
    expect(deadStock[0].valuation).toBe(10000);
  });

  it("analyzes wastage and flags excessive variance", () => {
    const okWastage = AdvancedAnalyticsEngine.analyzeWastage({
      materialCode: "STEEL",
      materialName: "TMT Bar",
      totalInwardQuantity: 100,
      theoreticalConsumption: 95,
      actualConsumption: 97, // 2 units waste = 2.1% (<= 3.0%)
      permissibleWastagePercent: 3.0,
    });
    expect(okWastage.varianceStatus).toBe("WITHIN_LIMIT");

    const badWastage = AdvancedAnalyticsEngine.analyzeWastage({
      materialCode: "TILES",
      materialName: "Granite Slabs",
      totalInwardQuantity: 500,
      theoreticalConsumption: 400,
      actualConsumption: 440, // 40 units waste = 10% (> 4.0%)
      permissibleWastagePercent: 4.0,
    });
    expect(badWastage.varianceStatus).toBe("EXCESSIVE");
  });
});

describe("Phase 12C: Budget & Cost Control", () => {
  it("enforces budget controls, variance tracking, and threshold locks", () => {
    const position = BudgetCostControlEngine.evaluateBudgetControl({
      projectId: "proj-101",
      category: "STEEL_REINFORCEMENT",
      sanctionedBudget: 10000000,
      actualIncurred: 7500000,
      committedCost: 1000000, // Total = 85L (85%)
      estimatedCostToComplete: 2000000,
    });

    expect(position.consumptionPercent).toBe(85.0);
    expect(position.thresholdStatus).toBe("APPROACHING_LIMIT");
    expect(position.lockProcurement).toBe(false);

    // Test breach
    const breachCheck = BudgetCostControlEngine.validateProcurementThreshold(
      position,
      2000000, // 85L + 20L = 105L (> 100L)
    );

    expect(breachCheck.approved).toBe(false);
    expect(breachCheck.requiresDirectorOverride).toBe(true);
    expect(breachCheck.newConsumptionPercent).toBe(105.0);
  });
});

describe("Phase 12D: Supplier Intelligence", () => {
  it("computes OTIF rate, quality acceptance, and ranks preferred vendors", () => {
    const scorecard = SupplierIntelligenceEngine.computeSupplierScorecard(
      "sup-01",
      "Apex Steel Industries",
      [
        {
          poNumber: "PO-1",
          expectedDate: "2026-05-01",
          actualDate: "2026-05-01",
          orderedQty: 100,
          receivedQty: 100,
          acceptedQty: 100,
          rejectedQty: 0,
          unitPrice: 55,
        },
        {
          poNumber: "PO-2",
          expectedDate: "2026-06-01",
          actualDate: "2026-06-01",
          orderedQty: 200,
          receivedQty: 200,
          acceptedQty: 195,
          rejectedQty: 5,
          unitPrice: 56,
        },
      ],
    );

    expect(scorecard.totalOrders).toBe(2);
    expect(scorecard.onTimeInFullRatePercent).toBe(100);
    expect(scorecard.rejectionRatePercent).toBe(1.7);
    expect(scorecard.compositeScore).toBeGreaterThanOrEqual(90);
    expect(scorecard.tier).toBe("PLATINUM_PREFERRED");

    // Vendor comparison
    const comparison = SupplierIntelligenceEngine.compareSuppliers(
      "STEEL",
      "TMT Steel",
      [
        {
          supplierId: "s-1",
          supplierName: "Vendor High Price Good Score",
          latestPrice: 60,
          records: [
            {
              poNumber: "PO-1",
              expectedDate: "2026-05-01",
              actualDate: "2026-05-01",
              orderedQty: 50,
              receivedQty: 50,
              acceptedQty: 50,
              rejectedQty: 0,
              unitPrice: 60,
            },
          ],
        },
        {
          supplierId: "s-2",
          supplierName: "Vendor Low Price Delayed Delivery",
          latestPrice: 52,
          records: [
            {
              poNumber: "PO-2",
              expectedDate: "2026-05-01",
              actualDate: "2026-05-15", // 14 days delay
              orderedQty: 50,
              receivedQty: 40,
              acceptedQty: 35,
              rejectedQty: 5,
              unitPrice: 52,
            },
          ],
        },
      ],
    );

    expect(comparison.suppliers[0].supplierId).toBe("s-1");
    expect(comparison.suppliers[0].preferredRank).toBe(1);
  });
});

describe("Phase 12E: Inventory Optimization", () => {
  it("calculates ROP, safety stock, and identifies low-stock triggers", () => {
    const policy = InventoryOptimizationEngine.computeStockPolicy({
      materialId: "mat-c-01",
      materialCode: "CEMENT-53",
      materialName: "OPC 53 Cement",
      unit: "Bags",
      locationId: "loc-site-a",
      locationName: "Site Alpha Central",
      currentStock: 40,
      averageDailyUsage: 20,
      leadTimeDays: 3,
      leadTimeDemandVariabilityFactor: 1.65,
      maxDailyUsage: 30,
      maxLeadTimeDays: 5,
    });

    // avgLeadTimeDemand = 20 * 3 = 60
    // maxLeadTimeDemand = 30 * 5 = 150
    // safetyStock = 150 - 60 = 90
    // reorderPoint = 60 + 90 = 150
    expect(policy.safetyStock).toBe(90);
    expect(policy.reorderPoint).toBe(150);
    // currentStock = 40 <= safetyStock (90) -> CRITICAL_SHORTAGE
    expect(policy.inventoryStatus).toBe("CRITICAL_SHORTAGE");
  });
});

describe("Phase 12F: Workflow Automation", () => {
  it("generates automated alerts for overdue requisitions, POs, and delayed GRNs", () => {
    const alerts = WorkflowAutomationEngine.runAutomationCycle({
      pendingRequisitions: [{ id: "r-1", code: "REQ-101", ageHours: 36 }],
      overduePurchaseOrders: [
        {
          id: "po-1",
          poNumber: "PO-501",
          vendorName: "Steel Corp",
          overdueDays: 4,
        },
      ],
      delayedGoodsReceipts: [
        { id: "grn-1", challanNumber: "CH-999", hoursSinceGatePass: 6 },
      ],
      lowStockMaterials: [
        {
          id: "m-1",
          materialName: "Bitumen",
          currentStock: 5,
          unit: "Drums",
          siteName: "Highway Site",
        },
      ],
      pendingPaymentsDue: [
        {
          id: "p-1",
          invoiceNumber: "INV-88",
          vendorName: "Cement Co",
          amount: 500000,
          daysUntilDue: -2,
        },
      ],
      pendingInvoiceVerifications: [
        { id: "inv-1", invoiceNumber: "INV-77", ageHours: 30 },
      ],
      projectsNearCompletion: [
        {
          id: "proj-1",
          projectName: "Bridge Alpha",
          openPOsCount: 2,
          unconsumedStockCount: 5,
        },
      ],
    });

    expect(alerts.length).toBe(7);
    expect(alerts.map((a) => a.trigger)).toContain("APPROVAL_REMINDER");
    expect(alerts.map((a) => a.trigger)).toContain("OVERDUE_PO");
    expect(alerts.map((a) => a.trigger)).toContain("DELAYED_GRN");
    expect(alerts.map((a) => a.trigger)).toContain("LOW_STOCK");
    expect(alerts.map((a) => a.trigger)).toContain("PAYMENT_REMINDER");
  });
});

describe("Phase 12G: Document & Search Intelligence", () => {
  it("extracts structured GSTIN, Invoice number, and totals via OCR simulation", () => {
    const sampleDoc = `
      TAX INVOICE
      Supplier: Apex Infra Materials Pvt Ltd
      GSTIN: 27AABCA1234F1Z5
      Invoice No: INV/2026/0442
      Date: 12-08-2026
      PO Ref: PO-2026-901
      Total: Rs. 1,45,200.00
    `;

    const extracted =
      DocumentSearchIntelligenceEngine.extractInvoiceMetadataFromText(
        sampleDoc,
      );

    expect(extracted.success).toBe(true);
    expect(extracted.fields.vendorGstin).toBe("27AABCA1234F1Z5");
    expect(extracted.fields.invoiceNumber).toBe("INV/2026/0442");
    expect(extracted.fields.poReferenceNumber).toBe("PO-2026-901");
    expect(extracted.fields.totalInvoiceAmount).toBe(145200);
    expect(extracted.confidencePercent).toBe(100);
  });
});

describe("Phase 12H: Integration Layer", () => {
  it("generates valid Tally XML, banking payment batch, and GSTR-2B reconciliation", () => {
    const tallyXml = EnterpriseIntegrationHub.generateTallyXml({
      voucherType: "Payment",
      voucherNumber: "PV-2026-001",
      date: "20260920",
      narration: "Vendor payment for cement supply",
      ledgerEntries: [
        {
          ledgerName: "Ambuja Cements Ltd",
          isDeemedPositive: true,
          amount: 250000,
        },
        {
          ledgerName: "HDFC Bank Corporate",
          isDeemedPositive: false,
          amount: 250000,
        },
      ],
    });

    expect(tallyXml).toContain('<VOUCHER VCHTYPE="Payment" ACTION="Create">');
    expect(tallyXml).toContain("<LEDGERNAME>Ambuja Cements Ltd</LEDGERNAME>");
    expect(tallyXml).toContain("<AMOUNT>-250000</AMOUNT>");

    const bankCsv = EnterpriseIntegrationHub.generateBankPaymentBatchFile({
      batchId: "BATCH-01",
      corporateAccountNumber: "50200012345678",
      batchTotalAmount: 250000,
      totalTransactionsCount: 1,
      transactions: [
        {
          instructionId: "TXN-101",
          beneficiaryName: "Ambuja Cements Ltd",
          beneficiaryAccountNumber: "998877665544",
          beneficiaryIfsc: "HDFC0001234",
          amount: 250000,
          paymentMode: "NEFT",
        },
      ],
    });

    expect(bankCsv).toContain(
      "NEFT|50200012345678|Ambuja Cements Ltd|998877665544|HDFC0001234|250000.00|TXN-101",
    );

    // GSTR-2B matching
    const reconciliation = EnterpriseIntegrationHub.reconcileGstr2bInvoices(
      [
        {
          supplierGstin: "27ABCDE1234F1Z1",
          invoiceNumber: "INV-1",
          taxableValue: 100000,
          taxAmount: 18000,
        },
      ],
      [
        {
          supplierGstin: "27ABCDE1234F1Z1",
          supplierInvoiceNumber: "INV-1",
          invoiceDate: "2026-09-01",
          taxableValue: 100000,
          integratedTax: 18000,
          centralTax: 0,
          stateTax: 0,
          portalStatus: "AVAILABLE",
        },
      ],
    );

    expect(reconciliation.matchedCount).toBe(1);
    expect(reconciliation.eligibleItcTotal).toBe(18000);
  });
});

describe("Phase 12I: Mobile & Field Optimization", () => {
  it("validates quick material requests and mobile GRN damage tracking", () => {
    const req = MobileFieldOptimizationEngine.processQuickMaterialRequest({
      projectId: "proj-1",
      siteId: "site-1",
      urgency: "EMERGENCY",
      items: [{ materialId: "mat-1", quantity: 50, unit: "Bags" }],
      siteSupervisorId: "usr-sup",
    });

    expect(req.valid).toBe(true);
    expect(req.requestDraft.requiresDirectorFastTrack).toBe(true);

    const grn = MobileFieldOptimizationEngine.processMobileGoodsReceipt({
      poId: "po-1",
      challanNumber: "CH-5544",
      challanDate: "2026-09-20",
      deliveryVehicleNumber: "MH-12-AB-1234",
      receivedItems: [
        {
          materialId: "mat-1",
          receivedQty: 100,
          acceptedQty: 85,
          damagedQty: 15,
        },
      ],
      photoEvidenceUrls: ["https://storage.kdipl.com/evidence/ch-5544.jpg"],
      storeKeeperId: "usr-store",
    });

    expect(grn.valid).toBe(true);
    expect(grn.hasDamagedItems).toBe(true);
    expect(grn.totalReceivedQuantity).toBe(100);
  });
});

describe("Phase 12J: Advanced Audit & Governance", () => {
  it("flags unusual hour transactions, high-value disbursements, and discrepancy variances", () => {
    const anomalies = GovernanceAuditEngine.scanTransactionsForAnomalies({
      transactions: [
        {
          id: "tx-1",
          type: "PAYMENT_VOUCHER",
          amount: 2500000, // > 5L (CRITICAL high-value)
          timestamp: "2026-09-20T18:30:00.000Z", // 00:00 IST (Unusual hours)
          userId: "usr-admin",
        },
        {
          id: "tx-2",
          type: "STOCK_COUNT_RECONCILIATION",
          timestamp: "2026-09-20T06:30:00.000Z",
          userId: "usr-store",
          variancePercent: -4.5, // > 2% variance
        },
      ],
    });

    expect(anomalies.map((a) => a.anomalyType)).toContain(
      "UNUSUAL_HOURS_ACTIVITY",
    );
    expect(anomalies.map((a) => a.anomalyType)).toContain(
      "HIGH_VALUE_TRANSACTION",
    );
    expect(anomalies.map((a) => a.anomalyType)).toContain(
      "INVENTORY_DISCREPANCY_VARIANCE",
    );
  });
});

describe("Phase 12K: Automation & Predictive Intelligence (Assistive AI)", () => {
  it("strictly enforces advisory-only flags and human authorization guardrails", () => {
    const forecast = PredictiveAdvisoryEngine.forecastDemand({
      materialId: "mat-steel",
      materialName: "TMT Steel 20mm",
      historicalMonthlyUsage: [80, 90, 110, 120],
      unit: "MT",
      currentStock: 40,
      leadTimeDays: 7,
    });

    // Guard verification
    expect(forecast.isAdvisory).toBe(true);
    expect(forecast.requiresHumanAuthorization).toBe(true);
    expect(forecast.confidenceScorePercent).toBeGreaterThan(80);
    expect(forecast.metrics.forecastedMonthlyDemand).toBeGreaterThan(100);

    // Abnormal price detection
    const priceWarning = PredictiveAdvisoryEngine.detectAbnormalPrice({
      materialId: "mat-steel",
      materialName: "TMT Steel 20mm",
      proposedRate: 68000,
      historicalAverageRate: 55000, // +23.6% spike
      historicalLowRate: 52000,
      historicalHighRate: 58000,
    });

    expect(priceWarning).not.toBeNull();
    expect(priceWarning?.isAdvisory).toBe(true);
    expect(priceWarning?.requiresHumanAuthorization).toBe(true);
    expect(priceWarning?.type).toBe("ABNORMAL_PRICE_ALERT");

    // Consumption anomaly
    const anomaly = PredictiveAdvisoryEngine.detectConsumptionAnomaly({
      projectId: "p-01",
      projectName: "KDIPL Tech City",
      materialName: "Ready-Mix Concrete M30",
      actualDailyConsumption: 160,
      expectedDailyConsumption: 100, // +60% surge
      unit: "Cum",
    });

    expect(anomaly).not.toBeNull();
    expect(anomaly?.isAdvisory).toBe(true);
    expect(anomaly?.requiresHumanAuthorization).toBe(true);
    expect(anomaly?.type).toBe("CONSUMPTION_ANOMALY");
  });
});
