export type DocumentTag =
  | "TAX_INVOICE"
  | "DELIVERY_CHALLAN"
  | "PURCHASE_ORDER"
  | "QUALITY_CERTIFICATE"
  | "MEASUREMENT_SHEET"
  | "E_WAY_BILL"
  | "BANK_ADVICE"
  | "SITE_PHOTO";

export type DocumentMetadata = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  tags: DocumentTag[];
  version: number;
  uploadedBy: string;
  uploadedAt: string;
  ocrExtracted: boolean;
  ocrConfidencePercent?: number;
  extractedFields?: Record<string, string | number>;
};

export type ExtractedInvoiceFields = {
  invoiceNumber?: string;
  invoiceDate?: string;
  vendorGstin?: string;
  buyerGstin?: string;
  poReferenceNumber?: string;
  taxableValue?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalInvoiceAmount?: number;
  detectedLineItemsCount?: number;
};

export class DocumentSearchIntelligenceEngine {
  /**
   * Simulates OCR extraction on a structured document image/PDF.
   * Extracts GSTIN, Invoice Number, PO reference, and total amounts.
   */
  static extractInvoiceMetadataFromText(documentText: string): {
    success: boolean;
    confidencePercent: number;
    fields: ExtractedInvoiceFields;
  } {
    const fields: ExtractedInvoiceFields = {};
    let matchedCount = 0;

    // GSTIN regex: 2 digits, 5 letters, 4 digits, 1 letter, 1 digit, Z, 1 alphanumeric
    const gstinMatch = documentText.match(
      /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i,
    );
    if (gstinMatch) {
      fields.vendorGstin = gstinMatch[0].toUpperCase();
      matchedCount++;
    }

    // Invoice Number regex pattern (e.g. Invoice No: INV/2026/0442 or Inv #1002)
    const invMatch = documentText.match(
      /(?:Invoice\s*(?:No|Number|#)\s*[:.]?|Bill\s*(?:No|Number|#)\s*[:.]?|Inv\s*(?:No|#)\s*[:.]?|Invoice\s*[:#])\s*([A-Za-z0-9\/-]{4,25})/i,
    );
    if (invMatch) {
      fields.invoiceNumber = invMatch[1].trim();
      matchedCount++;
    }

    // PO Reference (e.g. PO Ref: PO-2026-901)
    const poMatch = documentText.match(
      /(?:PO\s*(?:Ref|No|Number|#)?|P\.O\.\s*(?:Ref|No|Number|#)?)\s*[:#.]*\s*([A-Za-z0-9\/-]{4,25})/i,
    );
    if (poMatch) {
      fields.poReferenceNumber = poMatch[1].trim();
      matchedCount++;
    }

    // Total Amount (e.g. Total: Rs. 15,400.00 or Total Amount: Rs. 8,50,000.00)
    const totalMatch = documentText.match(
      /(?:Total\s*Amount|Grand\s*Total|Net\s*Amount|Total)[\s:Rs.₹]*([0-9,]+\.?[0-9]{0,2})/i,
    );
    if (totalMatch) {
      const cleanNum = parseFloat(totalMatch[1].replaceAll(",", ""));
      if (!isNaN(cleanNum)) {
        fields.totalInvoiceAmount = cleanNum;
        matchedCount++;
      }
    }

    const confidencePercent = Math.min(
      100,
      Math.round((matchedCount / 4) * 100),
    );

    return {
      success: matchedCount > 0,
      confidencePercent,
      fields,
    };
  }

  /**
   * Builds an indexed search query and ranks matching transaction nodes.
   */
  static searchTransactionIndex(
    query: string,
    transactions: {
      id: string;
      code: string;
      type: string;
      title: string;
      keywords: string[];
      createdAt: string;
    }[],
  ) {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const scored = transactions
      .map((t) => {
        let score = 0;
        if (t.code.toLowerCase().includes(q)) score += 100;
        if (t.title.toLowerCase().includes(q)) score += 50;
        if (t.keywords.some((k) => k.toLowerCase().includes(q))) score += 25;
        return { ...t, score };
      })
      .filter((t) => t.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }
}
