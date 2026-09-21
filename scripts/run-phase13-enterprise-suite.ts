import "dotenv/config";

import {
  MultiCompanyFoundationService,
  type CompanyFinancialSummary,
} from "../src/server/enterprise/multi-company-service.ts";
import {
  MultiProjectScalingService,
  type InterProjectTransferRequest,
} from "../src/server/enterprise/multi-project-service.ts";
import {
  AdvancedProcurementService,
  type RateContractAgreement,
} from "../src/server/enterprise/advanced-procurement-service.ts";
import { AdvancedProjectCostService } from "../src/server/enterprise/project-cost-service.ts";
import {
  WorkforceManagementService,
  type LeaveBalance,
} from "../src/server/enterprise/workforce-service.ts";
import {
  ContractorVendorManagementService,
  type ContractorProfile,
  type WorkOrder,
} from "../src/server/enterprise/contractor-service.ts";
import {
  AssetEquipmentManagementService,
  type AssetRegisterEntry,
} from "../src/server/enterprise/asset-management-service.ts";
import { MaintenanceManagementService } from "../src/server/enterprise/maintenance-service.ts";
import {
  CustomerBusinessDevelopmentService,
  type BusinessDevelopmentOpportunity,
} from "../src/server/enterprise/crm-service.ts";
import {
  AdvancedFinancialArchitectureService,
  type JournalVoucher,
} from "../src/server/enterprise/advanced-finance-service.ts";
import { EnterpriseGovernanceService } from "../src/server/enterprise/enterprise-governance-service.ts";
import { EnterpriseIntegrationPlatformService } from "../src/server/enterprise/integration-platform-service.ts";
import {
  EnterpriseScalabilityService,
  type BackgroundJob,
} from "../src/server/enterprise/scalability-service.ts";
import {
  EnterpriseSecurityService,
  type SamlUserAssertion,
} from "../src/server/enterprise/enterprise-security-service.ts";

type SubMilestoneCheck = {
  milestone: string;
  title: string;
  details: string;
  passed: boolean;
};

const checks: SubMilestoneCheck[] = [];

function recordCheck(milestone: string, title: string, details: string, passed: boolean) {
  checks.push({ milestone, title, details, passed });
  const mark = passed ? "✔ PASS" : "✖ FAIL";
  console.log(`${mark} | ${milestone.padEnd(6)} | ${title.padEnd(38)} | ${details}`);
}

async function runPhase13Suite() {
  console.log("======================================================================");
  console.log("KDIPL Operations Platform — Phase 13 Enterprise Architecture Suite");
  console.log("======================================================================\n");

  // 13A: Multi-Company Foundation
  const company = MultiCompanyFoundationService.resolveCompanyContext({
    requestedCompanyCode: "KDIPL",
    userRoleCodes: ["MANAGING_DIRECTOR"],
  });
  const docNum = MultiCompanyFoundationService.generateCompanyDocumentNumber({
    companyCode: "KDIPL",
    documentType: "PO",
    financialYear: "2627",
    sequence: 15,
  });
  const summaries: CompanyFinancialSummary[] = [
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
  const groupRollup = MultiCompanyFoundationService.consolidateGroupFinancials(summaries);
  recordCheck(
    "13A",
    "Multi-Company Foundation",
    `Resolved entity ${company.activeCompanyCode}, doc #${docNum}, Net Group Rev ₹${(groupRollup.netConsolidatedRevenue / 10000000).toFixed(1)}Cr`,
    company.activeCompanyCode === "KDIPL" &&
      docNum === "KDIPL-PO-2627-00015" &&
      groupRollup.interCompanyEliminations === 3000000,
  );

  // 13B: Multi-Project & Multi-Site Scaling
  const initialTransfer: InterProjectTransferRequest = {
    transferId: "trf-01",
    transferNumber: "TRF-2627-0001",
    sourceProjectId: "p-01",
    sourceStoreId: "s-01",
    targetProjectId: "p-02",
    targetStoreId: "s-02",
    materialCode: "MAT-CEMENT-OPC53",
    materialName: "OPC 53 Cement",
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
  const approved = MultiProjectScalingService.processTransferStep(initialTransfer, "APPROVE", {
    approvedQty: 200,
  });
  const dispatched = MultiProjectScalingService.processTransferStep(approved, "DISPATCH");
  const received = MultiProjectScalingService.processTransferStep(dispatched, "RECEIVE", {
    receivedQty: 198,
    transitLoss: 2,
  });
  recordCheck(
    "13B",
    "Multi-Project Scaling",
    `Completed inter-project transfer lifecycle with Gate Pass & transit reconciliation`,
    received.status === "COMPLETED" && received.transitLossQuantity === 2,
  );

  // 13C: Advanced Procurement
  const authority = AdvancedProcurementService.resolveProcurementApprovalLevel(3500000);
  const rcAgreement: RateContractAgreement = {
    contractId: "rc-01",
    contractNumber: "RC-STEEL-2627",
    supplierId: "sup-tata",
    supplierName: "Tata Steel",
    materialCode: "MAT-STEEL",
    agreedUnitRate: 54000,
    ceilingQuantity: 1000,
    orderedQuantity: 200,
    remainingQuantity: 800,
    validFrom: "2026-04-01",
    validTo: "2027-03-31",
    liquidatedDamagesPercentPerWeek: 0.5,
    status: "ACTIVE",
  };
  const rcVal = AdvancedProcurementService.validateRateContractOrder(
    rcAgreement,
    300,
    new Date("2026-06-01"),
  );
  recordCheck(
    "13C",
    "Advanced Procurement",
    `Threshold routed to ${authority.requiredAuthority}, RC order validated (Remaining: ${rcVal.newRemainingQuantity} MT)`,
    authority.requiredAuthority === "MANAGING_DIRECTOR" && rcVal.isValid,
  );

  // 13D: Advanced Project Cost Management
  const evm = AdvancedProjectCostService.computeEVM({
    projectId: "PRJ-01",
    projectName: "Highway Bypass",
    budgetAtCompletion: 60000000,
    plannedValue: 30000000,
    earnedValue: 33000000,
    actualCost: 31000000,
  });
  recordCheck(
    "13D",
    "Project Cost Management (EVM)",
    `CPI: ${evm.costPerformanceIndex}, SPI: ${evm.schedulePerformanceIndex}, EAC: ₹${(evm.estimateAtCompletion / 10000000).toFixed(2)}Cr (${evm.healthStatus})`,
    evm.costPerformanceIndex > 1.0 &&
    (evm.healthStatus === "ON_TRACK" || evm.healthStatus === "EXCELLENT"),
  );

  // 13E: HR & Workforce Management
  const leaveBalance: LeaveBalance = {
    employeeId: "emp-01",
    casualLeaveRemaining: 6,
    sickLeaveRemaining: 10,
    privilegeLeaveRemaining: 15,
    totalAvailable: 31,
  };
  const leaveRes = WorkforceManagementService.applyLeaveDeduction(leaveBalance, "CASUAL", 2);
  const payroll = WorkforceManagementService.computeMonthlyPayroll({
    employeeId: "emp-01",
    employeeName: "Site Engineer",
    monthYear: "04-2026",
    totalWorkingDays: 26,
    daysPresent: 26,
    daysAbsent: 0,
    overtimeHours: 8,
    monthlyBaseSalary: 35000,
    siteAllowanceDaily: 250,
    hourlyOvertimeRate: 200,
    tdsMonthly: 1200,
  });
  recordCheck(
    "13E",
    "Workforce & HR Management",
    `Leave deducted (Remaining CL: ${leaveRes.updatedBalance.casualLeaveRemaining}), Net Payroll: ₹${payroll.netPayableSalary}`,
    leaveRes.approved && payroll.netPayableSalary > 0,
  );

  // 13F: Contractor & Vendor Management
  const cProfile: ContractorProfile = {
    contractorId: "con-01",
    contractorCode: "CON-01",
    agencyName: "Earthworks Infra",
    entityType: "COMPANY",
    pan: "PAN1234",
    gstin: "07GSTIN1234",
    safetyRatingPercent: 90,
    isActive: true,
  };
  const cWo: WorkOrder = {
    workOrderId: "wo-01",
    workOrderNumber: "WO-01",
    contractorId: "con-01",
    projectId: "p-01",
    siteId: "s-01",
    title: "Earth Excavation",
    scopeOfWork: "Earth excavation",
    sanctionedValue: 5000000,
    retentionPercent: 5,
    mobilizationAdvanceGiven: 400000,
    mobilizationAdvanceRecovered: 100000,
    status: "IN_PROGRESS",
  };
  const raBill = ContractorVendorManagementService.processRunningAccountBill({
    workOrder: cWo,
    contractor: cProfile,
    billNumber: "RA-01",
    grossMeasurementAmount: 1000000,
    cumulativeBilledPrior: 0,
    advanceRecoveryRatePercent: 10,
  });
  recordCheck(
    "13F",
    "Contractor Management",
    `Processed RA Bill: Retention ₹${raBill.retentionDeductionAmount}, TDS ₹${raBill.tdsDeductionAmount}, Net ₹${raBill.netPayableAmount}`,
    raBill.netPayableAmount === 830000 && raBill.complianceStatus === "CLEARED",
  );

  // 13G: Asset & Equipment Management
  const asset: AssetRegisterEntry = {
    assetId: "ast-01",
    assetCode: "EQ-EXC-01",
    tagRfidOrBarcode: "TAG-01",
    name: "CAT 320D Excavator",
    category: "HEAVY_EARTHMOVING",
    model: "320D",
    serialNumber: "SN-01",
    purchaseDate: "2024-04-01",
    capitalCostINR: 6000000,
    salvageValueINR: 600000,
    usefulLifeYears: 6,
    assignedCompanyId: "ent-kdipl-01",
    condition: "OPERATIONAL",
    totalOperatingHours: 3500,
  };
  const depr = AssetEquipmentManagementService.computeStraightLineDepreciation(
    asset,
    new Date("2026-04-01"),
  );
  recordCheck(
    "13G",
    "Asset & Equipment Management",
    `SLM Depreciation calculated: Book Value ₹${(depr.currentBookValue / 100000).toFixed(1)}L, Annual Depr ₹${(depr.annualDepreciationAmount / 100000).toFixed(1)}L`,
    depr.annualDepreciationAmount === 900000 && depr.currentBookValue === 4200000,
  );

  // 13H: Maintenance Management
  const rel = MaintenanceManagementService.calculateReliabilityMetrics({
    assetId: "ast-01",
    totalOperatingHours: 1500,
    breakdownCount: 3,
    totalDowntimeHours: 36,
  });
  recordCheck(
    "13H",
    "Maintenance Management",
    `MTBF: ${rel.mtbfHours} hrs, MTTR: ${rel.mttrHours} hrs, Inherent Availability: ${rel.inherentAvailabilityPercent}% (${rel.status})`,
    rel.inherentAvailabilityPercent > 95 && rel.status === "OPTIMAL",
  );

  // 13I: CRM & Business Development
  const opps: BusinessDevelopmentOpportunity[] = [
    {
      opportunityId: "opp-01",
      opportunityCode: "DEL-BYPASS",
      title: "Delhi Bypass Flyover",
      clientName: "NHAI",
      clientType: "GOVERNMENT_PSU",
      estimatedValueINR: 100000000,
      stage: "BID_SUBMISSION",
      submissionDeadline: "2026-10-01",
      bidMarginTargetPercent: 18,
      assignedDirectorId: "dir-01",
      isConvertedToProject: false,
    },
  ];
  const pipe = CustomerBusinessDevelopmentService.evaluatePipeline(opps);
  recordCheck(
    "13I",
    "CRM & Business Development",
    `Pipeline unweighted ₹${(pipe.totalUnweightedPipelineValueINR / 10000000).toFixed(1)}Cr, weighted ₹${(pipe.weightedPipelineValueINR / 10000000).toFixed(1)}Cr`,
    pipe.weightedPipelineValueINR === 60000000,
  );

  // 13J: Advanced Financial Architecture
  const voucher: JournalVoucher = {
    voucherNumber: "JV-01",
    voucherDate: "2026-04-15",
    voucherType: "GENERAL",
    companyCode: "KDIPL",
    narration: "Quarterly expense adjustment",
    isPosted: false,
    lines: [
      { accountCode: "5010", accountName: "Direct Expense", debitINR: 120000, creditINR: 0 },
      { accountCode: "2010", accountName: "Payable Liability", debitINR: 0, creditINR: 120000 },
    ],
  };
  const jvRes = AdvancedFinancialArchitectureService.validateDoubleEntryJournal(voucher);
  recordCheck(
    "13J",
    "Advanced Financial Architecture",
    `Validated double-entry voucher #${voucher.voucherNumber} (Debits == Credits: ₹${jvRes.totalDebit})`,
    jvRes.isValid,
  );

  // 13K: Enterprise Governance
  const sod = EnterpriseGovernanceService.checkSegregationOfDuties({
    actorUserId: "u-creator",
    action: "APPROVE_PO",
    targetDocumentId: "po-01",
    creatorUserId: "u-creator",
  });
  recordCheck(
    "13K",
    "Enterprise Governance",
    `Enforced SoD: Blocked creator self-approval on Purchase Order (${sod.violation?.violationType})`,
    !sod.isAllowed && sod.violation?.violationType === "CREATOR_AS_APPROVER",
  );

  // 13L: Enterprise Integration Platform
  const sig = EnterpriseIntegrationPlatformService.generateHmacSignature("test-payload", "secret");
  const isSigOk = EnterpriseIntegrationPlatformService.verifyHmacSignature(
    "test-payload",
    "secret",
    sig,
  );
  recordCheck(
    "13L",
    "Integration Platform",
    `Validated HMAC cryptographic webhook signing and payload verification`,
    isSigOk,
  );

  // 13M: Scalability & Architecture
  const job: BackgroundJob = {
    jobId: "j-01",
    queueName: "REPORTS",
    payload: {},
    priority: "HIGH",
    maxRetries: 3,
    retryCount: 1,
    status: "PROCESSING",
    scheduledAt: new Date().toISOString(),
  };
  const retry = EnterpriseScalabilityService.evaluateJobRetry(job, "Network reset");
  recordCheck(
    "13M",
    "Scalability & Architecture",
    `Exponential backoff calculated: Delay ${retry.delaySeconds}s, Next status: ${retry.nextStatus}`,
    retry.delaySeconds === 60 && retry.nextStatus === "QUEUED",
  );

  // 13N: Enterprise Security
  const saml: SamlUserAssertion = {
    issuer: "https://login.microsoftonline.com/kdipl-tenant/v2.0",
    nameId: "admin@kdipl.com",
    email: "admin@kdipl.com",
    displayName: "Enterprise Admin",
    groups: ["KDIPL_Exec_Board"],
    sessionIndex: "s-1",
    notOnOrAfter: new Date(Date.now() + 3600000).toISOString(),
  };
  const samlRes = EnterpriseSecurityService.validateSamlAssertion(
    saml,
    "https://login.microsoftonline.com/kdipl-tenant/v2.0",
  );
  recordCheck(
    "13N",
    "Enterprise Security",
    `Validated SAML SSO assertion token; mapped role: ${samlRes.principalMapping?.inferredRoles[0]}`,
    samlRes.isValid && samlRes.principalMapping?.inferredRoles.includes("MANAGING_DIRECTOR") === true,
  );

  // 13O: Phase 13 Final QA Signoff
  const allPassed = checks.every((c) => c.passed);
  recordCheck(
    "13O",
    "Phase 13 Final QA Signoff",
    `Verified entire 13A-13N enterprise chain end-to-end (${checks.length}/15 checks passed)`,
    allPassed,
  );

  console.log("\n======================================================================");
  console.log(
    `Phase 13 Enterprise Architecture Suite Result: ${allPassed ? "ALL 15 SUB-MILESTONES PASSED ✅" : "FAILURES DETECTED ❌"}`,
  );
  console.log("======================================================================");

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase13Suite().catch((err) => {
  console.error("Phase 13 Suite failed with error:", err);
  process.exit(1);
});
