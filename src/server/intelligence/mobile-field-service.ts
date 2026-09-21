export type QuickMaterialRequestInput = {
  projectId: string;
  siteId: string;
  urgency: "LOW" | "NORMAL" | "EMERGENCY";
  items: {
    materialId: string;
    quantity: number;
    unit: string;
    notes?: string;
  }[];
  siteSupervisorId: string;
  gpsCoordinates?: { latitude: number; longitude: number };
};

export type MobileGoodsReceiptInput = {
  poId: string;
  challanNumber: string;
  challanDate: string;
  deliveryVehicleNumber: string;
  receivedItems: {
    materialId: string;
    receivedQty: number;
    acceptedQty: number;
    damagedQty: number;
  }[];
  photoEvidenceUrls: string[];
  storeKeeperId: string;
  receiverSignatureHash?: string;
};

export type MobileIssueAcknowledgment = {
  issueVoucherId: string;
  subcontractorOrWorkPackage: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
  digitalSignatureHash: string;
};

export type MobileOfflineQueuePacket = {
  packetId: string;
  actionType:
    | "QUICK_MATERIAL_REQUEST"
    | "MOBILE_GRN"
    | "ISSUE_ACKNOWLEDGMENT"
    | "PHYSICAL_STOCK_COUNT";
  payload: Record<string, unknown>;
  capturedAt: string;
  syncAttempts: number;
};

export class MobileFieldOptimizationEngine {
  /**
   * Validates and normalizes quick material requests submitted from field devices.
   */
  static processQuickMaterialRequest(input: QuickMaterialRequestInput): {
    valid: boolean;
    errors: string[];
    requestDraft: {
      documentCode: string;
      itemCount: number;
      requiresDirectorFastTrack: boolean;
    };
  } {
    const errors: string[] = [];
    if (!input.projectId || !input.siteId) {
      errors.push("Project and Site identifiers are mandatory.");
    }
    if (!input.items || input.items.length === 0) {
      errors.push("At least one material line item is required.");
    }

    const requiresDirectorFastTrack = input.urgency === "EMERGENCY";
    const documentCode = `QMR-${Date.now().toString().slice(-6)}`;

    return {
      valid: errors.length === 0,
      errors,
      requestDraft: {
        documentCode,
        itemCount: input.items.length,
        requiresDirectorFastTrack,
      },
    };
  }

  /**
   * Ingests mobile GRN data with mandatory photo evidence and damage segregation.
   */
  static processMobileGoodsReceipt(input: MobileGoodsReceiptInput): {
    valid: boolean;
    errors: string[];
    hasDamagedItems: boolean;
    totalReceivedQuantity: number;
  } {
    const errors: string[] = [];
    if (!input.challanNumber.trim()) {
      errors.push("Delivery challan number is mandatory.");
    }
    if (input.photoEvidenceUrls.length === 0) {
      errors.push(
        "At least one physical challan photo or material photo must be attached.",
      );
    }

    let totalReceivedQuantity = 0;
    let hasDamagedItems = false;

    for (const item of input.receivedItems) {
      totalReceivedQuantity += item.receivedQty;
      if (item.damagedQty > 0) hasDamagedItems = true;
      if (item.acceptedQty + item.damagedQty !== item.receivedQty) {
        errors.push(
          `Quantity mismatch for material ${item.materialId}: Accepted (${item.acceptedQty}) + Damaged (${item.damagedQty}) != Received (${item.receivedQty})`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      hasDamagedItems,
      totalReceivedQuantity,
    };
  }

  /**
   * Evaluates offline packets for deterministic conflict-free syncing.
   */
  static reconcileOfflineQueuePackets(packets: MobileOfflineQueuePacket[]): {
    processedCount: number;
    failedPackets: MobileOfflineQueuePacket[];
  } {
    let processedCount = 0;
    const failedPackets: MobileOfflineQueuePacket[] = [];

    // Sort by capturedAt ascending to process chronologically
    const sorted = [...packets].sort(
      (a, b) =>
        new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
    );

    for (const packet of sorted) {
      if (!packet.packetId || !packet.actionType) {
        failedPackets.push({
          ...packet,
          syncAttempts: packet.syncAttempts + 1,
        });
      } else {
        processedCount++;
      }
    }

    return { processedCount, failedPackets };
  }
}
