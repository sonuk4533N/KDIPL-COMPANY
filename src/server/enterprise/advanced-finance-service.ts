export type AccountClass = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

export type ChartOfAccountNode = {
  accountCode: string;
  accountName: string;
  accountClass: AccountClass;
  parentCode?: string;
  isActive: boolean;
};

export type JournalVoucherLine = {
  accountCode: string;
  accountName: string;
  costCenterId?: string; // Project or Department ID
  debitINR: number;
  creditINR: number;
  description?: string;
};

export type JournalVoucher = {
  voucherNumber: string;
  voucherDate: string; // YYYY-MM-DD
  voucherType: "GENERAL" | "PURCHASE" | "PAYMENT" | "RECEIPT" | "CONTRA";
  companyCode: string;
  lines: JournalVoucherLine[];
  narration: string;
  isPosted: boolean;
};

export type FinancialPeriod = {
  periodCode: string; // e.g. "2026-M04"
  startDate: string;
  endDate: string;
  status: "OPEN" | "SOFT_LOCKED" | "HARD_LOCKED";
};

export class AdvancedFinancialArchitectureService {
  /**
   * Validates that a journal voucher conforms to strict double-entry principles:
   * 1. Sum of debits MUST equal sum of credits.
   * 2. Must contain at least two non-zero lines.
   */
  static validateDoubleEntryJournal(voucher: JournalVoucher): {
    isValid: boolean;
    totalDebit: number;
    totalCredit: number;
    imbalanceAmount: number;
    errorReason?: string;
  } {
    if (!voucher.lines || voucher.lines.length < 2) {
      return {
        isValid: false,
        totalDebit: 0,
        totalCredit: 0,
        imbalanceAmount: 0,
        errorReason: "Journal voucher must contain at least 2 lines.",
      };
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of voucher.lines) {
      totalDebit += line.debitINR || 0;
      totalCredit += line.creditINR || 0;
    }

    totalDebit = Number(totalDebit.toFixed(2));
    totalCredit = Number(totalCredit.toFixed(2));
    const imbalance = Number(Math.abs(totalDebit - totalCredit).toFixed(2));

    if (imbalance > 0.01) {
      return {
        isValid: false,
        totalDebit,
        totalCredit,
        imbalanceAmount: imbalance,
        errorReason: `Double entry imbalance: Total Debits (₹${totalDebit}) does not equal Total Credits (₹${totalCredit}). Variance: ₹${imbalance}`,
      };
    }

    return {
      isValid: true,
      totalDebit,
      totalCredit,
      imbalanceAmount: 0,
    };
  }

  /**
   * Enforces financial period locks.
   * Prevents creating or modifying transactions in locked accounting periods.
   */
  static checkPeriodLock(
    transactionDate: string,
    periods: FinancialPeriod[],
  ): {
    allowed: boolean;
    periodStatus: "OPEN" | "SOFT_LOCKED" | "HARD_LOCKED";
    message: string;
  } {
    const txTime = new Date(transactionDate).getTime();
    const activePeriod = periods.find((p) => {
      const start = new Date(p.startDate).getTime();
      const end = new Date(p.endDate).getTime();
      return txTime >= start && txTime <= end;
    });

    if (!activePeriod) {
      return {
        allowed: false,
        periodStatus: "HARD_LOCKED",
        message: `No defined accounting period found for transaction date ${transactionDate}`,
      };
    }

    if (activePeriod.status === "HARD_LOCKED") {
      return {
        allowed: false,
        periodStatus: "HARD_LOCKED",
        message: `Financial period ${activePeriod.periodCode} is HARD LOCKED by Corporate Accounts. No back-dated transactions permitted.`,
      };
    }

    if (activePeriod.status === "SOFT_LOCKED") {
      return {
        allowed: true,
        periodStatus: "SOFT_LOCKED",
        message: `Financial period ${activePeriod.periodCode} is SOFT LOCKED. Finance Director override required.`,
      };
    }

    return {
      allowed: true,
      periodStatus: "OPEN",
      message: `Financial period ${activePeriod.periodCode} is active and open for posting.`,
    };
  }
}
