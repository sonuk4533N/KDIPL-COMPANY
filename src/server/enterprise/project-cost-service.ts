export type CostCategory =
  | "MATERIAL"
  | "LABOUR"
  | "PLANT_EQUIPMENT"
  | "SUBCONTRACTOR"
  | "SITE_OVERHEAD";

export type CostCategoryBreakdown = {
  category: CostCategory;
  budgetAllocated: number;
  committedAmount: number; // Open POs / unbilled WOs
  actualSpent: number; // Incurred invoices & payroll
  totalExposure: number; // actual + committed
  availableBalance: number;
  variancePercent: number;
};

export type EarnedValueMetrics = {
  projectId: string;
  projectName: string;
  budgetAtCompletion: number; // BAC (Baseline sanctioned budget)
  plannedValue: number; // PV (Expected progress value)
  earnedValue: number; // EV (Physical work completed value)
  actualCost: number; // AC (Total cost incurred)
  costVariance: number; // CV = EV - AC (>0 favorable, <0 unfavorable)
  scheduleVariance: number; // SV = EV - PV (>0 ahead, <0 behind)
  costPerformanceIndex: number; // CPI = EV / AC (>=1.0 under budget)
  schedulePerformanceIndex: number; // SPI = EV / PV (>=1.0 ahead of schedule)
  costToComplete: number; // CTC
  estimateAtCompletion: number; // EAC
  varianceAtCompletion: number; // VAC = BAC - EAC
  healthStatus: "EXCELLENT" | "ON_TRACK" | "AT_RISK" | "CRITICAL";
  categories: CostCategoryBreakdown[];
};

export type ProjectProfitabilityStatement = {
  projectId: string;
  contractValue: number;
  totalRevenueBilled: number;
  totalDirectCost: number;
  grossProfit: number;
  grossProfitMarginPercent: number;
  allocatedOverheads: number;
  netProfit: number;
  netProfitMarginPercent: number;
};

export class AdvancedProjectCostService {
  /**
   * Calculates comprehensive Earned Value Management (EVM) metrics
   * to provide accurate cost forecasting and completion timelines.
   */
  static computeEVM(input: {
    projectId: string;
    projectName: string;
    budgetAtCompletion: number;
    plannedValue: number;
    earnedValue: number;
    actualCost: number;
    categories?: CostCategoryBreakdown[];
  }): EarnedValueMetrics {
    const { budgetAtCompletion: BAC, plannedValue: PV, earnedValue: EV, actualCost: AC } = input;

    const CV = Number((EV - AC).toFixed(2));
    const SV = Number((EV - PV).toFixed(2));
    const CPI = AC > 0 ? Number((EV / AC).toFixed(3)) : 1.0;
    const SPI = PV > 0 ? Number((EV / PV).toFixed(3)) : 1.0;

    // Estimate At Completion (EAC): AC + (BAC - EV) / CPI
    // If CPI <= 0.1, fallback to AC + (BAC - EV)
    const remainingWork = Math.max(0, BAC - EV);
    const effectiveCPI = Math.max(0.2, CPI);
    const costToComplete = Number((remainingWork / effectiveCPI).toFixed(2));
    const estimateAtCompletion = Number((AC + costToComplete).toFixed(2));
    const varianceAtCompletion = Number((BAC - estimateAtCompletion).toFixed(2));

    let healthStatus: "EXCELLENT" | "ON_TRACK" | "AT_RISK" | "CRITICAL" = "ON_TRACK";
    if (CPI >= 1.05 && SPI >= 1.0) {
      healthStatus = "EXCELLENT";
    } else if (CPI >= 0.95 && SPI >= 0.9) {
      healthStatus = "ON_TRACK";
    } else if (CPI >= 0.85 || SPI >= 0.8) {
      healthStatus = "AT_RISK";
    } else {
      healthStatus = "CRITICAL";
    }

    const defaultCategories: CostCategoryBreakdown[] = input.categories ?? [
      {
        category: "MATERIAL",
        budgetAllocated: BAC * 0.5,
        committedAmount: AC * 0.15,
        actualSpent: AC * 0.5,
        totalExposure: AC * 0.65,
        availableBalance: BAC * 0.5 - AC * 0.65,
        variancePercent: 0,
      },
      {
        category: "LABOUR",
        budgetAllocated: BAC * 0.25,
        committedAmount: 0,
        actualSpent: AC * 0.25,
        totalExposure: AC * 0.25,
        availableBalance: BAC * 0.25 - AC * 0.25,
        variancePercent: 0,
      },
      {
        category: "PLANT_EQUIPMENT",
        budgetAllocated: BAC * 0.15,
        committedAmount: AC * 0.05,
        actualSpent: AC * 0.15,
        totalExposure: AC * 0.2,
        availableBalance: BAC * 0.15 - AC * 0.2,
        variancePercent: 0,
      },
      {
        category: "SUBCONTRACTOR",
        budgetAllocated: BAC * 0.1,
        committedAmount: AC * 0.02,
        actualSpent: AC * 0.1,
        totalExposure: AC * 0.12,
        availableBalance: BAC * 0.1 - AC * 0.12,
        variancePercent: 0,
      },
    ];

    return {
      projectId: input.projectId,
      projectName: input.projectName,
      budgetAtCompletion: BAC,
      plannedValue: PV,
      earnedValue: EV,
      actualCost: AC,
      costVariance: CV,
      scheduleVariance: SV,
      costPerformanceIndex: CPI,
      schedulePerformanceIndex: SPI,
      costToComplete,
      estimateAtCompletion,
      varianceAtCompletion,
      healthStatus,
      categories: defaultCategories,
    };
  }

  /**
   * Generates project profitability statement based on billed revenue vs total incurred costs.
   */
  static computeProjectProfitability(input: {
    projectId: string;
    contractValue: number;
    totalRevenueBilled: number;
    materialCost: number;
    labourCost: number;
    equipmentCost: number;
    subcontractorCost: number;
    allocatedOverheads: number;
  }): ProjectProfitabilityStatement {
    const totalDirectCost =
      input.materialCost + input.labourCost + input.equipmentCost + input.subcontractorCost;
    const grossProfit = input.totalRevenueBilled - totalDirectCost;
    const grossProfitMarginPercent =
      input.totalRevenueBilled > 0
        ? Number(((grossProfit / input.totalRevenueBilled) * 100).toFixed(2))
        : 0;

    const netProfit = grossProfit - input.allocatedOverheads;
    const netProfitMarginPercent =
      input.totalRevenueBilled > 0
        ? Number(((netProfit / input.totalRevenueBilled) * 100).toFixed(2))
        : 0;

    return {
      projectId: input.projectId,
      contractValue: input.contractValue,
      totalRevenueBilled: input.totalRevenueBilled,
      totalDirectCost,
      grossProfit,
      grossProfitMarginPercent,
      allocatedOverheads: input.allocatedOverheads,
      netProfit,
      netProfitMarginPercent,
    };
  }
}
