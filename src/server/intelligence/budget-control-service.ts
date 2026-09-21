export type BudgetCategory =
  | "CIVIL_STRUCTURE"
  | "STEEL_REINFORCEMENT"
  | "CEMENT_MASONRY"
  | "ELECTRICAL_PLUMBING"
  | "LABOR_CONTRACT"
  | "PLANT_MACHINERY"
  | "ADMIN_OVERHEAD";

export type CostControlPosition = {
  projectId: string;
  category: BudgetCategory;
  sanctionedBudget: number;
  actualIncurred: number;
  committedCost: number; // e.g. open POs not yet billed
  totalExposure: number; // actual + committed
  availableBalance: number;
  consumptionPercent: number;
  forecastCostToComplete: number;
  varianceAtCompletion: number; // Sanctioned - (Actual + Forecast)
  thresholdStatus: "NORMAL" | "APPROACHING_LIMIT" | "EXCEEDED";
  lockProcurement: boolean;
};

export type VarianceAlert = {
  projectId: string;
  category: BudgetCategory;
  level: "WARNING" | "CRITICAL";
  message: string;
  consumptionPercent: number;
  triggeredAt: string;
};

export class BudgetCostControlEngine {
  /**
   * Evaluates project budget vs committed cost and actual expenditure.
   * Threshold rules:
   * - <= 80%: NORMAL
   * - > 80% and <= 100%: APPROACHING_LIMIT (Generates WARNING alert)
   * - > 100%: EXCEEDED (Requires Director override; generates CRITICAL alert)
   */
  static evaluateBudgetControl(input: {
    projectId: string;
    category: BudgetCategory;
    sanctionedBudget: number;
    actualIncurred: number;
    committedCost: number;
    estimatedCostToComplete: number;
  }): CostControlPosition {
    const totalExposure = input.actualIncurred + input.committedCost;
    const availableBalance = input.sanctionedBudget - totalExposure;
    const consumptionPercent =
      input.sanctionedBudget > 0
        ? Number(((totalExposure / input.sanctionedBudget) * 100).toFixed(2))
        : 0;

    const forecastTotal = input.actualIncurred + input.estimatedCostToComplete;
    const varianceAtCompletion = input.sanctionedBudget - forecastTotal;

    let thresholdStatus: "NORMAL" | "APPROACHING_LIMIT" | "EXCEEDED" = "NORMAL";
    let lockProcurement = false;

    if (consumptionPercent > 100) {
      thresholdStatus = "EXCEEDED";
      lockProcurement = true;
    } else if (consumptionPercent >= 80) {
      thresholdStatus = "APPROACHING_LIMIT";
      lockProcurement = false;
    }

    return {
      projectId: input.projectId,
      category: input.category,
      sanctionedBudget: input.sanctionedBudget,
      actualIncurred: input.actualIncurred,
      committedCost: input.committedCost,
      totalExposure,
      availableBalance,
      consumptionPercent,
      forecastCostToComplete: input.estimatedCostToComplete,
      varianceAtCompletion,
      thresholdStatus,
      lockProcurement,
    };
  }

  /**
   * Checks if a new Purchase Order or Requisition breaches budget thresholds.
   */
  static validateProcurementThreshold(
    currentPosition: CostControlPosition,
    additionalAmount: number,
  ): {
    approved: boolean;
    requiresDirectorOverride: boolean;
    reason?: string;
    newExposure: number;
    newConsumptionPercent: number;
  } {
    const newExposure = currentPosition.totalExposure + additionalAmount;
    const newConsumptionPercent =
      currentPosition.sanctionedBudget > 0
        ? Number(
            ((newExposure / currentPosition.sanctionedBudget) * 100).toFixed(2),
          )
        : 100;

    if (newExposure > currentPosition.sanctionedBudget) {
      return {
        approved: false,
        requiresDirectorOverride: true,
        reason: `Exceeds sanctioned budget for ${currentPosition.category}. Budget: ₹${currentPosition.sanctionedBudget.toLocaleString("en-IN")}, Proposed Total Exposure: ₹${newExposure.toLocaleString("en-IN")} (${newConsumptionPercent}%).`,
        newExposure,
        newConsumptionPercent,
      };
    }

    return {
      approved: true,
      requiresDirectorOverride: newConsumptionPercent >= 90,
      reason:
        newConsumptionPercent >= 90
          ? `Within budget but approaches critical threshold (${newConsumptionPercent}%). Director notification required.`
          : undefined,
      newExposure,
      newConsumptionPercent,
    };
  }
}
