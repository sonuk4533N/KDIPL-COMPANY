import "server-only";

import { db } from "@/db/prisma";
import { hasPermission } from "@/server/authorization/authorization";
import type { AuthenticatedPrincipal } from "@/types/application";
import { getReportingScope } from "./reporting-scope";

export type TraceNode = {
  id: string;
  stage: string;
  number: string;
  status: string;
  timestamp: Date;
  actorId?: string | null;
  actor?: string;
  reason?: string | null;
  detail?: string;
  href?: string;
};

async function purchaseOrderId(kind: string, id: string) {
  if (kind === "purchase-order") return id;
  if (kind === "goods-receipt")
    return (
      await db.goodsReceipt.findUnique({
        where: { id },
        select: { purchaseOrderId: true },
      })
    )?.purchaseOrderId;
  if (kind === "stock-transaction")
    return (
      await db.stockTransaction.findUnique({
        where: { id },
        select: {
          goodsReceiptLine: {
            select: { goodsReceipt: { select: { purchaseOrderId: true } } },
          },
        },
      })
    )?.goodsReceiptLine?.goodsReceipt.purchaseOrderId;
  const invoiceId =
    kind === "invoice"
      ? id
      : kind === "payment"
        ? (
            await db.supplierPayment.findUnique({
              where: { id },
              select: { invoiceId: true },
            })
          )?.invoiceId
        : kind === "note"
          ? (
              await db.supplierFinancialNote.findUnique({
                where: { id },
                select: { invoiceId: true },
              })
            )?.invoiceId
          : undefined;
  return invoiceId
    ? (
        await db.supplierInvoicePurchaseOrder.findFirst({
          where: { invoiceId },
          select: { purchaseOrderId: true },
        })
      )?.purchaseOrderId
    : undefined;
}

export async function traceabilityChain(
  principal: AuthenticatedPrincipal,
  kind: string,
  id: string,
) {
  if (kind === "movement") {
    if (!hasPermission(principal, "inventory.view")) return null;
    const movement = await db.customerStockMovement.findUnique({
      where: { id },
      include: {
        source: true,
        destination: true,
        material: true,
        postings: { include: { transaction: true } },
        returns: true,
        corrections: true,
      },
    });
    if (!movement) return null;
    const scope = await getReportingScope(principal);
    if (
      scope.locationIds &&
      !scope.locationIds.includes(movement.sourceLocationId)
    )
      return null;
    const nodes: TraceNode[] = [
      {
        id: movement.id,
        stage: movement.kind.replaceAll("_", " "),
        number: movement.number,
        status: movement.status,
        timestamp: movement.createdAt,
        actorId: movement.createdById,
        reason: movement.reason,
        detail: `${movement.quantity} · ${movement.source.name} → ${movement.destination?.name ?? movement.disposition}`,
      },
      ...movement.postings.map((posting) => ({
        id: posting.transaction.id,
        stage: "Stock ledger posting",
        number: posting.transaction.transactionNumber,
        status: posting.leg,
        timestamp: posting.transaction.createdAt,
        actorId: posting.transaction.createdById,
        reason: posting.transaction.reason,
        detail: posting.transaction.quantity.toString(),
      })),
      ...movement.returns.map((row) => ({
        id: row.id,
        stage: "Unused return",
        number: row.number,
        status: row.status,
        timestamp: row.createdAt,
        actorId: row.createdById,
        reason: row.reason,
      })),
      ...movement.corrections.map((row) => ({
        id: row.id,
        stage: "Correction",
        number: row.number,
        status: row.status,
        timestamp: row.createdAt,
        actorId: row.createdById,
        reason: row.reason,
      })),
    ];
    const actorIds = [
      ...new Set(
        nodes
          .map((node) => node.actorId)
          .filter((actor): actor is string => Boolean(actor)),
      ),
    ];
    const actors = await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, displayName: true },
    });
    const actorMap = new Map(
      actors.map((actor) => [actor.id, actor.displayName]),
    );
    return {
      title: movement.number,
      context: `${movement.material.name} · ${movement.source.name}`,
      nodes: nodes.map((node) => ({
        ...node,
        actor: node.actorId
          ? (actorMap.get(node.actorId) ?? "Authorized user")
          : "System",
      })),
    };
  }
  const poId = await purchaseOrderId(kind, id);
  if (
    !poId ||
    (!hasPermission(principal, "purchase.view") &&
      !hasPermission(principal, "invoice.view") &&
      !hasPermission(principal, "inventory.view"))
  )
    return null;
  const po = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      supplier: true,
      rfq: {
        include: {
          requirement: {
            include: { project: true, site: true, workflowEvents: true },
          },
          quotations: true,
          workflowEvents: true,
        },
      },
      amendments: true,
      goodsReceipts: {
        include: {
          lines: { include: { exceptions: true, stockTransactions: true } },
          documents: true,
        },
      },
    },
  });
  if (!po) return null;
  const scope = await getReportingScope(principal);
  if (
    scope.projectIds &&
    !scope.projectIds.includes(po.rfq.requirement.projectId)
  )
    return null;
  const nodes: TraceNode[] = [];
  const requirement = po.rfq.requirement;
  if (hasPermission(principal, "material_requirement.view")) {
    nodes.push({
      id: requirement.id,
      stage: "Material requirement",
      number: requirement.requirementNumber,
      status: requirement.status,
      timestamp: requirement.createdAt,
      actorId: requirement.createdById,
      reason: requirement.purpose,
      href: `/requirements/${requirement.id}`,
    });
    nodes.push(
      ...requirement.workflowEvents.map((event) => ({
        id: event.id,
        stage: `Requirement ${event.action.toLowerCase()}`,
        number: requirement.requirementNumber,
        status: event.toStatus,
        timestamp: event.createdAt,
        actorId: event.actorUserId,
        reason: event.reason,
      })),
    );
  }
  if (hasPermission(principal, "purchase.view")) {
    nodes.push({
      id: po.rfq.id,
      stage: "RFQ",
      number: po.rfq.rfqNumber,
      status: po.rfq.status,
      timestamp: po.rfq.createdAt,
      actorId: po.rfq.createdById,
      href: `/procurement/rfqs/${po.rfq.id}`,
    });
    nodes.push(
      ...po.rfq.quotations.map((quote) => ({
        id: quote.id,
        stage:
          quote.id === po.rfq.recommendedQuotationId
            ? "Recommended quotation"
            : "Quotation",
        number: quote.quoteReference,
        status: quote.id === po.quotationId ? "SELECTED" : "RECORDED",
        timestamp: quote.createdAt,
        actorId: quote.recordedById,
        detail: `Landed value ₹${quote.landedTotal.toString()}`,
      })),
    );
    nodes.push({
      id: po.id,
      stage: "Purchase order",
      number: po.poNumber,
      status: po.status,
      timestamp: po.createdAt,
      actorId: po.createdById,
      detail: `${po.supplier.legalName} · ₹${po.totalAmount.toString()}`,
    });
    nodes.push(
      ...po.amendments.map((amendment) => ({
        id: amendment.id,
        stage: `PO amendment v${amendment.version}`,
        number: po.poNumber,
        status: amendment.status,
        timestamp: amendment.createdAt,
        actorId: amendment.createdById,
        reason: amendment.reason,
      })),
    );
  }
  if (hasPermission(principal, "inventory.view"))
    for (const receipt of po.goodsReceipts) {
      nodes.push({
        id: receipt.id,
        stage: "Goods receipt",
        number: receipt.grnNumber,
        status: receipt.status,
        timestamp: receipt.postedAt ?? receipt.createdAt,
        actorId: receipt.postedById ?? receipt.createdById,
        reason: receipt.notes,
        detail: `${receipt.documents.length} related documents`,
      });
      for (const line of receipt.lines) {
        nodes.push(
          ...line.exceptions.map((exception) => ({
            id: exception.id,
            stage: `${exception.type.toLowerCase()} exception`,
            number: receipt.grnNumber,
            status: exception.status,
            timestamp: exception.createdAt,
            reason: exception.reason,
            detail: `Quantity ${exception.quantity}`,
          })),
        );
        nodes.push(
          ...line.stockTransactions.map((transaction) => ({
            id: transaction.id,
            stage: "Stock ledger",
            number: transaction.transactionNumber,
            status: transaction.type,
            timestamp: transaction.createdAt,
            actorId: transaction.createdById,
            reason: transaction.reason,
            detail: `Quantity ${transaction.quantity}`,
          })),
        );
      }
    }
  if (hasPermission(principal, "invoice.view")) {
    const links = await db.supplierInvoicePurchaseOrder.findMany({
      where: { purchaseOrderId: po.id },
    });
    const invoices = await db.supplierInvoice.findMany({
      where: { id: { in: links.map((link) => link.invoiceId) } },
    });
    for (const invoice of invoices) {
      nodes.push({
        id: invoice.id,
        stage: "Supplier invoice / three-way match",
        number: invoice.internalNumber,
        status: invoice.status,
        timestamp: invoice.finalizedAt ?? invoice.createdAt,
        actorId: invoice.approvedById ?? invoice.createdById,
        reason: invoice.remarks,
        detail: `${invoice.supplierInvoiceNumber} · ₹${invoice.invoiceTotal}`,
      });
      const [mismatches, notes, payments, tally] = await Promise.all([
        db.invoiceMismatch.findMany({ where: { invoiceId: invoice.id } }),
        db.supplierFinancialNote.findMany({ where: { invoiceId: invoice.id } }),
        db.supplierPayment.findMany({ where: { invoiceId: invoice.id } }),
        db.tallyExportEvent.findMany({ where: { entityId: invoice.id } }),
      ]);
      nodes.push(
        ...mismatches.map((row) => ({
          id: row.id,
          stage: "Three-way match exception",
          number: invoice.internalNumber,
          status: row.status,
          timestamp: row.createdAt,
          actorId: row.reviewedById,
          reason: row.reviewReason,
          detail: `${row.field}: ${row.expectedValue} → ${row.actualValue}`,
        })),
      );
      nodes.push(
        ...notes.map((row) => ({
          id: row.id,
          stage: `${row.noteType} note`,
          number: row.noteNumber,
          status: row.status,
          timestamp: row.finalizedAt ?? row.createdAt,
          actorId: row.approvedById ?? row.createdById,
          reason: row.reason,
          detail: `₹${row.totalAmount}`,
        })),
      );
      if (hasPermission(principal, "payment.view"))
        nodes.push(
          ...payments.map((row) => ({
            id: row.id,
            stage: "Payment",
            number: row.paymentNumber,
            status: row.status,
            timestamp: row.finalizedAt ?? row.createdAt,
            actorId: row.approvedById ?? row.preparedById,
            reason: row.reason,
            detail: `${row.method} · ₹${row.amount}`,
          })),
        );
      if (hasPermission(principal, "tally.export"))
        nodes.push(
          ...tally.map((row) => ({
            id: row.id,
            stage: "Tally export",
            number: row.exportNumber,
            status: row.status,
            timestamp: row.createdAt,
            actorId: row.createdById,
            reason: row.lastError,
            detail: row.checksum,
          })),
        );
    }
  }
  const actorIds = [
    ...new Set(
      nodes
        .map((node) => node.actorId)
        .filter((actor): actor is string => Boolean(actor)),
    ),
  ];
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, displayName: true },
  });
  const actorMap = new Map(
    actors.map((actor) => [actor.id, actor.displayName]),
  );
  return {
    title: po.poNumber,
    context: `${requirement.project.projectCode} · ${requirement.site.name} · ${po.supplier.legalName}`,
    nodes: nodes
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .map((node) => ({
        ...node,
        actor: node.actorId
          ? (actorMap.get(node.actorId) ?? "Authorized user")
          : "System",
      })),
  };
}
