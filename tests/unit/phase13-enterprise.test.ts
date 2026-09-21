import { describe, expect, it } from "vitest";

import {
  MultiCompanyFoundationService,
  ENTERPRISE_ENTITIES,
  type CompanyFinancialSummary,
} from "@/server/enterprise/multi-company-service";
import {
  MultiProjectScalingService,
  type InterProjectTransferRequest,
} from "@/server/enterprise/multi-project-service";
import {
  AdvancedProcurementService,
  type RateContractAgreement,
} from "@/server/enterprise/advanced-procurement-service";
import { AdvancedProjectCostService } from "@/server/enterprise/project-cost-service";
import {
  WorkforceManagementService,
  type LeaveBalance,
  type EmployeeDocumentRecord,
} from "@/server/enterprise/workforce-service";
import {
  ContractorVendorManagementService,
  type ContractorProfile,
  type WorkOrder,
} from "@/server/enterprise/contractor-service";
import {
  AssetEquipmentManagementService,
  type AssetRegisterEntry,
} from "@/server/enterprise/asset-management-service";
import {
  MaintenanceManagementService,
  type MaintenanceTicket,
} from "@/server/enterprise/maintenance-service";
import {
  CustomerBusinessDevelopmentService,
  type BusinessDevelopmentOpportunity,
} from "@/server/enterprise/crm-service";
import {
  AdvancedFinancialArchitectureService,
  type JournalVoucher,
  type FinancialPeriod,
} from "@/server/enterprise/advanced-finance-service";
import {
  EnterpriseGovernanceService,
  type DelegationOfAuthorityRecord,
} from "@/server/enterprise/enterprise-governance-service";
import { EnterpriseIntegrationPlatformService } from "@/server/enterprise/integration-platform-service";
import {
  EnterpriseScalabilityService,
  type BackgroundJob,
} from "@/server/enterprise/scalability-service";
import {
  EnterpriseSecurityService,
  type SamlUserAssertion,
} from "@/server/enterprise/enterprise-security-service";

describe("Phase 13A: Multi-Company Foundation", () => {
  it("resolves multi-company context with executive fallback and entity isolation", () => {
    const executiveCtx = MultiCompanyFoundationService.resolveCompanyContext({
      requestedCompanyCode: "KDINFRA",
      userRoleCodes: ["MANAGING_DIRECTOR"],
    });

    expect(executiveCtx.activeCompanyCode).toBe("KDINFRA");
    expect(executiveCtx.companyName).toBe(ENTERPRISE_ENTITIES.KDINFRA.name);
    expect(executiveCtx.isConsolidatedView).toBe(false);

    // Group consolidated view
    const groupCtx = MultiCompanyFoundationService.resolveCompanyContext({
      requestedCompanyCode: "GROUP",
      userRoleCodes: ["MANAGING_DIRECTOR"],
    });
    expect(groupCtx.isConsolidatedView).toBe(true);
    expect(groupCtx.companyName).toContain("Consolidated");
  });

  it("generates company-isolated sequence numbers", () => {
    const docNo = MultiCompanyFoundationService.generateCompanyDocumentNumber({
      companyCode: "KDIPL",
      documentType: "PO",
      financialYear: "2026-27",
      sequence: 42,
    });
    expect(docNo).toBe("KDIPL-PO-2627-00042");

    const infraDoc = MultiCompanyFoundationService.generateCompanyDocumentNumber({
      companyCode: "KDINFRA",
      documentType: "INV",
      financialYear: "2026-27",
      sequence: 1,
    });
    expect(infraDoc).toBe("KDINFRA-INV-2627-00001");
  });

  it("consolidates group financials and accurately eliminates inter-company balances", () => {
    const entities: CompanyFinancialSummary[] = [
      {
        companyCode: "KDIPL",
        companyName: "KDIPL Parent",
        annualRevenue: 100000000,
        operationalExpense: 80000000,
        grossMargin: 20000000,
        activeProjectsCount: 10,
        openCommitments: 15000000,
        cashReserve: 25000000,
        interCompanyPayable: 2000000,
        interCompanyReceivable: 5000000,
      },
      {
        companyCode: "KDINFRA",
        companyName: "KD Infra",
        annualRevenue: 50000000,
        operationalExpense: 40000000,
        grossMargin: 10000000,
        activeProjectsCount: 5,
        openCommitments: 8000000,
        cashReserve: 12000000,
        interCompanyPayable: 1000000,
        interCompanyReceivable: 1000000,
      },
    ];

    const rollup = MultiCompanyFoundationService.consolidateGroupFinancials(entities);
    // Eliminations: min(2M, 5M) + min(1M, 1M) = 2M + 1M = 3M
    expect(rollup.totalGrossRevenue).toBe(150000000);
    expect(rollup.interCompanyEliminations).toBe(3000000);
    expect(rollup.netConsolidatedRevenue).toBe(147000000);
    expect(rollup.groupGrossMargin).toBe(27000000);
    expect(rollup.totalActiveProjects).toBe(15);
  });
});

describe("Phase 13B: Multi-Project & Multi-Site Scaling", () => {
  it("advances inter-project stock transfer lifecycle through approval, dispatch, and receipt", () => {
    const initialTransfer: InterProjectTransferRequest = {
      transferId: "trf-01",
      transferNumber: "TRF-2627-0001",
      sourceProjectId: "p-01",
      sourceStoreId: "s-01",
      targetProjectId: "p-02",
      targetStoreId: "s-02",
      materialCode: "MAT-CEMENT-OPC53",
      materialName: "OPC 53 Grade Cement",
      requestedQuantity: 200,
      approvedQuantity: 0,
      dispatchedQuantity: 0,
      receivedQuantity: 0,
      unit: "Bags",
      status: "REQUESTED",
      transitLossQuantity: 0,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };

    // 1. Approve
    const approved = MultiProjectScalingService.processTransferStep(initialTransfer, "APPROVE", {
      approvedQty: 180,
    });
    expect(approved.status).toBe("APPROVED_SOURCE");
    expect(approved.approvedQuantity).toBe(180);

    // 2. Dispatch
    const dispatched = MultiProjectScalingService.processTransferStep(approved, "DISPATCH", {
      vehicleNumber: "HR-55-AB-1234",
    });
    expect(dispatched.status).toBe("IN_TRANSIT");
    expect(dispatched.dispatchedQuantity).toBe(180);
    expect(dispatched.gatePassNumber).toBeDefined();

    // 3. Receive with 2 bags transit loss
    const received = MultiProjectScalingService.processTransferStep(dispatched, "RECEIVE", {
      receivedQty: 178,
      transitLoss: 2,
    });
    expect(received.status).toBe("COMPLETED");
    expect(received.receivedQuantity).toBe(178);
    expect(received.transitLossQuantity).toBe(2);
  });

  it("identifies cross-project surplus and recommends cost-saving inter-site reallocations", () => {
    const proposals = MultiProjectScalingService.evaluateCrossProjectSurplus([
      {
        projectId: "p-rich",
        projectName: "Dwarka Highway",
        materialCode: "MAT-STEEL-16",
        materialName: "16mm TMT Bar",
        unit: "MT",
        unitRate: 55000,
        currentStock: 100, // surplus (safety = 20)
        safetyStockThreshold: 20,
        averageDailyBurn: 2,
      },
      {
        projectId: "p-poor",
        projectName: "Noida Elevated Road",
        materialCode: "MAT-STEEL-16",
        materialName: "16mm TMT Bar",
        unit: "MT",
        unitRate: 55000,
        currentStock: 5, // deficit (safety = 25)
        safetyStockThreshold: 25,
        averageDailyBurn: 3,
      },
    ]);

    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0].surplusProjectId).toBe("p-rich");
    expect(proposals[0].deficitProjectId).toBe("p-poor");
    expect(proposals[0].recommendedTransferQuantity).toBeGreaterThan(0);
    expect(proposals[0].estimatedCostSavings).toBeGreaterThan(0);
  });
});

describe("Phase 13C: Advanced Procurement", () => {
  it("resolves tiered procurement approval levels across monetary thresholds", () => {
    expect(
      AdvancedProcurementService.resolveProcurementApprovalLevel(35000).requiredAuthority,
    ).toBe("SITE_SUPERVISOR");
    expect(
      AdvancedProcurementService.resolveProcurementApprovalLevel(250000).requiredAuthority,
    ).toBe("PURCHASE_MANAGER");
    expect(
      AdvancedProcurementService.resolveProcurementApprovalLevel(1500000).requiredAuthority,
    ).toBe("PROJECT_DIRECTOR");
    expect(
      AdvancedProcurementService.resolveProcurementApprovalLevel(4500000).requiredAuthority,
    ).toBe("MANAGING_DIRECTOR");
  });

  it("validates Rate Contract (RC) orders against ceiling quantity and date windows", () => {
    const rc: RateContractAgreement = {
      contractId: "rc-01",
      contractNumber: "RC-STEEL-2627",
      supplierId: "sup-tata",
      supplierName: "Tata Steel Limited",
      materialCode: "MAT-STEEL-16",
      agreedUnitRate: 54000,
      ceilingQuantity: 1000,
      orderedQuantity: 300,
      remainingQuantity: 700,
      validFrom: "2026-04-01",
      validTo: "2027-03-31",
      liquidatedDamagesPercentPerWeek: 0.5,
      status: "ACTIVE",
    };

    const validOrder = AdvancedProcurementService.validateRateContractOrder(
      rc,
      200,
      new Date("2026-06-15"),
    );
    expect(validOrder.isValid).toBe(true);
    expect(validOrder.effectiveRate).toBe(54000);
    expect(validOrder.newRemainingQuantity).toBe(500);

    const exceedOrder = AdvancedProcurementService.validateRateContractOrder(
      rc,
      800,
      new Date("2026-06-15"),
    );
    expect(exceedOrder.isValid).toBe(false);
    expect(exceedOrder.reason).toContain("exceeds remaining contract ceiling");
  });

  it("generates phased delivery schedule lots for bulk orders", () => {
    const schedule = AdvancedProcurementService.generatePhasedSchedule(
      1000,
      4,
      30,
      "site-01",
      new Date("2026-05-01"),
    );
    expect(schedule).toHaveLength(4);
    expect(schedule[0].scheduledQuantity).toBe(250);
    expect(schedule[3].scheduledQuantity).toBe(250);
  });
});

describe("Phase 13D: Advanced Project Cost Management", () => {
  it("calculates comprehensive Earned Value Management (EVM) metrics accurately", () => {
    // BAC = 500L, PV = 300L, EV = 320L, AC = 310L
    const evm = AdvancedProjectCostService.computeEVM({
      projectId: "p-evm-01",
      projectName: "KDIPL Hub",
      budgetAtCompletion: 50000000,
      plannedValue: 30000000,
      earnedValue: 32000000,
      actualCost: 31000000,
    });

    expect(evm.costVariance).toBe(1000000); // 320L - 310L = +10L favorable
    expect(evm.scheduleVariance).toBe(2000000); // 320L - 300L = +20L ahead
    expect(evm.costPerformanceIndex).toBe(1.032);
    expect(evm.schedulePerformanceIndex).toBe(1.067);
    expect(evm.healthStatus).toBe("ON_TRACK");
  });

  it("computes project gross and net profit margins", () => {
    const profit = AdvancedProjectCostService.computeProjectProfitability({
      projectId: "p-01",
      contractValue: 10000000,
      totalRevenueBilled: 8000000,
      materialCost: 3500000,
      labourCost: 1500000,
      equipmentCost: 500000,
      subcontractorCost: 500000,
      allocatedOverheads: 400000,
    });

    // Direct Cost = 35 + 15 + 5 + 5 = 60L
    // Gross Profit = 80L - 60L = 20L (25%)
    // Net Profit = 20L - 4L = 16L (20%)
    expect(profit.totalDirectCost).toBe(6000000);
    expect(profit.grossProfit).toBe(2000000);
    expect(profit.grossProfitMarginPercent).toBe(25.0);
    expect(profit.netProfit).toBe(1600000);
    expect(profit.netProfitMarginPercent).toBe(20.0);
  });
});

describe("Phase 13E: Workforce & HR Management", () => {
  it("processes leave balance deduction and checks availability", () => {
    const initialBalance: LeaveBalance = {
      employeeId: "emp-01",
      casualLeaveRemaining: 5,
      sickLeaveRemaining: 8,
      privilegeLeaveRemaining: 15,
      totalAvailable: 28,
    };

    const result = WorkforceManagementService.applyLeaveDeduction(initialBalance, "CASUAL", 2);
    expect(result.approved).toBe(true);
    expect(result.updatedBalance.casualLeaveRemaining).toBe(3);
    expect(result.updatedBalance.totalAvailable).toBe(26);

    const exceed = WorkforceManagementService.applyLeaveDeduction(result.updatedBalance, "CASUAL", 4);
    expect(exceed.approved).toBe(false);
    expect(exceed.rejectionReason).toContain("Insufficient casual leave");
  });

  it("computes statutory payroll with PF, ESI, and site allowance deductions", () => {
    const payroll = WorkforceManagementService.computeMonthlyPayroll({
      employeeId: "emp-01",
      employeeName: "Ramesh Sharma",
      monthYear: "04-2026",
      totalWorkingDays: 26,
      daysPresent: 26,
      daysAbsent: 0,
      overtimeHours: 10,
      monthlyBaseSalary: 30000,
      siteAllowanceDaily: 200,
      hourlyOvertimeRate: 200,
      tdsMonthly: 1000,
    });

    // Base = 30000, HRA = 12000, SiteAllowance = 5200, OT = 2000 -> Gross = 49200
    // PF = 12% of 15000 = 1800, ESI = 0 (>21000 gross), TDS = 1000 -> Total Deductions = 2800
    // Net = 49200 - 2800 = 46400
    expect(payroll.grossPay).toBe(49200);
    expect(payroll.providentFundDeduction).toBe(1800);
    expect(payroll.esiDeduction).toBe(0);
    expect(payroll.netPayableSalary).toBe(46400);
  });

  it("verifies mandatory documents for site deployment", () => {
    const docs: EmployeeDocumentRecord[] = [
      {
        id: "d-01",
        employeeId: "emp-01",
        documentType: "AADHAAR",
        documentNumber: "1234-5678-9012",
        issueDate: "2020-01-01",
        verificationStatus: "VERIFIED",
      },
    ];

    const check1 = WorkforceManagementService.verifySiteDeploymentReadiness(docs);
    expect(check1.isEligibleForDeployment).toBe(false);
    expect(check1.missingMandatoryDocuments).toContain("SAFETY_INDUCTION");

    docs.push({
      id: "d-02",
      employeeId: "emp-01",
      documentType: "SAFETY_INDUCTION",
      documentNumber: "SI-2026-44",
      issueDate: "2026-04-01",
      verificationStatus: "VERIFIED",
    });

    const check2 = WorkforceManagementService.verifySiteDeploymentReadiness(docs);
    expect(check2.isEligibleForDeployment).toBe(true);
    expect(check2.missingMandatoryDocuments).toHaveLength(0);
  });
});

describe("Phase 13F: Contractor & Vendor Management", () => {
  it("processes Running Account (RA) Bill with Retention (5%), TDS (194C), and Advance Deductions", () => {
    const contractor: ContractorProfile = {
      contractorId: "con-01",
      contractorCode: "CON-CIVIL-04",
      agencyName: "Apex Infra Projects LLP",
      entityType: "COMPANY", // TDS 2%
      pan: "AABCA1234D",
      gstin: "07AABCA1234D1Z2",
      safetyRatingPercent: 92,
      isActive: true,
      labourLicenseExpiryDate: "2027-12-31", // valid
    };

    const workOrder: WorkOrder = {
      workOrderId: "wo-01",
      workOrderNumber: "WO-2627-0012",
      contractorId: "con-01",
      projectId: "p-01",
      siteId: "s-01",
      title: "RCC Box Culvert Construction",
      scopeOfWork: "Reinforced cement concrete box culvert km 42 to 46",
      sanctionedValue: 5000000,
      retentionPercent: 5,
      mobilizationAdvanceGiven: 500000,
      mobilizationAdvanceRecovered: 100000,
      status: "IN_PROGRESS",
    };

    const bill = ContractorVendorManagementService.processRunningAccountBill({
      workOrder,
      contractor,
      billNumber: "RA-02",
      grossMeasurementAmount: 1000000, // 10 Lakhs
      cumulativeBilledPrior: 1000000,
      advanceRecoveryRatePercent: 10,
    });

    // Retention: 5% of 10L = 50,000
    // TDS: 2% of 10L = 20,000
    // Advance Recovery: 10% of 10L = 100,000 (Remaining was 400,000)
    // Compliance Hold: 0 (License valid)
    // Net Payable: 10L - (50K + 20K + 100K) = 830,000
    expect(bill.retentionDeductionAmount).toBe(50000);
    expect(bill.tdsDeductionAmount).toBe(20000);
    expect(bill.advanceRecoveryAmount).toBe(100000);
    expect(bill.netPayableAmount).toBe(830000);
    expect(bill.remainingAdvanceBalance).toBe(300000);
    expect(bill.complianceStatus).toBe("CLEARED");
  });

  it("calculates contractor composite performance score", () => {
    const perf = ContractorVendorManagementService.evaluateContractorPerformance({
      contractorId: "con-01",
      qualityScore: 90,
      scheduleComplianceScore: 85,
      safetyComplianceScore: 95,
    });
    // 90*0.4 + 85*0.4 + 95*0.2 = 36 + 34 + 19 = 89
    expect(perf.compositeRating).toBe(89);
    expect(perf.tierRank).toBe("TIER_1_PREFERRED");
  });
});

describe("Phase 13G: Asset & Equipment Management", () => {
  it("calculates Straight-Line Method (SLM) depreciation accurately", () => {
    const asset: AssetRegisterEntry = {
      assetId: "ast-01",
      assetCode: "EQ-EXC-01",
      tagRfidOrBarcode: "TAG-992144",
      name: "CAT 320D Hydraulic Excavator",
      category: "HEAVY_EARTHMOVING",
      model: "320D",
      serialNumber: "SN-CAT-88912",
      purchaseDate: "2024-04-01",
      capitalCostINR: 6500000,
      salvageValueINR: 500000,
      usefulLifeYears: 6,
      assignedCompanyId: "ent-kdipl-01",
      condition: "OPERATIONAL",
      totalOperatingHours: 4200,
    };

    // Depreciable base = 60 Lakhs / 6 years = 10 Lakhs/yr
    // As of 2026-04-01 (exactly 2 years later): 20 Lakhs depr, Book value = 45 Lakhs
    const schedule = AssetEquipmentManagementService.computeStraightLineDepreciation(
      asset,
      new Date("2026-04-01"),
    );

    expect(schedule.annualDepreciationAmount).toBe(1000000);
    expect(schedule.accumulatedDepreciation).toBe(2000000);
    expect(schedule.currentBookValue).toBe(4500000);
    expect(schedule.isFullyDepreciated).toBe(false);
  });

  it("evaluates equipment utilization and availability rates", () => {
    const util = AssetEquipmentManagementService.calculateUtilization({
      assetId: "ast-01",
      reportingPeriod: "2026-W16",
      totalAvailableHours: 168, // 7 days * 24h
      operatingHours: 120,
      idleHours: 40,
      breakdownHours: 8,
    });

    expect(util.utilizationRatePercent).toBe(71.43); // 120 / 168
    expect(util.availabilityRatePercent).toBe(95.24); // (168 - 8) / 168
  });
});

describe("Phase 13H: Maintenance Management", () => {
  it("computes MTBF, MTTR, and inherent equipment availability", () => {
    // 1200 operating hours, 4 breakdowns, 48 total downtime hours
    // MTBF = 1200 / 4 = 300 hrs
    // MTTR = 48 / 4 = 12 hrs
    // Availability = 300 / (300 + 12) = 96.15%
    const rel = MaintenanceManagementService.calculateReliabilityMetrics({
      assetId: "ast-01",
      totalOperatingHours: 1200,
      breakdownCount: 4,
      totalDowntimeHours: 48,
    });

    expect(rel.mtbfHours).toBe(300);
    expect(rel.mttrHours).toBe(12);
    expect(rel.inherentAvailabilityPercent).toBe(96.15);
    expect(rel.status).toBe("OPTIMAL");
  });

  it("finalizes maintenance ticket and tallies spare parts and labour cost", () => {
    const ticket: MaintenanceTicket = {
      ticketId: "tkt-01",
      ticketNumber: "MT-2627-004",
      assetId: "ast-01",
      assetCode: "EQ-EXC-01",
      type: "BREAKDOWN",
      severity: "CRITICAL",
      description: "Hydraulic pump seal burst",
      reportedDate: "2026-04-10",
      downtimeHours: 0,
      status: "IN_PROGRESS",
      sparesConsumedCostINR: 0,
      labourCostINR: 0,
      totalMaintenanceCostINR: 0,
    };

    const closed = MaintenanceManagementService.finalizeMaintenanceTicket(ticket, 45000, 12000, 14);
    expect(closed.status).toBe("CLOSED");
    expect(closed.sparesConsumedCostINR).toBe(45000);
    expect(closed.labourCostINR).toBe(12000);
    expect(closed.totalMaintenanceCostINR).toBe(57000);
    expect(closed.downtimeHours).toBe(14);
  });
});

describe("Phase 13I: CRM & Business Development Expansion", () => {
  it("evaluates active tender pipeline and computes probability-weighted value", () => {
    const opps: BusinessDevelopmentOpportunity[] = [
      {
        opportunityId: "opp-01",
        opportunityCode: "DEL-AIR-01",
        title: "Airport Runway Extension Subgrade",
        clientName: "DIAL",
        clientType: "PRIVATE_DEVELOPER",
        estimatedValueINR: 100000000, // 10 Cr
        stage: "BID_SUBMISSION", // 60% prob = 6 Cr
        submissionDeadline: "2026-10-31",
        bidMarginTargetPercent: 18,
        assignedDirectorId: "dir-01",
        isConvertedToProject: false,
      },
      {
        opportunityId: "opp-02",
        opportunityCode: "HR-HWY-04",
        title: "Haryana State Highway Bypass",
        clientName: "HSVP / PWD",
        clientType: "GOVERNMENT_PSU",
        estimatedValueINR: 50000000, // 5 Cr
        stage: "TECHNICAL_FINANCIAL_OPENING", // 80% prob = 4 Cr
        submissionDeadline: "2026-09-30",
        bidMarginTargetPercent: 20,
        assignedDirectorId: "dir-02",
        isConvertedToProject: false,
      },
    ];

    const result = CustomerBusinessDevelopmentService.evaluatePipeline(opps);
    expect(result.totalUnweightedPipelineValueINR).toBe(150000000);
    expect(result.weightedPipelineValueINR).toBe(100000000); // 6 Cr + 4 Cr
  });

  it("converts won opportunity into operational project blueprint with initial budget", () => {
    const wonOpp: BusinessDevelopmentOpportunity[] = [
      {
        opportunityId: "opp-won",
        opportunityCode: "DEL-BYPASS",
        title: "Delhi Bypass Flyover Package",
        clientName: "DDA",
        clientType: "GOVERNMENT_PSU",
        estimatedValueINR: 80000000, // 8 Cr
        stage: "AWARDED_WON",
        submissionDeadline: "2026-08-01",
        bidMarginTargetPercent: 20, // 20% margin -> 80% budget = 6.4 Cr
        assignedDirectorId: "dir-01",
        isConvertedToProject: false,
      },
    ];

    const blueprint = CustomerBusinessDevelopmentService.convertOpportunityToProject(wonOpp[0]);
    expect(blueprint.projectName).toBe("Delhi Bypass Flyover Package");
    expect(blueprint.sanctionedContractValue).toBe(80000000);
    expect(blueprint.initialProcurementBudget).toBe(64000000);
    expect(blueprint.projectCode).toContain("PRJ-");
  });
});

describe("Phase 13J: Advanced Financial Architecture", () => {
  it("validates balanced double-entry journal vouchers", () => {
    const balancedVoucher: JournalVoucher = {
      voucherNumber: "JV-2627-0001",
      voucherDate: "2026-04-15",
      voucherType: "GENERAL",
      companyCode: "KDIPL",
      narration: "Provision of subcontractor liability",
      isPosted: false,
      lines: [
        {
          accountCode: "5010",
          accountName: "Subcontractor Direct Expense",
          debitINR: 250000,
          creditINR: 0,
        },
        {
          accountCode: "2020",
          accountName: "Subcontractor Payable Liability",
          debitINR: 0,
          creditINR: 250000,
        },
      ],
    };

    const res = AdvancedFinancialArchitectureService.validateDoubleEntryJournal(balancedVoucher);
    expect(res.isValid).toBe(true);
    expect(res.totalDebit).toBe(250000);
    expect(res.totalCredit).toBe(250000);

    const unbalancedVoucher: JournalVoucher = {
      ...balancedVoucher,
      lines: [
        { accountCode: "5010", accountName: "Exp", debitINR: 250000, creditINR: 0 },
        { accountCode: "2020", accountName: "Liab", debitINR: 0, creditINR: 200000 },
      ],
    };

    const unbalRes = AdvancedFinancialArchitectureService.validateDoubleEntryJournal(unbalancedVoucher);
    expect(unbalRes.isValid).toBe(false);
    expect(unbalRes.imbalanceAmount).toBe(50000);
  });

  it("enforces financial period locking rules", () => {
    const periods: FinancialPeriod[] = [
      {
        periodCode: "2025-M12",
        startDate: "2025-12-01",
        endDate: "2025-12-31",
        status: "HARD_LOCKED",
      },
      {
        periodCode: "2026-M04",
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        status: "OPEN",
      },
    ];

    const openCheck = AdvancedFinancialArchitectureService.checkPeriodLock("2026-04-15", periods);
    expect(openCheck.allowed).toBe(true);
    expect(openCheck.periodStatus).toBe("OPEN");

    const lockedCheck = AdvancedFinancialArchitectureService.checkPeriodLock("2025-12-15", periods);
    expect(lockedCheck.allowed).toBe(false);
    expect(lockedCheck.periodStatus).toBe("HARD_LOCKED");
  });
});

describe("Phase 13K: Enterprise Governance", () => {
  it("enforces Segregation of Duties (SoD) against conflicting role actions", () => {
    // Creator cannot approve PO
    const sodPo = EnterpriseGovernanceService.checkSegregationOfDuties({
      actorUserId: "u-creator",
      action: "APPROVE_PO",
      targetDocumentId: "po-01",
      creatorUserId: "u-creator",
    });
    expect(sodPo.isAllowed).toBe(false);
    expect(sodPo.violation?.violationType).toBe("CREATOR_AS_APPROVER");

    // Receiver cannot disburse payment
    const sodPay = EnterpriseGovernanceService.checkSegregationOfDuties({
      actorUserId: "u-store-receiver",
      action: "RELEASE_PAYMENT",
      targetDocumentId: "pay-01",
      inspectorUserId: "u-store-receiver",
    });
    expect(sodPay.isAllowed).toBe(false);
    expect(sodPay.violation?.violationType).toBe("RECEIVER_AS_APPROVER");
  });

  it("evaluates Delegation of Authority (DoA) with proxy ceiling limits", () => {
    const delegations: DelegationOfAuthorityRecord[] = [
      {
        delegationId: "doa-01",
        delegatorUserId: "u-director",
        delegatorRole: "PROJECT_DIRECTOR",
        proxyUserId: "u-senior-pm",
        startsAt: "2026-04-01",
        endsAt: "2026-04-30",
        maxApprovalLimitINR: 1000000, // 10 Lakhs
        isActive: true,
      },
    ];

    const okDoa = EnterpriseGovernanceService.evaluateDelegation(
      delegations,
      "u-senior-pm",
      500000,
      new Date("2026-04-15"),
    );
    expect(okDoa.isAuthorizedViaDelegation).toBe(true);

    const exceedDoa = EnterpriseGovernanceService.evaluateDelegation(
      delegations,
      "u-senior-pm",
      1500000,
      new Date("2026-04-15"),
    );
    expect(exceedDoa.isAuthorizedViaDelegation).toBe(false);
    expect(exceedDoa.reason).toContain("exceeds delegated proxy ceiling");
  });
});

describe("Phase 13L: Enterprise API & Integration Platform", () => {
  it("generates and verifies HMAC signatures for secure integration webhooks", () => {
    const payload = JSON.stringify({ event: "PAYMENT_RELEASED", amount: 500000 });
    const secret = "kdipl-enterprise-secret-key-32chars";

    const sig = EnterpriseIntegrationPlatformService.generateHmacSignature(payload, secret);
    expect(sig).toBeDefined();
    expect(EnterpriseIntegrationPlatformService.verifyHmacSignature(payload, secret, sig)).toBe(
      true,
    );
    expect(
      EnterpriseIntegrationPlatformService.verifyHmacSignature(
        payload,
        secret,
        "tampered-sig-value",
      ),
    ).toBe(false);
  });

  it("generates valid TallyPrime XML Journal Voucher structure", () => {
    const xml = EnterpriseIntegrationPlatformService.generateTallyJournalXml({
      voucherNumber: "JV-2026-01",
      dateYYYYMMDD: "20260415",
      narration: "Material consumption posting",
      debitLedger: "Raw Materials Consumed",
      creditLedger: "Main Store Inventory",
      amount: 150000,
    });

    expect(xml).toContain("<VOUCHER VCHTYPE=\"Journal\"");
    expect(xml).toContain("<DATE>20260415</DATE>");
    expect(xml).toContain("<LEDGERNAME>Raw Materials Consumed</LEDGERNAME>");
  });

  it("formats structured banking payment advice CSV with checksum total", () => {
    const advice = EnterpriseIntegrationPlatformService.generateBankingPaymentAdvice(
      "BATCH-2627-01",
      [
        {
          paymentId: "PAY-01",
          beneficiaryName: "UltraTech Cement",
          beneficiaryAccountNo: "91234567890",
          beneficiaryIfsc: "HDFC0001234",
          amountINR: 450000,
          remarks: "Invoice INV-01",
        },
        {
          paymentId: "PAY-02",
          beneficiaryName: "Tata Steel",
          beneficiaryAccountNo: "99887766554",
          beneficiaryIfsc: "SBIN0004567",
          amountINR: 550000,
          remarks: "Invoice INV-02",
        },
      ],
    );

    expect(advice.recordCount).toBe(2);
    expect(advice.totalBatchAmount).toBe(1000000);
    expect(advice.csvContent).toContain("PaymentRef,BeneficiaryName");
  });
});

describe("Phase 13M: Scalability & Architecture", () => {
  it("calculates exponential backoff and transfers exhausted jobs to DEAD_LETTER queue", () => {
    const job: BackgroundJob = {
      jobId: "job-01",
      queueName: "EXPORT_REPORTS",
      payload: { reportId: "rep-01" },
      priority: "NORMAL",
      maxRetries: 3,
      retryCount: 1,
      status: "PROCESSING",
      scheduledAt: new Date().toISOString(),
    };

    const retry1 = EnterpriseScalabilityService.evaluateJobRetry(job, "Database timeout");
    expect(retry1.nextStatus).toBe("QUEUED");
    expect(retry1.retryCount).toBe(2);
    expect(retry1.delaySeconds).toBe(60); // 2^(2-1) * 30 = 60s

    const exhaustedJob: BackgroundJob = { ...job, retryCount: 3 };
    const dlq = EnterpriseScalabilityService.evaluateJobRetry(exhaustedJob, "Fatal error");
    expect(dlq.nextStatus).toBe("DEAD_LETTER");
  });

  it("operates tag-based cache invalidation", () => {
    const cache = EnterpriseScalabilityService.createTagCache();
    cache.set("project-1", { name: "Project 1" }, 60, ["project", "region-north"]);
    cache.set("project-2", { name: "Project 2" }, 60, ["project", "region-south"]);

    expect(cache.get("project-1")).toEqual({ name: "Project 1" });
    expect(cache.invalidateTags("region-north")).toBe(1);
    expect(cache.get("project-1")).toBeNull();
    expect(cache.get("project-2")).toEqual({ name: "Project 2" });
  });

  it("chunks large transaction sets into safe batches", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const chunks = EnterpriseScalabilityService.chunkBatch(items, 100);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[2]).toHaveLength(50);
  });
});

describe("Phase 13N: Enterprise Security", () => {
  it("validates enterprise SAML assertion and maps claims to corporate roles", () => {
    const assertion: SamlUserAssertion = {
      issuer: "https://login.microsoftonline.com/kdipl-tenant/v2.0",
      nameId: "sonu.kumar@kdipl.com",
      email: "sonu.kumar@kdipl.com",
      displayName: "Sonu Kumar",
      groups: ["KDIPL_Exec_Board", "KDIPL_Project_Directors"],
      sessionIndex: "sess-9941",
      notOnOrAfter: new Date(Date.now() + 3600000).toISOString(), // 1 hr future
    };

    const res = EnterpriseSecurityService.validateSamlAssertion(
      assertion,
      "https://login.microsoftonline.com/kdipl-tenant/v2.0",
    );
    expect(res.isValid).toBe(true);
    expect(res.principalMapping?.inferredRoles).toContain("MANAGING_DIRECTOR");
    expect(res.principalMapping?.inferredRoles).toContain("PROJECT_DIRECTOR");
  });

  it("issues and validates Break-Glass emergency sessions with tamper-evident audit logging", () => {
    const session = EnterpriseSecurityService.issueBreakGlassSession({
      invokedByUserId: "u-devops-lead",
      authorizedByUserId: "u-md-approver",
      emergencyReason: "Database primary replica failover and index corruption recovery",
      durationHours: 2,
    });

    expect(session.sessionId).toContain("BG-");
    expect(session.isTamperEvident).toBe(true);
    expect(EnterpriseSecurityService.isBreakGlassActive(session)).toBe(true);
  });
});

describe("Phase 13O: Enterprise End-to-End QA Journey", () => {
  it("executes the entire multi-company enterprise chain end-to-end", () => {
    // 1. Multi-Company Context
    const company = MultiCompanyFoundationService.resolveCompanyContext({
      requestedCompanyCode: "KDIPL",
      userRoleCodes: ["MANAGING_DIRECTOR"],
    });
    expect(company.activeCompanyCode).toBe("KDIPL");

    // 2. Multi-Project Stock Transfer
    const transferDoc = MultiCompanyFoundationService.generateCompanyDocumentNumber({
      companyCode: company.activeCompanyCode,
      documentType: "PO",
      financialYear: "2627",
      sequence: 101,
    });
    expect(transferDoc).toBe("KDIPL-PO-2627-00101");

    // 3. Procurement Approval Matrix
    const authority = AdvancedProcurementService.resolveProcurementApprovalLevel(3500000);
    expect(authority.requiredAuthority).toBe("MANAGING_DIRECTOR");

    // 4. Project Cost EVM
    const evm = AdvancedProjectCostService.computeEVM({
      projectId: "PRJ-01",
      projectName: "KDIPL Highway",
      budgetAtCompletion: 100000000,
      plannedValue: 40000000,
      earnedValue: 42000000,
      actualCost: 41000000,
    });
    expect(evm.costPerformanceIndex).toBeGreaterThan(1.0);

    // 5. Workforce & Payroll
    const payroll = WorkforceManagementService.computeMonthlyPayroll({
      employeeId: "emp-01",
      employeeName: "Engineer 1",
      monthYear: "04-2026",
      totalWorkingDays: 26,
      daysPresent: 26,
      daysAbsent: 0,
      overtimeHours: 0,
      monthlyBaseSalary: 40000,
      siteAllowanceDaily: 300,
      hourlyOvertimeRate: 250,
      tdsMonthly: 2000,
    });
    expect(payroll.netPayableSalary).toBeGreaterThan(0);

    // 6. Contractor RA Bill
    const raBill = ContractorVendorManagementService.processRunningAccountBill({
      workOrder: {
        workOrderId: "wo-01",
        workOrderNumber: "WO-01",
        contractorId: "con-01",
        projectId: "p-01",
        siteId: "s-01",
        title: "Piling Work",
        scopeOfWork: "Piling",
        sanctionedValue: 10000000,
        retentionPercent: 5,
        mobilizationAdvanceGiven: 0,
        mobilizationAdvanceRecovered: 0,
        status: "IN_PROGRESS",
      },
      contractor: {
        contractorId: "con-01",
        contractorCode: "C-01",
        agencyName: "Piling Corp",
        entityType: "COMPANY",
        pan: "PAN1234",
        gstin: "07GSTIN1234",
        safetyRatingPercent: 90,
        isActive: true,
      },
      billNumber: "RA-01",
      grossMeasurementAmount: 2000000,
      cumulativeBilledPrior: 0,
    });
    expect(raBill.netPayableAmount).toBe(1860000); // 20L - (100K ret + 40K TDS)

    // 7. Asset Depreciation
    const depr = AssetEquipmentManagementService.computeStraightLineDepreciation({
      assetId: "ast-01",
      assetCode: "EQ-01",
      tagRfidOrBarcode: "TAG-1",
      name: "Crane",
      category: "LIFTING_EQUIPMENT",
      model: "Liebherr",
      serialNumber: "SN-1",
      purchaseDate: "2025-04-01",
      capitalCostINR: 10000000,
      salvageValueINR: 1000000,
      usefulLifeYears: 10,
      assignedCompanyId: company.activeCompanyId,
      condition: "OPERATIONAL",
      totalOperatingHours: 500,
    });
    expect(depr.annualDepreciationAmount).toBe(900000);

    // 8. Maintenance Metrics
    const rel = MaintenanceManagementService.calculateReliabilityMetrics({
      assetId: "ast-01",
      totalOperatingHours: 2000,
      breakdownCount: 5,
      totalDowntimeHours: 50,
    });
    expect(rel.inherentAvailabilityPercent).toBeGreaterThan(95);

    // 9. CRM Opportunity Conversion
    const blueprint = CustomerBusinessDevelopmentService.convertOpportunityToProject({
      opportunityId: "opp-01",
      opportunityCode: "EXPR-01",
      title: "Yamuna Expressway Package",
      clientName: "YEIDA",
      clientType: "GOVERNMENT_PSU",
      estimatedValueINR: 200000000,
      stage: "AWARDED_WON",
      submissionDeadline: "2026-05-01",
      bidMarginTargetPercent: 15,
      assignedDirectorId: "dir-01",
      isConvertedToProject: false,
    });
    expect(blueprint.initialProcurementBudget).toBe(170000000);

    // 10. Financial Period & Journal Posting
    const journalValidation = AdvancedFinancialArchitectureService.validateDoubleEntryJournal({
      voucherNumber: "JV-01",
      voucherDate: "2026-04-01",
      voucherType: "GENERAL",
      companyCode: "KDIPL",
      narration: "End of month posting",
      isPosted: false,
      lines: [
        { accountCode: "101", accountName: "Debit Exp", debitINR: 50000, creditINR: 0 },
        { accountCode: "201", accountName: "Credit Liab", debitINR: 0, creditINR: 50000 },
      ],
    });
    expect(journalValidation.isValid).toBe(true);

    // 11. Governance SoD
    const sod = EnterpriseGovernanceService.checkSegregationOfDuties({
      actorUserId: "u-auditor",
      action: "APPROVE_PO",
      targetDocumentId: "po-01",
      creatorUserId: "u-buyer",
    });
    expect(sod.isAllowed).toBe(true);

    // 12. Integration HMAC & Banking Advice
    const advice = EnterpriseIntegrationPlatformService.generateBankingPaymentAdvice(
      "BATCH-01",
      [
        {
          paymentId: "p-01",
          beneficiaryName: "Vendor A",
          beneficiaryAccountNo: "123",
          beneficiaryIfsc: "HDFC",
          amountINR: 50000,
          remarks: "Settlement",
        },
      ],
    );
    expect(advice.totalBatchAmount).toBe(50000);

    // 13. Scalability Cache
    const cache = EnterpriseScalabilityService.createTagCache();
    cache.set("k1", "v1", 60, ["tag1"]);
    expect(cache.get("k1")).toBe("v1");

    // 14. Enterprise Security Break-Glass
    const bg = EnterpriseSecurityService.issueBreakGlassSession({
      invokedByUserId: "admin-1",
      authorizedByUserId: "md-1",
      emergencyReason: "Production database emergency hotfix and reconciliation",
    });
    expect(bg.isTamperEvident).toBe(true);
  });
});
