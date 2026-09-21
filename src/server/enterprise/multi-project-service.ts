export type RegionCode = "NORTH" | "SOUTH" | "EAST" | "WEST" | "CENTRAL";

export type ProjectStoreType =
  | "CENTRAL_WAREHOUSE"
  | "MAIN_PROJECT_STORE"
  | "SUB_STORE_ELECTRICAL"
  | "SUB_STORE_CIVIL"
  | "HAZARDOUS_CHEMICAL_STORE"
  | "OPEN_YARD"
  | "SCRAP_DISPOSAL_YARD";

export type StoreLocationRecord = {
  id: string;
  storeCode: string;
  name: string;
  projectId?: string;
  region: RegionCode;
  type: ProjectStoreType;
  isActive: boolean;
  maxCapacityVolumeCubicMeters?: number;
};

export type InterProjectTransferStatus =
  | "DRAFT"
  | "REQUESTED"
  | "APPROVED_SOURCE"
  | "GATE_PASS_ISSUED"
  | "IN_TRANSIT"
  | "RECEIVED_QC_PENDING"
  | "COMPLETED"
  | "REJECTED_CANCELLED";

export type InterProjectTransferRequest = {
  transferId: string;
  transferNumber: string;
  sourceProjectId: string;
  sourceStoreId: string;
  targetProjectId: string;
  targetStoreId: string;
  materialCode: string;
  materialName: string;
  requestedQuantity: number;
  approvedQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  unit: string;
  vehicleNumber?: string;
  driverContact?: string;
  gatePassNumber?: string;
  status: InterProjectTransferStatus;
  transitLossQuantity: number;
  createdDate: string;
  updatedDate: string;
};

export type CrossProjectAllocationProposal = {
  materialCode: string;
  materialName: string;
  unit: string;
  surplusProjectId: string;
  surplusProjectName: string;
  surplusQuantity: number;
  deficitProjectId: string;
  deficitProjectName: string;
  deficitQuantity: number;
  recommendedTransferQuantity: number;
  estimatedCostSavings: number; // Avoids new procurement
};

export class MultiProjectScalingService {
  /**
   * Validates and advances an inter-project stock transfer workflow.
   */
  static processTransferStep(
    transfer: InterProjectTransferRequest,
    action: "APPROVE" | "DISPATCH" | "RECEIVE",
    payload?: {
      approvedQty?: number;
      vehicleNumber?: string;
      driverContact?: string;
      receivedQty?: number;
      transitLoss?: number;
    },
  ): InterProjectTransferRequest {
    const updated = { ...transfer, updatedDate: new Date().toISOString() };

    switch (action) {
      case "APPROVE":
        if (updated.status !== "REQUESTED" && updated.status !== "DRAFT") {
          throw new Error(`Cannot approve transfer in status: ${updated.status}`);
        }
        updated.approvedQuantity = payload?.approvedQty ?? updated.requestedQuantity;
        updated.status = "APPROVED_SOURCE";
        break;

      case "DISPATCH":
        if (updated.status !== "APPROVED_SOURCE") {
          throw new Error(`Cannot dispatch transfer before source approval`);
        }
        updated.dispatchedQuantity = updated.approvedQuantity;
        updated.vehicleNumber = payload?.vehicleNumber ?? "DL-1LAB-4421";
        updated.driverContact = payload?.driverContact ?? "+91-9876543210";
        updated.gatePassNumber = `GP-${Date.now().toString().slice(-6)}`;
        updated.status = "IN_TRANSIT";
        break;

      case "RECEIVE":
        if (updated.status !== "IN_TRANSIT" && updated.status !== "RECEIVED_QC_PENDING") {
          throw new Error(`Cannot receive transfer that is not in transit`);
        }
        const recQty = payload?.receivedQty ?? updated.dispatchedQuantity;
        const loss = payload?.transitLoss ?? Math.max(0, updated.dispatchedQuantity - recQty);
        updated.receivedQuantity = recQty;
        updated.transitLossQuantity = loss;
        updated.status = "COMPLETED";
        break;
    }

    return updated;
  }

  /**
   * Evaluates cross-project inventory across all active sites and identifies
   * surplus stock in certain projects that can be reallocated to projects experiencing stockouts.
   */
  static evaluateCrossProjectSurplus(
    siteInventories: Array<{
      projectId: string;
      projectName: string;
      materialCode: string;
      materialName: string;
      unit: string;
      unitRate: number;
      currentStock: number;
      safetyStockThreshold: number;
      averageDailyBurn: number;
    }>,
  ): CrossProjectAllocationProposal[] {
    const proposals: CrossProjectAllocationProposal[] = [];

    // Group by material code
    const byMaterial: Record<string, typeof siteInventories> = {};
    for (const item of siteInventories) {
      if (!byMaterial[item.materialCode]) {
        byMaterial[item.materialCode] = [];
      }
      byMaterial[item.materialCode].push(item);
    }

    for (const [code, items] of Object.entries(byMaterial)) {
      const surplusItems = items.filter(
        (i) => i.currentStock > i.safetyStockThreshold * 2.5 && i.averageDailyBurn > 0,
      );
      const deficitItems = items.filter(
        (i) => i.currentStock <= i.safetyStockThreshold && i.averageDailyBurn > 0,
      );

      for (const deficit of deficitItems) {
        for (const surplus of surplusItems) {
          if (surplus.projectId === deficit.projectId) continue;

          const availableSurplus = surplus.currentStock - surplus.safetyStockThreshold * 1.5;
          const neededDeficit = deficit.safetyStockThreshold * 2 - deficit.currentStock;

          if (availableSurplus > 0 && neededDeficit > 0) {
            const transferQty = Math.min(availableSurplus, neededDeficit);
            proposals.push({
              materialCode: code,
              materialName: surplus.materialName,
              unit: surplus.unit,
              surplusProjectId: surplus.projectId,
              surplusProjectName: surplus.projectName,
              surplusQuantity: Number(availableSurplus.toFixed(2)),
              deficitProjectId: deficit.projectId,
              deficitProjectName: deficit.projectName,
              deficitQuantity: Number(neededDeficit.toFixed(2)),
              recommendedTransferQuantity: Number(transferQty.toFixed(2)),
              estimatedCostSavings: Number((transferQty * surplus.unitRate).toFixed(2)),
            });
            break; // Matched first available surplus
          }
        }
      }
    }

    return proposals;
  }
}
