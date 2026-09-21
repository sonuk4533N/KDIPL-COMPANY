export type AssetCategory =
  | "HEAVY_EARTHMOVING"
  | "CONCRETE_EQUIPMENT"
  | "LIFTING_EQUIPMENT"
  | "POWER_GENERATION"
  | "SURVEY_TESTING"
  | "TRANSPORT_VEHICLE";

export type AssetCondition = "OPERATIONAL" | "STANDBY" | "MAINTENANCE" | "DECOMMISSIONED";

export type AssetRegisterEntry = {
  assetId: string;
  assetCode: string;
  tagRfidOrBarcode: string;
  name: string;
  category: AssetCategory;
  model: string;
  serialNumber: string;
  purchaseDate: string; // YYYY-MM-DD
  capitalCostINR: number;
  salvageValueINR: number;
  usefulLifeYears: number;
  assignedCompanyId: string;
  currentProjectId?: string;
  currentSiteId?: string;
  condition: AssetCondition;
  totalOperatingHours: number;
};

export type AssetUtilizationRecord = {
  assetId: string;
  reportingPeriod: string; // e.g. "2026-W16"
  totalWorkingHours: number;
  operatingHours: number;
  idleHours: number;
  breakdownHours: number;
  utilizationRatePercent: number; // operatingHours / totalWorkingHours
  availabilityRatePercent: number; // (working - breakdown) / working
};

export type AssetDepreciationSchedule = {
  assetId: string;
  annualDepreciationAmount: number;
  accumulatedDepreciation: number;
  currentBookValue: number;
  isFullyDepreciated: boolean;
};

export class AssetEquipmentManagementService {
  /**
   * Computes asset depreciation using Companies Act Straight-Line Method (SLM).
   * Annual Depr = (Cost - Salvage) / UsefulLifeYears
   */
  static computeStraightLineDepreciation(
    asset: AssetRegisterEntry,
    asOfDate = new Date(),
  ): AssetDepreciationSchedule {
    const pDate = new Date(asset.purchaseDate);
    const elapsedMonths = Math.max(
      0,
      (asOfDate.getFullYear() - pDate.getFullYear()) * 12 +
        (asOfDate.getMonth() - pDate.getMonth()),
    );
    const elapsedYears = elapsedMonths / 12;

    const depreciableBase = Math.max(0, asset.capitalCostINR - asset.salvageValueINR);
    const annualDepr =
      asset.usefulLifeYears > 0 ? Number((depreciableBase / asset.usefulLifeYears).toFixed(2)) : 0;

    const accumulated = Math.min(depreciableBase, Number((annualDepr * elapsedYears).toFixed(2)));
    const currentBookValue = Number(
      Math.max(asset.salvageValueINR, asset.capitalCostINR - accumulated).toFixed(2),
    );
    const isFullyDepreciated = accumulated >= depreciableBase;

    return {
      assetId: asset.assetId,
      annualDepreciationAmount: annualDepr,
      accumulatedDepreciation: accumulated,
      currentBookValue,
      isFullyDepreciated,
    };
  }

  /**
   * Evaluates equipment utilization and availability metrics for a reporting period.
   */
  static calculateUtilization(input: {
    assetId: string;
    reportingPeriod: string;
    totalAvailableHours: number;
    operatingHours: number;
    idleHours: number;
    breakdownHours: number;
  }): AssetUtilizationRecord {
    const total = Math.max(1, input.totalAvailableHours);
    const utilRate = Number(((input.operatingHours / total) * 100).toFixed(2));
    const availHours = Math.max(0, total - input.breakdownHours);
    const availRate = Number(((availHours / total) * 100).toFixed(2));

    return {
      assetId: input.assetId,
      reportingPeriod: input.reportingPeriod,
      totalWorkingHours: total,
      operatingHours: input.operatingHours,
      idleHours: input.idleHours,
      breakdownHours: input.breakdownHours,
      utilizationRatePercent: Math.min(100, utilRate),
      availabilityRatePercent: Math.min(100, availRate),
    };
  }

  /**
   * Validates and records equipment mobilization or site transfer.
   */
  static transferEquipmentSite(
    asset: AssetRegisterEntry,
    targetProjectId: string,
    targetSiteId: string,
  ): {
    success: boolean;
    updatedAsset: AssetRegisterEntry;
    transferRef: string;
    message: string;
  } {
    if (asset.condition === "MAINTENANCE" || asset.condition === "DECOMMISSIONED") {
      return {
        success: false,
        updatedAsset: asset,
        transferRef: "",
        message: `Cannot transfer asset currently in condition: ${asset.condition}`,
      };
    }

    const updated = {
      ...asset,
      currentProjectId: targetProjectId,
      currentSiteId: targetSiteId,
      condition: "STANDBY" as AssetCondition, // Placed on standby until commissioned at site
    };

    const transferRef = `EQ-TRF-${Date.now().toString().slice(-6)}`;

    return {
      success: true,
      updatedAsset: updated,
      transferRef,
      message: `Asset ${asset.assetCode} successfully scheduled for transfer to site ${targetSiteId}.`,
    };
  }
}
