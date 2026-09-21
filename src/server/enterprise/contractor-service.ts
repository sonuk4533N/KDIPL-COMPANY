export type ContractorEntityType = "INDIVIDUAL_PROPRIETOR" | "PARTNERSHIP_LLP" | "COMPANY";

export type ContractorProfile = {
  contractorId: string;
  contractorCode: string;
  agencyName: string;
  entityType: ContractorEntityType;
  pan: string;
  gstin: string;
  pfRegistrationCode?: string;
  esicRegistrationCode?: string;
  labourLicenseNumber?: string;
  labourLicenseExpiryDate?: string;
  safetyRatingPercent: number; // 0-100
  isActive: boolean;
};

export type WorkOrder = {
  workOrderId: string;
  workOrderNumber: string;
  contractorId: string;
  projectId: string;
  siteId: string;
  title: string;
  scopeOfWork: string;
  sanctionedValue: number;
  retentionPercent: number; // typically 5%
  mobilizationAdvanceGiven: number;
  mobilizationAdvanceRecovered: number;
  status: "DRAFT" | "ISSUED" | "IN_PROGRESS" | "COMPLETED" | "CLOSED";
};

export type RunningAccountBillResult = {
  billNumber: string;
  workOrderId: string;
  contractorId: string;
  grossMeasurementAmount: number;
  retentionDeductionAmount: number;
  advanceRecoveryAmount: number;
  tdsDeductionAmount: number;
  complianceHoldAmount: number;
  netPayableAmount: number;
  cumulativeBilledAmount: number;
  remainingAdvanceBalance: number;
  complianceStatus: "CLEARED" | "ON_HOLD";
  remarks: string;
};

export type ContractorPerformanceMetrics = {
  contractorId: string;
  qualityScore: number; // 0-100
  scheduleComplianceScore: number; // 0-100
  safetyComplianceScore: number; // 0-100
  compositeRating: number; // 0-100
  tierRank: "TIER_1_PREFERRED" | "TIER_2_APPROVED" | "TIER_3_PROBATION" | "BLOCKED";
};

export class ContractorVendorManagementService {
  /**
   * Evaluates Running Account (RA) Bill deductions:
   * - Retention: typically 5% of gross
   * - TDS (194C): 1% for Proprietor, 2% for Company
   * - Advance recovery: up to 10-20% of gross until advance is zero
   * - Compliance hold: holds 10% if labour license has expired
   */
  static processRunningAccountBill(input: {
    workOrder: WorkOrder;
    contractor: ContractorProfile;
    billNumber: string;
    grossMeasurementAmount: number;
    cumulativeBilledPrior: number;
    advanceRecoveryRatePercent?: number;
    currentDate?: Date;
  }): RunningAccountBillResult {
    const now = input.currentDate ?? new Date();

    // 1. Retention deduction
    const retentionRate = (input.workOrder.retentionPercent || 5) / 100;
    const retentionDeductionAmount = Number(
      (input.grossMeasurementAmount * retentionRate).toFixed(2),
    );

    // 2. TDS deduction under Indian Income Tax Act Sec 194C
    // 1% for Individual / Proprietor, 2% for Corporate / LLP
    const tdsRate = input.contractor.entityType === "INDIVIDUAL_PROPRIETOR" ? 0.01 : 0.02;
    const tdsDeductionAmount = Number((input.grossMeasurementAmount * tdsRate).toFixed(2));

    // 3. Mobilization advance recovery
    const remainingAdvance = Math.max(
      0,
      input.workOrder.mobilizationAdvanceGiven - input.workOrder.mobilizationAdvanceRecovered,
    );
    const targetRecoveryPercent = (input.advanceRecoveryRatePercent ?? 10) / 100;
    const desiredRecovery = input.grossMeasurementAmount * targetRecoveryPercent;
    const advanceRecoveryAmount = Number(Math.min(remainingAdvance, desiredRecovery).toFixed(2));
    const newRemainingAdvance = Number((remainingAdvance - advanceRecoveryAmount).toFixed(2));

    // 4. Compliance check (Labour License validity)
    let complianceHoldAmount = 0;
    let complianceStatus: "CLEARED" | "ON_HOLD" = "CLEARED";
    let remarks = "Bill verified and deductions applied according to contract.";

    if (input.contractor.labourLicenseExpiryDate) {
      const expiry = new Date(input.contractor.labourLicenseExpiryDate).getTime();
      if (now.getTime() > expiry) {
        complianceStatus = "ON_HOLD";
        complianceHoldAmount = Number((input.grossMeasurementAmount * 0.1).toFixed(2));
        remarks = "Labour license expired; 10% statutory retention held until renewal certificate provided.";
      }
    }

    // 5. Net Payable
    const totalDeductions =
      retentionDeductionAmount + tdsDeductionAmount + advanceRecoveryAmount + complianceHoldAmount;
    const netPayableAmount = Number(
      Math.max(0, input.grossMeasurementAmount - totalDeductions).toFixed(2),
    );
    const cumulativeBilledAmount = Number(
      (input.cumulativeBilledPrior + input.grossMeasurementAmount).toFixed(2),
    );

    return {
      billNumber: input.billNumber,
      workOrderId: input.workOrder.workOrderId,
      contractorId: input.contractor.contractorId,
      grossMeasurementAmount: input.grossMeasurementAmount,
      retentionDeductionAmount,
      advanceRecoveryAmount,
      tdsDeductionAmount,
      complianceHoldAmount,
      netPayableAmount,
      cumulativeBilledAmount,
      remainingAdvanceBalance: newRemainingAdvance,
      complianceStatus,
      remarks,
    };
  }

  /**
   * Generates Contractor Performance Scorecard from field metrics.
   */
  static evaluateContractorPerformance(input: {
    contractorId: string;
    qualityScore: number;
    scheduleComplianceScore: number;
    safetyComplianceScore: number;
  }): ContractorPerformanceMetrics {
    // Weighted formula: Quality 40%, Schedule 40%, Safety 20%
    const composite = Number(
      (
        input.qualityScore * 0.4 +
        input.scheduleComplianceScore * 0.4 +
        input.safetyComplianceScore * 0.2
      ).toFixed(1),
    );

    let tierRank: "TIER_1_PREFERRED" | "TIER_2_APPROVED" | "TIER_3_PROBATION" | "BLOCKED" =
      "TIER_2_APPROVED";
    if (composite >= 85) {
      tierRank = "TIER_1_PREFERRED";
    } else if (composite >= 70) {
      tierRank = "TIER_2_APPROVED";
    } else if (composite >= 50) {
      tierRank = "TIER_3_PROBATION";
    } else {
      tierRank = "BLOCKED";
    }

    return {
      contractorId: input.contractorId,
      qualityScore: input.qualityScore,
      scheduleComplianceScore: input.scheduleComplianceScore,
      safetyComplianceScore: input.safetyComplianceScore,
      compositeRating: composite,
      tierRank,
    };
  }
}
