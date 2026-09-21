export type CompanyCode = "KDIPL" | "KDINFRA" | "KDCON" | "KDEQUIP";

export type LegalEntity = {
  id: string;
  code: CompanyCode;
  name: string;
  cin: string;
  pan: string;
  gstin: string;
  registeredAddress: string;
  baseCurrency: string;
  isActive: boolean;
  financialYearStartMonth: number; // 4 for April (India)
};

export const ENTERPRISE_ENTITIES: Record<CompanyCode, LegalEntity> = {
  KDIPL: {
    id: "ent-kdipl-01",
    code: "KDIPL",
    name: "Kumar Designers & Infra Projects Limited",
    cin: "U45200DL2012PLC234567",
    pan: "AAACK1234D",
    gstin: "07AAACK1234D1Z5",
    registeredAddress: "KDIPL Tower, Barakhamba Road, Connaught Place, New Delhi - 110001",
    baseCurrency: "INR",
    isActive: true,
    financialYearStartMonth: 4,
  },
  KDINFRA: {
    id: "ent-kdinfra-02",
    code: "KDINFRA",
    name: "KD Infra Engineering Private Limited",
    cin: "U45203DL2018PTC345678",
    pan: "AABCK5678E",
    gstin: "07AABCK5678E1Z8",
    registeredAddress: "Plot 42, Okhla Industrial Area Phase III, New Delhi - 110020",
    baseCurrency: "INR",
    isActive: true,
    financialYearStartMonth: 4,
  },
  KDCON: {
    id: "ent-kdcon-03",
    code: "KDCON",
    name: "KD Highway Concessions Limited",
    cin: "U45204HR2020PLC089123",
    pan: "AACCK9012F",
    gstin: "06AACCK9012F1Z1",
    registeredAddress: "Sector 32, Institutional Area, Gurugram, Haryana - 122001",
    baseCurrency: "INR",
    isActive: true,
    financialYearStartMonth: 4,
  },
  KDEQUIP: {
    id: "ent-kdequip-04",
    code: "KDEQUIP",
    name: "KD Heavy Plant & Logistics Private Limited",
    cin: "U71290UP2021PTC145679",
    pan: "AADCK3456G",
    gstin: "09AADCK3456G1Z4",
    registeredAddress: "Ecotech III, Greater Noida, Uttar Pradesh - 201306",
    baseCurrency: "INR",
    isActive: true,
    financialYearStartMonth: 4,
  },
};

export type CompanyContext = {
  activeCompanyId: string;
  activeCompanyCode: CompanyCode;
  companyName: string;
  gstin: string;
  pan: string;
  allowedCompanies: CompanyCode[];
  isConsolidatedView: boolean;
};

export type CompanyFinancialSummary = {
  companyCode: CompanyCode;
  companyName: string;
  annualRevenue: number;
  operationalExpense: number;
  grossMargin: number;
  activeProjectsCount: number;
  openCommitments: number; // Open POs
  cashReserve: number;
  interCompanyPayable: number;
  interCompanyReceivable: number;
};

export type ConsolidatedGroupRollup = {
  totalGrossRevenue: number;
  totalOperatingExpense: number;
  interCompanyEliminations: number;
  netConsolidatedRevenue: number;
  groupGrossMargin: number;
  groupGrossMarginPercent: number;
  totalActiveProjects: number;
  totalOpenCommitments: number;
  totalCashReserve: number;
  entitySummaries: CompanyFinancialSummary[];
  generatedAt: string;
};

export class MultiCompanyFoundationService {
  /**
   * Resolves the multi-company context for an authenticated user.
   * If the requested company is not in the user's authorized list, falls back to KDIPL.
   */
  static resolveCompanyContext(input: {
    requestedCompanyCode?: string | null;
    userRoleCodes: readonly string[];
    userAuthorizedCompanies?: CompanyCode[];
  }): CompanyContext {
    const isExecutive = input.userRoleCodes.some((role) =>
      ["MANAGING_DIRECTOR", "ADMIN", "PROJECT_DIRECTOR", "ACCOUNTS_ADMIN"].includes(role),
    );

    const allowedCompanies: CompanyCode[] = isExecutive
      ? ["KDIPL", "KDINFRA", "KDCON", "KDEQUIP"]
      : input.userAuthorizedCompanies && input.userAuthorizedCompanies.length > 0
        ? input.userAuthorizedCompanies
        : ["KDIPL"];

    const isConsolidated =
      isExecutive &&
      (input.requestedCompanyCode === "ALL" || input.requestedCompanyCode === "GROUP");

    const effectiveCode: CompanyCode =
      !isConsolidated &&
      input.requestedCompanyCode &&
      input.requestedCompanyCode in ENTERPRISE_ENTITIES &&
      allowedCompanies.includes(input.requestedCompanyCode as CompanyCode)
        ? (input.requestedCompanyCode as CompanyCode)
        : allowedCompanies[0] ?? "KDIPL";

    const entity = ENTERPRISE_ENTITIES[effectiveCode];

    return {
      activeCompanyId: entity.id,
      activeCompanyCode: effectiveCode,
      companyName: isConsolidated ? "KDIPL Corporate Group (Consolidated)" : entity.name,
      gstin: entity.gstin,
      pan: entity.pan,
      allowedCompanies,
      isConsolidatedView: isConsolidated,
    };
  }

  /**
   * Generates compliant, company-isolated sequence numbers.
   * Format: <COMPANY_CODE>-<DOC_TYPE>-<FINANCIAL_YEAR>-<SEQUENCE_PAD5>
   * Example: KDIPL-PO-2627-00042
   */
  static generateCompanyDocumentNumber(input: {
    companyCode: CompanyCode;
    documentType: "PO" | "MR" | "GRN" | "INV" | "PAY" | "WO" | "AST";
    financialYear: string; // e.g. "2627"
    sequence: number;
  }): string {
    const cleanCompany = (input.companyCode || "KDIPL").toUpperCase();
    const cleanType = input.documentType.toUpperCase();
    let cleanFY = input.financialYear.replace(/[^0-9]/g, "");
    if (cleanFY.length === 6 && cleanFY.startsWith("20")) {
      cleanFY = cleanFY.slice(2);
    } else if (cleanFY.length > 4) {
      cleanFY = cleanFY.slice(0, 4);
    }
    if (!cleanFY) cleanFY = "2627";
    const padSeq = String(Math.max(1, Math.floor(input.sequence))).padStart(5, "0");
    return `${cleanCompany}-${cleanType}-${cleanFY}-${padSeq}`;
  }

  /**
   * Verifies data isolation scope to ensure records cannot cross company boundaries
   * unless explicitly in group consolidated audit mode.
   */
  static getCompanyIsolationScope(context: CompanyContext): {
    companyIdClause: string | { in: string[] };
    isRestricted: boolean;
  } {
    if (context.isConsolidatedView) {
      const allIds = Object.values(ENTERPRISE_ENTITIES).map((e) => e.id);
      return {
        companyIdClause: { in: allIds },
        isRestricted: false,
      };
    }
    return {
      companyIdClause: context.activeCompanyId,
      isRestricted: true,
    };
  }

  /**
   * Consolidates multi-entity financial figures with elimination of inter-company transactions.
   */
  static consolidateGroupFinancials(
    entities: CompanyFinancialSummary[],
  ): ConsolidatedGroupRollup {
    let totalGrossRevenue = 0;
    let totalOperatingExpense = 0;
    let totalEliminations = 0;
    let totalActiveProjects = 0;
    let totalOpenCommitments = 0;
    let totalCashReserve = 0;

    for (const ent of entities) {
      totalGrossRevenue += ent.annualRevenue;
      totalOperatingExpense += ent.operationalExpense;
      totalActiveProjects += ent.activeProjectsCount;
      totalOpenCommitments += ent.openCommitments;
      totalCashReserve += ent.cashReserve;
      // Inter-company transactions to eliminate from top-line
      totalEliminations += Math.min(ent.interCompanyPayable, ent.interCompanyReceivable);
    }

    const netConsolidatedRevenue = Math.max(0, totalGrossRevenue - totalEliminations);
    const groupGrossMargin = netConsolidatedRevenue - totalOperatingExpense;
    const groupGrossMarginPercent =
      netConsolidatedRevenue > 0
        ? Number(((groupGrossMargin / netConsolidatedRevenue) * 100).toFixed(2))
        : 0;

    return {
      totalGrossRevenue,
      totalOperatingExpense,
      interCompanyEliminations: totalEliminations,
      netConsolidatedRevenue,
      groupGrossMargin,
      groupGrossMarginPercent,
      totalActiveProjects,
      totalOpenCommitments,
      totalCashReserve,
      entitySummaries: entities,
      generatedAt: new Date().toISOString(),
    };
  }
}
