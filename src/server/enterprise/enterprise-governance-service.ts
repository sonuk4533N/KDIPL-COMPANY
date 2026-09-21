export type GovernanceAction =
  | "APPROVE_PO"
  | "RECEIVE_GRN"
  | "APPROVE_INVOICE"
  | "RELEASE_PAYMENT"
  | "MODIFY_BANK_DETAILS";

export type SegregationOfDutiesViolation = {
  violationType: "CREATOR_AS_APPROVER" | "RECEIVER_AS_APPROVER" | "BILL_MAKER_AS_DISBURSER";
  action: GovernanceAction;
  actorUserId: string;
  targetDocumentId: string;
  prohibitedRoleCombination: string;
  reason: string;
};

export type DelegationOfAuthorityRecord = {
  delegationId: string;
  delegatorUserId: string;
  delegatorRole: string;
  proxyUserId: string;
  startsAt: string;
  endsAt: string;
  maxApprovalLimitINR: number;
  isActive: boolean;
};

export class EnterpriseGovernanceService {
  /**
   * Enforces strict Segregation of Duties (SoD) across all financial & inventory workflows.
   */
  static checkSegregationOfDuties(input: {
    actorUserId: string;
    action: GovernanceAction;
    targetDocumentId: string;
    creatorUserId?: string;
    inspectorUserId?: string;
    invoicePreparerUserId?: string;
  }): {
    isAllowed: boolean;
    violation?: SegregationOfDutiesViolation;
  } {
    // Rule 1: Creator of a PO cannot approve their own PO
    if (input.action === "APPROVE_PO" && input.creatorUserId === input.actorUserId) {
      return {
        isAllowed: false,
        violation: {
          violationType: "CREATOR_AS_APPROVER",
          action: input.action,
          actorUserId: input.actorUserId,
          targetDocumentId: input.targetDocumentId,
          prohibitedRoleCombination: "Purchase Order Initiator + Approver",
          reason: "An individual cannot approve a purchase commitment they originated.",
        },
      };
    }

    // Rule 2: Physical inspector/receiver of GRN cannot approve payment
    if (input.action === "RELEASE_PAYMENT" && input.inspectorUserId === input.actorUserId) {
      return {
        isAllowed: false,
        violation: {
          violationType: "RECEIVER_AS_APPROVER",
          action: input.action,
          actorUserId: input.actorUserId,
          targetDocumentId: input.targetDocumentId,
          prohibitedRoleCombination: "Goods Inward Inspector + Cash Disburser",
          reason: "Material receiver cannot authorize cash outflow for the same consignment.",
        },
      };
    }

    // Rule 3: Invoice preparer/data-entry clerk cannot disburse payment
    if (input.action === "RELEASE_PAYMENT" && input.invoicePreparerUserId === input.actorUserId) {
      return {
        isAllowed: false,
        violation: {
          violationType: "BILL_MAKER_AS_DISBURSER",
          action: input.action,
          actorUserId: input.actorUserId,
          targetDocumentId: input.targetDocumentId,
          prohibitedRoleCombination: "Invoice Entry Clerk + Bank Payment Signatory",
          reason: "Invoice maker cannot sign off payment voucher without independent verification.",
        },
      };
    }

    return { isAllowed: true };
  }

  /**
   * Evaluates active Delegation of Authority (DoA) for a proxy user.
   */
  static evaluateDelegation(
    delegations: DelegationOfAuthorityRecord[],
    proxyUserId: string,
    transactionAmountINR: number,
    asOfDate = new Date(),
  ): {
    isAuthorizedViaDelegation: boolean;
    delegationRecord?: DelegationOfAuthorityRecord;
    reason?: string;
  } {
    const active = delegations.find((d) => {
      if (!d.isActive || d.proxyUserId !== proxyUserId) return false;
      const start = new Date(d.startsAt).getTime();
      const end = new Date(d.endsAt).getTime();
      const now = asOfDate.getTime();
      return now >= start && now <= end;
    });

    if (!active) {
      return {
        isAuthorizedViaDelegation: false,
        reason: "No active proxy delegation window found for this user.",
      };
    }

    if (transactionAmountINR > active.maxApprovalLimitINR) {
      return {
        isAuthorizedViaDelegation: false,
        delegationRecord: active,
        reason: `Transaction amount (₹${transactionAmountINR}) exceeds delegated proxy ceiling (₹${active.maxApprovalLimitINR}).`,
      };
    }

    return {
      isAuthorizedViaDelegation: true,
      delegationRecord: active,
    };
  }
}
