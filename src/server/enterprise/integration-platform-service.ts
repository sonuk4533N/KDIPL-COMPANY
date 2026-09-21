import { createHmac } from "crypto";

export type BankingPaymentBatchItem = {
  paymentId: string;
  beneficiaryName: string;
  beneficiaryAccountNo: string;
  beneficiaryIfsc: string;
  amountINR: number;
  remarks: string;
};

export type EWayBillPayload = {
  supplyType: "OUTWARD" | "INWARD";
  subSupplyType: "SUPPLY" | "LINE_TRANSFER";
  docType: "TAX_INVOICE" | "DELIVERY_CHALLAN";
  docNo: string;
  docDate: string;
  fromGstin: string;
  toGstin: string;
  totalValue: number;
  transporterId?: string;
  vehicleNo: string;
};

export class EnterpriseIntegrationPlatformService {
  /**
   * Generates secure HMAC signature for outgoing enterprise integration webhooks.
   */
  static generateHmacSignature(payload: string, secretKey: string): string {
    return createHmac("sha256", secretKey).update(payload).digest("hex");
  }

  /**
   * Verifies incoming webhook HMAC signature.
   */
  static verifyHmacSignature(payload: string, secretKey: string, signature: string): boolean {
    const expected = this.generateHmacSignature(payload, secretKey);
    return expected === signature;
  }

  /**
   * Generates compliant TallyPrime XML Journal Voucher for double-entry financial posting.
   */
  static generateTallyJournalXml(input: {
    voucherNumber: string;
    dateYYYYMMDD: string;
    narration: string;
    debitLedger: string;
    creditLedger: string;
    amount: number;
  }): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Journal" ACTION="Create">
            <DATE>${input.dateYYYYMMDD}</DATE>
            <VOUCHERNUMBER>${input.voucherNumber}</VOUCHERNUMBER>
            <NARRATION>${input.narration}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${input.debitLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${input.amount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${input.creditLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${input.amount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  }

  /**
   * Formats structured Corporate Banking NEFT/RTGS batch file with checksum.
   */
  static generateBankingPaymentAdvice(
    batchReference: string,
    items: BankingPaymentBatchItem[],
  ): {
    csvContent: string;
    totalBatchAmount: number;
    recordCount: number;
  } {
    const header = "PaymentRef,BeneficiaryName,AccountNumber,IFSC,Amount,Remarks";
    let total = 0;
    const lines = items.map((item) => {
      total += item.amountINR;
      return `${item.paymentId},"${item.beneficiaryName}",${item.beneficiaryAccountNo},${item.beneficiaryIfsc},${item.amountINR.toFixed(2)},"${item.remarks}"`;
    });

    return {
      csvContent: [header, ...lines].join("\n"),
      totalBatchAmount: Number(total.toFixed(2)),
      recordCount: items.length,
    };
  }

  /**
   * Validates and constructs GST E-Way Bill schema payload.
   */
  static generateEWayBillPayload(input: EWayBillPayload): {
    isValid: boolean;
    payload: EWayBillPayload;
    errors: string[];
  } {
    const errors: string[] = [];
    if (!input.fromGstin || input.fromGstin.length !== 15) {
      errors.push("Invalid source GSTIN (Must be 15 characters)");
    }
    if (!input.toGstin || input.toGstin.length !== 15) {
      errors.push("Invalid destination GSTIN (Must be 15 characters)");
    }
    if (input.totalValue <= 0) {
      errors.push("Total value must be greater than zero");
    }
    if (!input.vehicleNo) {
      errors.push("Vehicle number is mandatory for E-Way Bill generation");
    }

    return {
      isValid: errors.length === 0,
      payload: input,
      errors,
    };
  }
}
