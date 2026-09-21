export type TallyVoucherExportPayload = {
  voucherType: "Payment" | "Receipt" | "Journal" | "Purchase";
  voucherNumber: string;
  date: string; // YYYYMMDD
  narration: string;
  ledgerEntries: {
    ledgerName: string;
    isDeemedPositive: boolean; // true = Debit, false = Credit
    amount: number;
  }[];
};

export type BankingPaymentAdviceBatch = {
  batchId: string;
  corporateAccountNumber: string;
  batchTotalAmount: number;
  totalTransactionsCount: number;
  transactions: {
    instructionId: string;
    beneficiaryName: string;
    beneficiaryAccountNumber: string;
    beneficiaryIfsc: string;
    amount: number;
    paymentMode: "NEFT" | "RTGS";
    vendorEmail?: string;
  }[];
};

export type Gstr2bMatchingItem = {
  supplierGstin: string;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  taxableValue: number;
  integratedTax: number;
  centralTax: number;
  stateTax: number;
  portalStatus: "AVAILABLE" | "NOT_IN_PORTAL" | "MISMATCH";
};

export type NotificationChannel = "EMAIL" | "SMS" | "WHATSAPP";

export type OutboundNotificationMessage = {
  id: string;
  channel: NotificationChannel;
  recipient: string; // email address or phone with country code
  templateId: string;
  subject?: string;
  variables: Record<string, string>;
  status: "QUEUED" | "SENT" | "FAILED";
  dispatchedAt?: string;
};

export class EnterpriseIntegrationHub {
  /**
   * Generates standard Tally XML payload for journal and payment vouchers.
   */
  static generateTallyXml(payload: TallyVoucherExportPayload): string {
    const lines = payload.ledgerEntries
      .map(
        (entry) => `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${entry.ledgerName}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${entry.isDeemedPositive ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
        <AMOUNT>${entry.isDeemedPositive ? -entry.amount : entry.amount}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`,
      )
      .join("");

    return `
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
          <VOUCHER VCHTYPE="${payload.voucherType}" ACTION="Create">
            <DATE>${payload.date}</DATE>
            <VOUCHERTYPENAME>${payload.voucherType}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${payload.voucherNumber}</VOUCHERNUMBER>
            <NARRATION>${payload.narration}</NARRATION>${lines}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`.trim();
  }

  /**
   * Generates standardized Banking NEFT/RTGS payment advice batch file (CSV / Pipe-delimited).
   */
  static generateBankPaymentBatchFile(
    batch: BankingPaymentAdviceBatch,
  ): string {
    const header =
      "PaymentMode|CorporateAccount|BeneficiaryName|BeneficiaryAccount|BeneficiaryIFSC|Amount|TxnRef";
    const rows = batch.transactions.map((tx) =>
      [
        tx.paymentMode,
        batch.corporateAccountNumber,
        tx.beneficiaryName,
        tx.beneficiaryAccountNumber,
        tx.beneficiaryIfsc,
        tx.amount.toFixed(2),
        tx.instructionId,
      ].join("|"),
    );
    return [header, ...rows].join("\n");
  }

  /**
   * Cross-checks internal ERP invoices against GSTR-2B portal data to flag ITC mismatches.
   */
  static reconcileGstr2bInvoices(
    erpInvoices: {
      supplierGstin: string;
      invoiceNumber: string;
      taxableValue: number;
      taxAmount: number;
    }[],
    portalInvoices: Gstr2bMatchingItem[],
  ): {
    matchedCount: number;
    mismatchCount: number;
    missingInPortalCount: number;
    eligibleItcTotal: number;
  } {
    let matchedCount = 0;
    let mismatchCount = 0;
    let missingInPortalCount = 0;
    let eligibleItcTotal = 0;

    for (const erp of erpInvoices) {
      const match = portalInvoices.find(
        (p) =>
          p.supplierGstin.toUpperCase() === erp.supplierGstin.toUpperCase() &&
          p.supplierInvoiceNumber.toUpperCase() ===
            erp.invoiceNumber.toUpperCase(),
      );

      if (!match) {
        missingInPortalCount++;
      } else {
        const portalTaxTotal =
          match.integratedTax + match.centralTax + match.stateTax;
        const taxDiff = Math.abs(portalTaxTotal - erp.taxAmount);
        const valDiff = Math.abs(match.taxableValue - erp.taxableValue);

        if (taxDiff < 1.0 && valDiff < 1.0) {
          matchedCount++;
          eligibleItcTotal += erp.taxAmount;
        } else {
          mismatchCount++;
        }
      }
    }

    return {
      matchedCount,
      mismatchCount,
      missingInPortalCount,
      eligibleItcTotal,
    };
  }
}
