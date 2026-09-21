export type OpportunityStage =
  | "LEAD_IDENTIFIED"
  | "PRE_QUALIFICATION"
  | "BID_SUBMISSION"
  | "TECHNICAL_FINANCIAL_OPENING"
  | "AWARDED_WON"
  | "LOST";

export const STAGE_PROBABILITY_MAP: Record<OpportunityStage, number> = {
  LEAD_IDENTIFIED: 0.1,
  PRE_QUALIFICATION: 0.3,
  BID_SUBMISSION: 0.6,
  TECHNICAL_FINANCIAL_OPENING: 0.8,
  AWARDED_WON: 1.0,
  LOST: 0.0,
};

export type BusinessDevelopmentOpportunity = {
  opportunityId: string;
  opportunityCode: string;
  title: string;
  clientName: string;
  clientType: "GOVERNMENT_PSU" | "HIGHWAY_CONCESSIONAIRE" | "PRIVATE_DEVELOPER" | "INDUSTRIAL";
  estimatedValueINR: number;
  stage: OpportunityStage;
  submissionDeadline: string;
  bidMarginTargetPercent: number;
  assignedDirectorId: string;
  isConvertedToProject: boolean;
};

export type PipelineValuationSummary = {
  totalOpportunitiesCount: number;
  totalUnweightedPipelineValueINR: number;
  weightedPipelineValueINR: number;
  activeOpportunitiesByStage: Record<OpportunityStage, number>;
};

export type ConvertedProjectBlueprint = {
  projectCode: string;
  projectName: string;
  clientName: string;
  sanctionedContractValue: number;
  initialProcurementBudget: number; // calculated at (100 - targetMargin)% of contract
  estimatedStartDate: string;
};

export class CustomerBusinessDevelopmentService {
  /**
   * Computes total pipeline value and probability-weighted pipeline forecast.
   */
  static evaluatePipeline(
    opportunities: BusinessDevelopmentOpportunity[],
  ): PipelineValuationSummary {
    let totalUnweighted = 0;
    let weightedTotal = 0;

    const stageCounts: Record<OpportunityStage, number> = {
      LEAD_IDENTIFIED: 0,
      PRE_QUALIFICATION: 0,
      BID_SUBMISSION: 0,
      TECHNICAL_FINANCIAL_OPENING: 0,
      AWARDED_WON: 0,
      LOST: 0,
    };

    for (const opp of opportunities) {
      stageCounts[opp.stage] = (stageCounts[opp.stage] || 0) + 1;
      if (opp.stage !== "LOST") {
        totalUnweighted += opp.estimatedValueINR;
        const prob = STAGE_PROBABILITY_MAP[opp.stage] ?? 0.1;
        weightedTotal += opp.estimatedValueINR * prob;
      }
    }

    return {
      totalOpportunitiesCount: opportunities.length,
      totalUnweightedPipelineValueINR: Number(totalUnweighted.toFixed(2)),
      weightedPipelineValueINR: Number(weightedTotal.toFixed(2)),
      activeOpportunitiesByStage: stageCounts,
    };
  }

  /**
   * Factory function that transforms an Awarded Opportunity into a new operational Project blueprint.
   */
  static convertOpportunityToProject(
    opportunity: BusinessDevelopmentOpportunity,
  ): ConvertedProjectBlueprint {
    if (opportunity.stage !== "AWARDED_WON") {
      throw new Error("Only opportunities in AWARDED_WON stage can be converted to projects");
    }

    const marginFactor = Math.max(0.05, Math.min(0.5, opportunity.bidMarginTargetPercent / 100));
    const budget = Number((opportunity.estimatedValueINR * (1 - marginFactor)).toFixed(2));

    const prefix = opportunity.opportunityCode.replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase();
    const projectCode = `PRJ-${prefix}-${Date.now().toString().slice(-4)}`;

    return {
      projectCode,
      projectName: opportunity.title,
      clientName: opportunity.clientName,
      sanctionedContractValue: opportunity.estimatedValueINR,
      initialProcurementBudget: budget,
      estimatedStartDate: new Date().toISOString().split("T")[0],
    };
  }
}
