export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "ON_LEAVE" | "OVERTIME";

export type DailyAttendanceRecord = {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  siteId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  regularHours: number;
  overtimeHours: number;
  recordedById: string;
};

export type LeaveType = "CASUAL" | "SICK" | "PRIVILEGE" | "MATERNITY" | "COMPENSATORY";

export type LeaveBalance = {
  employeeId: string;
  casualLeaveRemaining: number;
  sickLeaveRemaining: number;
  privilegeLeaveRemaining: number;
  totalAvailable: number;
};

export type EmployeeDocumentRecord = {
  id: string;
  employeeId: string;
  documentType: "AADHAAR" | "PAN" | "SAFETY_INDUCTION" | "MEDICAL_FITNESS" | "TRADE_CERTIFICATE";
  documentNumber: string;
  issueDate: string;
  expiryDate?: string;
  verificationStatus: "VERIFIED" | "PENDING" | "REJECTED";
};

export type PayrollCalculationResult = {
  employeeId: string;
  employeeName: string;
  monthYear: string; // e.g. "04-2026"
  daysPresent: number;
  daysAbsent: number;
  overtimeHours: number;
  baseSalary: number;
  earnedBase: number;
  hra: number;
  siteAllowance: number;
  overtimePay: number;
  grossPay: number;
  providentFundDeduction: number; // 12% on basic capped
  esiDeduction: number; // 0.75% if eligible
  taxDeduction: number; // TDS
  totalDeductions: number;
  netPayableSalary: number;
};

export class WorkforceManagementService {
  /**
   * Evaluates and updates leave balances upon leave application approval.
   */
  static applyLeaveDeduction(
    currentBalance: LeaveBalance,
    leaveType: LeaveType,
    daysRequested: number,
  ): {
    approved: boolean;
    updatedBalance: LeaveBalance;
    rejectionReason?: string;
  } {
    if (daysRequested <= 0) {
      return {
        approved: false,
        updatedBalance: currentBalance,
        rejectionReason: "Requested leave duration must be at least 1 day",
      };
    }

    const updated = { ...currentBalance };

    if (leaveType === "CASUAL") {
      if (currentBalance.casualLeaveRemaining < daysRequested) {
        return {
          approved: false,
          updatedBalance: currentBalance,
          rejectionReason: `Insufficient casual leave balance (${currentBalance.casualLeaveRemaining} days remaining)`,
        };
      }
      updated.casualLeaveRemaining -= daysRequested;
    } else if (leaveType === "SICK") {
      if (currentBalance.sickLeaveRemaining < daysRequested) {
        return {
          approved: false,
          updatedBalance: currentBalance,
          rejectionReason: `Insufficient sick leave balance (${currentBalance.sickLeaveRemaining} days remaining)`,
        };
      }
      updated.sickLeaveRemaining -= daysRequested;
    } else if (leaveType === "PRIVILEGE") {
      if (currentBalance.privilegeLeaveRemaining < daysRequested) {
        return {
          approved: false,
          updatedBalance: currentBalance,
          rejectionReason: `Insufficient privilege leave balance (${currentBalance.privilegeLeaveRemaining} days remaining)`,
        };
      }
      updated.privilegeLeaveRemaining -= daysRequested;
    }

    updated.totalAvailable =
      updated.casualLeaveRemaining +
      updated.sickLeaveRemaining +
      updated.privilegeLeaveRemaining;

    return {
      approved: true,
      updatedBalance: updated,
    };
  }

  /**
   * Computes statutory payroll numbers ready for ERP accounts posting and bank transfer.
   */
  static computeMonthlyPayroll(input: {
    employeeId: string;
    employeeName: string;
    monthYear: string;
    totalWorkingDays: number;
    daysPresent: number;
    daysAbsent: number;
    overtimeHours: number;
    monthlyBaseSalary: number;
    siteAllowanceDaily: number;
    hourlyOvertimeRate: number;
    tdsMonthly: number;
  }): PayrollCalculationResult {
    const presentRatio = Math.min(1.0, input.daysPresent / Math.max(1, input.totalWorkingDays));
    const earnedBase = Number((input.monthlyBaseSalary * presentRatio).toFixed(2));
    const hra = Number((earnedBase * 0.4).toFixed(2)); // 40% HRA
    const siteAllowance = Number((input.daysPresent * input.siteAllowanceDaily).toFixed(2));
    const overtimePay = Number((input.overtimeHours * input.hourlyOvertimeRate).toFixed(2));

    const grossPay = Number((earnedBase + hra + siteAllowance + overtimePay).toFixed(2));

    // Statutory deductions: PF 12% of basic (capped at statutory ceiling if applicable)
    const pfBase = Math.min(earnedBase, 15000);
    const providentFundDeduction = Number((pfBase * 0.12).toFixed(2));

    // ESI 0.75% of gross if gross <= 21000
    const esiDeduction = grossPay <= 21000 ? Number((grossPay * 0.0075).toFixed(2)) : 0;

    const totalDeductions = Number(
      (providentFundDeduction + esiDeduction + input.tdsMonthly).toFixed(2),
    );
    const netPayableSalary = Number(Math.max(0, grossPay - totalDeductions).toFixed(2));

    return {
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      monthYear: input.monthYear,
      daysPresent: input.daysPresent,
      daysAbsent: input.daysAbsent,
      overtimeHours: input.overtimeHours,
      baseSalary: input.monthlyBaseSalary,
      earnedBase,
      hra,
      siteAllowance,
      overtimePay,
      grossPay,
      providentFundDeduction,
      esiDeduction,
      taxDeduction: input.tdsMonthly,
      totalDeductions,
      netPayableSalary,
    };
  }

  /**
   * Verifies employee statutory documents for active site deployment.
   * Safety Induction and Aadhaar are mandatory.
   */
  static verifySiteDeploymentReadiness(documents: EmployeeDocumentRecord[]): {
    isEligibleForDeployment: boolean;
    missingMandatoryDocuments: string[];
  } {
    const mandatoryTypes = ["AADHAAR", "SAFETY_INDUCTION"];
    const verifiedTypes = documents
      .filter((d) => d.verificationStatus === "VERIFIED")
      .map((d) => d.documentType);

    const missing = mandatoryTypes.filter((m) => !verifiedTypes.includes(m as any));

    return {
      isEligibleForDeployment: missing.length === 0,
      missingMandatoryDocuments: missing,
    };
  }
}
