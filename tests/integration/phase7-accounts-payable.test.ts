import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { db } from "../../src/db/prisma";
import {
  SupplierAdvanceService,
  SupplierFinancialNoteService,
} from "../../src/features/finance/adjustment-service";
import { getFinanceWorkspace } from "../../src/features/finance/finance-queries";
import { SupplierInvoiceService } from "../../src/features/finance/invoice-service";
import { SupplierPaymentService } from "../../src/features/finance/payment-service";
import { queueTallyExport } from "../../src/server/finance/tally-export";
import type { AuthenticatedPrincipal } from "../../src/types/application";

const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && !!process.env.TEST_DATABASE_URL;

type Fixture = Awaited<ReturnType<typeof fixture>>;

function principal(
  user: {
    id: string;
    employeeId: string | null;
    email: string;
    displayName: string;
  },
  role: string,
): AuthenticatedPrincipal {
  return {
    userId: user.id,
    employeeId: user.employeeId,
    email: user.email,
    displayName: user.displayName,
    mustChangePassword: false,
    roleCodes: [role],
    permissions: [
      "invoice.view",
      "invoice.create",
      "invoice.match",
      "invoice.approve",
      "payment.view",
      "payment.create",
      "payment.approve",
      "tax.manage",
      "tally.export",
      "report.export",
    ],
  };
}

async function fixture() {
  const tag = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const actors = {} as Record<string, AuthenticatedPrincipal>;
  for (const roleCode of [
    "ACCOUNTS",
    "ACCOUNTS_ADMIN",
    "MANAGING_DIRECTOR",
    "SYSTEM_ADMINISTRATOR",
  ]) {
    const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
    const employee = await db.employee.create({
      data: {
        employeeCode: `P7-${roleCode}-${tag}`,
        fullName: `${roleCode} ${tag}`,
      },
    });
    const user = await db.user.create({
      data: {
        email: `${roleCode.toLowerCase()}-${tag}@phase7.test`,
        emailNormalized: `${roleCode.toLowerCase()}-${tag}@phase7.test`,
        passwordHash: "integration-test",
        displayName: `${roleCode} ${tag}`,
        employeeId: employee.id,
        roles: { create: { roleId: role.id } },
      },
    });
    actors[roleCode] = principal(user, roleCode);
  }

  const [client, material] = await Promise.all([
    db.client.findFirstOrThrow(),
    db.material.findFirstOrThrow({ include: { defaultUnit: true } }),
  ]);
  const location = await db.inventoryLocation.create({
    data: {
      locationCode: `P7-CENTRAL-${tag}`,
      name: `Phase 7 Central Store ${tag}`,
      type: "CENTRAL_STORE",
    },
  });
  const project = await db.project.create({
    data: {
      projectCode: `P7-${tag}`,
      name: `Phase 7 ${tag}`,
      clientId: client.id,
      location: "Gurugram",
      status: "ACTIVE",
      procurementBudget: "500000",
    },
  });
  const site = await db.site.create({
    data: {
      siteCode: `S-${tag}`,
      name: `Phase 7 Site ${tag}`,
      projectId: project.id,
      location: "Gurugram",
      status: "ACTIVE",
    },
  });
  const supplier = await db.supplier.create({
    data: {
      supplierCode: `P7-SUP-${tag}`,
      legalName: `Phase 7 Supplier ${tag}`,
      city: "Gurugram",
      state: "Haryana",
      isGstRegistered: false,
      accountsApprovedUnregistered: true,
      defaultCreditDays: 30,
    },
  });
  const requirement = await db.materialRequirement.create({
    data: {
      requirementNumber: `P7-MR-${tag}`,
      projectId: project.id,
      siteId: site.id,
      neededBy: new Date("2026-10-15T00:00:00.000Z"),
      purpose: "Phase 7 integration fixture",
      createdById: actors.ACCOUNTS.userId,
      lines: {
        create: {
          materialId: material.id,
          unitId: material.defaultUnitId,
          quantity: "100",
        },
      },
    },
    include: { lines: true },
  });
  const rfq = await db.requestForQuotation.create({
    data: {
      rfqNumber: `P7-RFQ-${tag}`,
      requirementId: requirement.id,
      responseDueDate: new Date("2026-10-20T00:00:00.000Z"),
      createdById: actors.ACCOUNTS.userId,
    },
  });
  const quotation = await db.supplierQuotation.create({
    data: {
      rfqId: rfq.id,
      supplierId: supplier.id,
      quoteReference: `P7-Q-${tag}`,
      quoteDate: new Date("2026-09-01T00:00:00.000Z"),
      validUntil: new Date("2026-12-31T00:00:00.000Z"),
      offeredDeliveryDate: new Date("2026-10-01T00:00:00.000Z"),
      paymentTerms: "30 days",
      subtotal: "10000",
      gstRate: "18",
      gstAmount: "1800",
      freightAmount: "0",
      landedTotal: "11800",
      recordedById: actors.ACCOUNTS.userId,
      lines: {
        create: {
          requirementLineId: requirement.lines[0].id,
          unitId: material.defaultUnitId,
          quantity: "100",
          unitPrice: "100",
          lineSubtotal: "10000",
        },
      },
    },
    include: { lines: true },
  });
  const po = await db.purchaseOrder.create({
    data: {
      poNumber: `P7-PO-${tag}`,
      rfqId: rfq.id,
      quotationId: quotation.id,
      supplierId: supplier.id,
      status: "ACCEPTED",
      subtotal: "10000",
      gstRate: "18",
      gstAmount: "1800",
      freightAmount: "0",
      totalAmount: "11800",
      expectedDeliveryDate: new Date("2026-10-01T00:00:00.000Z"),
      paymentTerms: "30 days",
      creditDays: 30,
      permitsAdvance: true,
      maximumAdvancePercent: "50",
      createdById: actors.ACCOUNTS.userId,
      issuedById: actors.ACCOUNTS.userId,
      issuedAt: new Date("2026-09-01T00:00:00.000Z"),
      supplierAcceptedAt: new Date("2026-09-02T00:00:00.000Z"),
      supplierAcceptanceReference: `ACCEPT-${tag}`,
      acceptedRecordedById: actors.ACCOUNTS.userId,
      lines: {
        create: {
          quotationLineId: quotation.lines[0].id,
          requirementLineId: requirement.lines[0].id,
          unitId: material.defaultUnitId,
          quantity: "100",
          unitPrice: "100",
          lineSubtotal: "10000",
        },
      },
    },
    include: { lines: true },
  });
  const grn = await db.goodsReceipt.create({
    data: {
      grnNumber: `P7-GRN-${tag}`,
      purchaseOrderId: po.id,
      locationId: location.id,
      supplierDeliveryNote: `P7-DN-${tag}`,
      receivedAt: new Date("2026-09-15T00:00:00.000Z"),
      createdById: actors.ACCOUNTS.userId,
      lines: {
        create: {
          purchaseOrderLineId: po.lines[0].id,
          materialId: material.id,
          unitId: material.defaultUnitId,
          orderedQuantity: "100",
          receivedQuantity: "100",
          acceptedQuantity: "100",
        },
      },
    },
    include: { lines: true },
  });
  const now = new Date();
  await db.goodsReceipt.update({
    where: { id: grn.id },
    data: {
      status: "PHYSICALLY_VERIFIED",
      verifiedById: actors.ACCOUNTS.userId,
      verifiedAt: now,
    },
  });
  await db.goodsReceipt.update({
    where: { id: grn.id },
    data: { status: "PENDING_PM_APPROVAL" },
  });
  await db.goodsReceipt.update({
    where: { id: grn.id },
    data: {
      status: "POSTED",
      approvedById: actors.MANAGING_DIRECTOR.userId,
      approvedAt: now,
      postedById: actors.ACCOUNTS.userId,
      postedAt: now,
    },
  });

  const gstRule = await db.taxRuleVersion.create({
    data: {
      code: `GST18-${tag}`,
      kind: "GST",
      rate: "18",
      effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
      settings: { caApprovalReference: `CA-${tag}` },
      approvedById: actors.ACCOUNTS_ADMIN.userId,
      createdById: actors.ACCOUNTS_ADMIN.userId,
    },
  });
  const bank = await db.companyBankAccount.create({
    data: {
      accountName: `KDIPL ${tag}`,
      bankName: `Phase 7 Bank ${tag}`,
      maskedAccount: `XXXX${tag.slice(-4)}`,
      ifsc: "HDFC0000001",
    },
  });
  const file = async (documentType: string) =>
    db.fileRecord.create({
      data: {
        filename: `${documentType.toLowerCase()}-${tag}.pdf`,
        mimeType: "application/pdf",
        size: BigInt(128),
        storageKey: `phase7/${tag}/${documentType}/${randomUUID()}.pdf`,
        storageProvider: "LOCAL",
        documentType,
        uploadedById: actors.ACCOUNTS.userId,
        scanStatus: "CLEAN",
        scanProvider: "TEST",
        scanReference: "integration",
        scannedAt: now,
        retentionUntil: new Date("2036-03-31T00:00:00.000Z"),
      },
    });
  const [invoiceDocument, paymentProof, advanceEvidence, creditDocument] =
    await Promise.all([
      file("SUPPLIER_INVOICE"),
      file("PAYMENT_PROOF"),
      file("ADVANCE_PAYMENT_EVIDENCE"),
      file("CREDIT_NOTE"),
    ]);

  return {
    tag,
    actors,
    project,
    supplier,
    po,
    grn,
    gstRule,
    bank,
    invoiceDocument,
    paymentProof,
    advanceEvidence,
    creditDocument,
  };
}

function draftInput(
  f: Fixture,
  suffix: string,
  quantity = "10",
  unitPrice = "100",
) {
  return {
    supplierId: f.supplier.id,
    supplierInvoiceNumber: `SUP-${f.tag}-${suffix}`,
    invoiceDate: "2026-09-16",
    placeOfSupply: "Haryana",
    purchaseOrderIds: [f.po.id],
    goodsReceiptIds: [f.grn.id],
    creditDays: 30,
    creditTermsSource: "PURCHASE_ORDER" as const,
    roundOff: "0",
    remarks: "Phase 7 integration invoice",
    documentId: f.invoiceDocument.id,
    lines: [
      {
        purchaseOrderLineId: f.po.lines[0].id,
        hsnSac: "7214",
        quantity,
        unitPrice,
        discountBeforeTax: "0",
        discountAfterTax: "0",
        freightAmount: "0",
        freightTaxable: false,
        taxRuleVersionId: f.gstRule.id,
        reverseCharge: false,
        inputTaxCreditEligible: true,
        allocations: [{ goodsReceiptLineId: f.grn.lines[0].id, quantity }],
      },
    ],
  };
}

async function approveInvoice(f: Fixture, suffix: string, quantity = "10") {
  const created = await SupplierInvoiceService.createDraft(
    f.actors.ACCOUNTS,
    draftInput(f, suffix, quantity),
  );
  await SupplierInvoiceService.command(f.actors.ACCOUNTS, {
    invoiceId: created.id,
    command: "SUBMIT",
  });
  await SupplierInvoiceService.command(f.actors.ACCOUNTS, {
    invoiceId: created.id,
    command: "RUN_MATCH",
  });
  await SupplierInvoiceService.command(f.actors.ACCOUNTS, {
    invoiceId: created.id,
    command: "VERIFY",
  });
  await SupplierInvoiceService.command(f.actors.ACCOUNTS, {
    invoiceId: created.id,
    command: "REQUEST_APPROVAL",
  });
  await SupplierInvoiceService.command(f.actors.MANAGING_DIRECTOR, {
    invoiceId: created.id,
    command: "APPROVE",
    reason: "Approved after independent financial verification",
  });
  return db.supplierInvoice.findUniqueOrThrow({ where: { id: created.id } });
}

describe.skipIf(!enabled)("Phase 7 accounts payable", () => {
  afterAll(async () => db.$disconnect());

  it("blocks normalized duplicate invoices and business actions by System Administrators", async () => {
    const f = await fixture();
    await SupplierInvoiceService.createDraft(
      f.actors.ACCOUNTS,
      draftInput(f, "DUP-01"),
    );
    const duplicate = draftInput(f, "DUP-01");
    duplicate.supplierInvoiceNumber = ` sup ${f.tag} dup-01 `;
    await expect(
      SupplierInvoiceService.createDraft(f.actors.ACCOUNTS, duplicate),
    ).rejects.toThrow();
    await expect(
      SupplierInvoiceService.createDraft(
        f.actors.SYSTEM_ADMINISTRATOR,
        draftInput(f, "SYSADMIN"),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const workspace = await getFinanceWorkspace(f.actors.ACCOUNTS);
    expect(
      workspace.projects.some((project) => project.id === f.project.id),
    ).toBe(true);
  });

  it("records mismatches, requires reasoned acceptance, and serializes concurrent GRN allocation", async () => {
    const f = await fixture();
    const mismatch = await SupplierInvoiceService.createDraft(
      f.actors.ACCOUNTS,
      draftInput(f, "MISMATCH", "10", "101"),
    );
    await SupplierInvoiceService.command(f.actors.ACCOUNTS, {
      invoiceId: mismatch.id,
      command: "SUBMIT",
    });
    await expect(
      SupplierInvoiceService.command(f.actors.ACCOUNTS, {
        invoiceId: mismatch.id,
        command: "RUN_MATCH",
      }),
    ).resolves.toMatchObject({ status: "DISPUTED" });
    const mismatches = await db.invoiceMismatch.findMany({
      where: { invoiceId: mismatch.id, status: "OPEN" },
    });
    expect(mismatches.length).toBeGreaterThan(0);
    for (const item of mismatches)
      await SupplierInvoiceService.command(f.actors.ACCOUNTS, {
        invoiceId: mismatch.id,
        command: "ACCEPT_MISMATCH",
        mismatchId: item.id,
        reason: "Accounts accepted documented supplier variance",
      });
    await SupplierInvoiceService.command(f.actors.ACCOUNTS, {
      invoiceId: mismatch.id,
      command: "RESUBMIT",
      reason: "All recorded differences were reviewed",
    });
    await expect(
      SupplierInvoiceService.command(f.actors.ACCOUNTS, {
        invoiceId: mismatch.id,
        command: "RUN_MATCH",
      }),
    ).resolves.toMatchObject({ status: "MATCHED" });

    const [first, second] = await Promise.all([
      SupplierInvoiceService.createDraft(
        f.actors.ACCOUNTS,
        draftInput(f, "CONCURRENT-A", "60"),
      ),
      SupplierInvoiceService.createDraft(
        f.actors.ACCOUNTS,
        draftInput(f, "CONCURRENT-B", "50"),
      ),
    ]);
    await Promise.all(
      [first, second].map((invoice) =>
        SupplierInvoiceService.command(f.actors.ACCOUNTS, {
          invoiceId: invoice.id,
          command: "SUBMIT",
        }),
      ),
    );
    const results = await Promise.all(
      [first, second].map((invoice) =>
        SupplierInvoiceService.command(f.actors.ACCOUNTS, {
          invoiceId: invoice.id,
          command: "RUN_MATCH",
        }),
      ),
    );
    expect(results.some((result) => result.status === "DISPUTED")).toBe(true);
  });

  it("enforces independent approval and locks concurrent payments against overpayment", async () => {
    const f = await fixture();
    const invoice = await approveInvoice(f, "PAY-CONCURRENT");
    const paymentInput = (reference: string) => ({
      invoiceId: invoice.id,
      method: "NEFT" as const,
      amount: invoice.invoiceTotal.toString(),
      paymentDate: "2026-09-16",
      bankAccountId: f.bank.id,
      referenceNumber: reference,
      proofDocumentId: f.paymentProof.id,
      reason: "Supplier settlement after approval",
    });
    const [first, second] = await Promise.all([
      SupplierPaymentService.prepare(
        f.actors.ACCOUNTS,
        paymentInput(`UTR-${f.tag}-A`),
      ),
      SupplierPaymentService.prepare(
        f.actors.ACCOUNTS,
        paymentInput(`UTR-${f.tag}-B`),
      ),
    ]);
    const results = await Promise.allSettled([
      SupplierPaymentService.decide(
        f.actors.MANAGING_DIRECTOR,
        first.id,
        "APPROVE",
        "Approved supplier settlement",
      ),
      SupplierPaymentService.decide(
        f.actors.MANAGING_DIRECTOR,
        second.id,
        "APPROVE",
        "Approved supplier settlement",
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const posted = await db.supplierInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(posted.status).toBe("PAID");
    expect(posted.paidAmount.toString()).toBe(invoice.invoiceTotal.toString());
  });

  it("preserves partial/full balances and posts an approved payment reversal", async () => {
    const f = await fixture();
    const invoice = await approveInvoice(f, "PAY-STATES");
    const prepare = (amount: string, reference: string) =>
      SupplierPaymentService.prepare(f.actors.ACCOUNTS, {
        invoiceId: invoice.id,
        method: "NEFT",
        amount,
        paymentDate: "2026-09-16",
        bankAccountId: f.bank.id,
        referenceNumber: reference,
        proofDocumentId: f.paymentProof.id,
        reason: "Approved invoice payment",
      });
    const partial = await prepare("500", `UTR-${f.tag}-PART`);
    await SupplierPaymentService.decide(
      f.actors.MANAGING_DIRECTOR,
      partial.id,
      "APPROVE",
      "Approved partial payment",
    );
    expect(
      (
        await db.supplierInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
        })
      ).status,
    ).toBe("PARTIALLY_PAID");
    const final = await prepare("680", `UTR-${f.tag}-FINAL`);
    await SupplierPaymentService.decide(
      f.actors.MANAGING_DIRECTOR,
      final.id,
      "APPROVE",
      "Approved final payment",
    );
    expect(
      (
        await db.supplierInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
        })
      ).status,
    ).toBe("PAID");
    const reversal = await SupplierPaymentService.prepareReversal(
      f.actors.ACCOUNTS,
      final.id,
      f.paymentProof.id,
      "Incorrect UTR requires reversal and corrected payment",
    );
    await SupplierPaymentService.decide(
      f.actors.MANAGING_DIRECTOR,
      reversal.id,
      "APPROVE",
      "Approved payment reversal",
    );
    const restored = await db.supplierInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(restored.status).toBe("PARTIALLY_PAID");
    expect(restored.paidAmount.toString()).toBe("500");
  });

  it("tracks advances, applications, refunds, note tax impact, and unapplied credit", async () => {
    const f = await fixture();
    const invoice = await approveInvoice(f, "ADJUSTMENTS");
    const advance = await SupplierAdvanceService.create(f.actors.ACCOUNTS, {
      purchaseOrderId: f.po.id,
      advancePercent: "20",
      amount: "2000",
      method: "NEFT",
      referenceNumber: `ADV-${f.tag}`,
      evidenceDocumentId: f.advanceEvidence.id,
      reason: "Advance permitted by accepted purchase order",
    });
    await SupplierAdvanceService.decide(
      f.actors.MANAGING_DIRECTOR,
      advance.id,
      "APPROVE",
      "Approved within purchase-order terms",
    );
    await SupplierAdvanceService.apply(
      f.actors.ACCOUNTS,
      advance.id,
      invoice.id,
      "500",
      "Applied against finalized supplier invoice",
    );
    await SupplierAdvanceService.settle(
      f.actors.ACCOUNTS,
      advance.id,
      "REFUND",
      f.paymentProof.id,
      "Supplier returned the remaining unapplied advance",
    );
    const settledAdvance = await db.supplierAdvance.findUniqueOrThrow({
      where: { id: advance.id },
    });
    expect(settledAdvance.status).toBe("REFUNDED");
    expect(settledAdvance.refundedAmount.toString()).toBe("1500");

    const invoiceLine = await db.supplierInvoiceLine.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    const note = await SupplierFinancialNoteService.create(f.actors.ACCOUNTS, {
      invoiceId: invoice.id,
      noteType: "CREDIT",
      reasonCode: "PRICE_CORRECTION",
      reason: "Supplier issued credit exceeding current payable",
      documentId: f.creditDocument.id,
      lines: [
        {
          invoiceLineId: invoiceLine.id,
          hsnSac: invoiceLine.hsnSac,
          quantity: "10",
          taxableValue: "1000",
          taxRuleVersionId: f.gstRule.id,
        },
      ],
    });
    await SupplierFinancialNoteService.submit(
      f.actors.ACCOUNTS,
      note.id,
      "Accounts completed note review",
    );
    await SupplierFinancialNoteService.decide(
      f.actors.MANAGING_DIRECTOR,
      note.id,
      "APPROVE",
      "Approved supplier credit note",
    );
    const approvedNote = await db.supplierFinancialNote.findUniqueOrThrow({
      where: { id: note.id },
    });
    expect(approvedNote.taxAmount.toString()).toBe("180");
    expect(
      approvedNote.totalAmount.minus(approvedNote.appliedAmount).gt(0),
    ).toBe(true);
  });

  it("enforces immutable financial records and idempotent Tally export payloads", async () => {
    const f = await fixture();
    const invoice = await approveInvoice(f, "IMMUTABLE");
    const line = await db.supplierInvoiceLine.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    await expect(
      db.supplierInvoiceLine.update({
        where: { id: line.id },
        data: { quantity: "11" },
      }),
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.taxRuleVersion.update({
        where: { id: f.gstRule.id },
        data: { rate: "12" },
      }),
    ).rejects.toThrow(/append-only/i);

    const supplier = await db.supplier.findUniqueOrThrow({
      where: { id: invoice.supplierId },
    });
    await db.$transaction(async (tx) => {
      await queueTallyExport(tx, f.actors.ACCOUNTS, {
        entityType: "SUPPLIER_INVOICE",
        entityId: invoice.id,
        number: invoice.internalNumber,
        date: invoice.invoiceDate,
        supplier: supplier.legalName,
        amount: invoice.invoiceTotal.toString(),
      });
    });
    expect(
      await db.tallyExportEvent.count({
        where: { entityType: "SUPPLIER_INVOICE", entityId: invoice.id },
      }),
    ).toBe(1);
    const event = await db.tallyExportEvent.findFirstOrThrow({
      where: { entityType: "SUPPLIER_INVOICE", entityId: invoice.id },
    });
    await expect(
      db.tallyExportEvent.update({
        where: { id: event.id },
        data: { payload: "tampered" },
      }),
    ).rejects.toThrow(/immutable/i);
  });
});
