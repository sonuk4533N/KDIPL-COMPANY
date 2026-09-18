import "server-only";

import { db } from "@/db/prisma";
import { hasPermission } from "@/server/authorization/authorization";
import type { AuthenticatedPrincipal } from "@/types/application";
import { getReportingScope, scopedId } from "./reporting-scope";

export type SearchResult = {
  type: string;
  label: string;
  detail: string;
  href: string;
  date: Date;
  status?: string;
  projectId?: string;
};
export type GlobalSearchInput = {
  query: string;
  type?: string;
  projectId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
};

export async function globalSearch(
  principal: AuthenticatedPrincipal,
  input: GlobalSearchInput,
) {
  const query = input.query.trim().slice(0, 160);
  const page = Math.max(1, input.page ?? 1);
  if (query.length < 2)
    return { results: [] as SearchResult[], total: 0, page, pageSize: 20 };
  const scope = await getReportingScope(principal);
  if (
    input.projectId &&
    scope.projectIds &&
    !scope.projectIds.includes(input.projectId)
  )
    return { results: [], total: 0, page, pageSize: 20 };
  const projectIds = input.projectId ? [input.projectId] : scope.projectIds;
  const projectId = scopedId(projectIds);
  const locationId = scopedId(scope.locationIds);
  const siteId = scopedId(scope.siteIds);
  const contains = { contains: query, mode: "insensitive" as const };
  const status = input.status?.trim() || undefined;
  const from = input.from ? new Date(`${input.from}T00:00:00.000Z`) : undefined;
  const to = input.to ? new Date(`${input.to}T23:59:59.999Z`) : undefined;
  const date = from || to ? { gte: from, lte: to } : undefined;
  const allow = (type: string) =>
    !input.type || input.type === "all" || input.type === type;
  const tasks: Array<Promise<SearchResult[]>> = [];
  if (hasPermission(principal, "project.view") && allow("project"))
    tasks.push(
      db.project
        .findMany({
          where: {
            ...(projectId ? { id: projectId } : {}),
            OR: [
              { projectCode: contains },
              { name: contains },
              { location: contains },
            ],
            ...(status ? { status: status as never } : {}),
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Project",
            label: `${row.projectCode} · ${row.name}`,
            detail: row.location,
            href: `/projects/${row.id}`,
            date: row.createdAt,
            status: row.status,
            projectId: row.id,
          })),
        ),
    );
  if (hasPermission(principal, "site.view") && allow("site"))
    tasks.push(
      db.site
        .findMany({
          where: {
            ...(siteId ? { id: siteId } : projectId ? { projectId } : {}),
            OR: [
              { siteCode: contains },
              { name: contains },
              { location: contains },
            ],
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Site",
            label: `${row.siteCode} · ${row.name}`,
            detail: row.location,
            href: `/projects/${row.projectId}`,
            date: row.createdAt,
            status: row.status,
            projectId: row.projectId,
          })),
        ),
    );
  if (hasPermission(principal, "project.view") && allow("client"))
    tasks.push(
      db.client
        .findMany({
          where: {
            projects: projectId ? { some: { id: projectId } } : { some: {} },
            OR: [{ clientCode: contains }, { name: contains }],
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Client",
            label: `${row.clientCode} · ${row.name}`,
            detail: row.city ?? "",
            href: "/projects",
            date: row.createdAt,
          })),
        ),
    );
  if (
    (hasPermission(principal, "catalog.view") ||
      hasPermission(principal, "inventory.view")) &&
    allow("material")
  )
    tasks.push(
      db.material
        .findMany({
          where: { OR: [{ materialCode: contains }, { name: contains }] },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Material",
            label: `${row.materialCode} · ${row.name}`,
            detail: "Material catalogue",
            href: "/master-data",
            date: row.createdAt,
          })),
        ),
    );
  if (
    (hasPermission(principal, "supplier.view") ||
      hasPermission(principal, "invoice.view")) &&
    allow("supplier")
  )
    tasks.push(
      db.supplier
        .findMany({
          where: {
            OR: [
              { supplierCode: contains },
              { legalName: contains },
              { tradeName: contains },
              { gstin: contains },
            ],
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Supplier",
            label: `${row.supplierCode} · ${row.legalName}`,
            detail: row.gstin ?? "GSTIN unavailable",
            href: `/master-data/suppliers/${row.id}`,
            date: row.createdAt,
            status: row.isActive ? "ACTIVE" : "INACTIVE",
          })),
        ),
    );
  if (hasPermission(principal, "user.manage") && allow("employee"))
    tasks.push(
      db.employee
        .findMany({
          where: { OR: [{ employeeCode: contains }, { fullName: contains }] },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Employee",
            label: `${row.employeeCode} · ${row.fullName}`,
            detail: row.designation ?? "",
            href: "/administration",
            date: row.createdAt,
            status: row.isActive ? "ACTIVE" : "INACTIVE",
          })),
        ),
    );
  if (
    hasPermission(principal, "material_requirement.view") &&
    allow("requirement")
  )
    tasks.push(
      db.materialRequirement
        .findMany({
          where: {
            ...(projectId ? { projectId } : {}),
            requirementNumber: contains,
            ...(status ? { status: status as never } : {}),
            ...(date ? { createdAt: date } : {}),
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Material requirement",
            label: row.requirementNumber,
            detail: row.purpose,
            href: `/requirements/${row.id}`,
            date: row.createdAt,
            status: row.status,
            projectId: row.projectId,
          })),
        ),
    );
  if (hasPermission(principal, "purchase.view") && allow("rfq"))
    tasks.push(
      db.requestForQuotation
        .findMany({
          where: {
            ...(projectId ? { requirement: { projectId } } : {}),
            rfqNumber: contains,
            ...(status ? { status: status as never } : {}),
            ...(date ? { createdAt: date } : {}),
          },
          include: { requirement: { select: { projectId: true } } },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "RFQ",
            label: row.rfqNumber,
            detail: `Response due ${row.responseDueDate.toISOString().slice(0, 10)}`,
            href: `/procurement/rfqs/${row.id}`,
            date: row.createdAt,
            status: row.status,
            projectId: row.requirement.projectId,
          })),
        ),
    );
  if (hasPermission(principal, "purchase.view") && allow("quotation"))
    tasks.push(
      db.supplierQuotation
        .findMany({
          where: {
            ...(projectId ? { rfq: { requirement: { projectId } } } : {}),
            OR: [
              { quoteReference: contains },
              {
                supplier: {
                  OR: [
                    { legalName: contains },
                    { supplierCode: contains },
                    { gstin: contains },
                  ],
                },
              },
            ],
            ...(date ? { quoteDate: date } : {}),
          },
          include: {
            supplier: true,
            rfq: { include: { requirement: { select: { projectId: true } } } },
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Quotation",
            label: row.quoteReference,
            detail: row.supplier.legalName,
            href: `/procurement/rfqs/${row.rfqId}`,
            date: row.createdAt,
            projectId: row.rfq.requirement.projectId,
          })),
        ),
    );
  if (hasPermission(principal, "purchase.view") && allow("po"))
    tasks.push(
      db.purchaseOrder
        .findMany({
          where: {
            ...(projectId ? { rfq: { requirement: { projectId } } } : {}),
            poNumber: contains,
            ...(status ? { status: status as never } : {}),
            ...(date ? { createdAt: date } : {}),
          },
          include: {
            rfq: { include: { requirement: { select: { projectId: true } } } },
            supplier: true,
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Purchase order",
            label: row.poNumber,
            detail: row.supplier.legalName,
            href: `/trace/purchase-order/${row.id}`,
            date: row.createdAt,
            status: row.status,
            projectId: row.rfq.requirement.projectId,
          })),
        ),
    );
  if (hasPermission(principal, "purchase.view") && allow("amendment"))
    tasks.push(
      db.purchaseOrderAmendment
        .findMany({
          where: {
            purchaseOrder: {
              ...(projectId ? { rfq: { requirement: { projectId } } } : {}),
              poNumber: contains,
            },
            ...(status ? { status: status as never } : {}),
          },
          include: {
            purchaseOrder: {
              include: {
                rfq: {
                  include: { requirement: { select: { projectId: true } } },
                },
              },
            },
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "PO amendment",
            label: `${row.purchaseOrder.poNumber} · version ${row.version}`,
            detail: row.reason,
            href: `/trace/purchase-order/${row.purchaseOrderId}`,
            date: row.createdAt,
            status: row.status,
            projectId: row.purchaseOrder.rfq.requirement.projectId,
          })),
        ),
    );
  if (hasPermission(principal, "inventory.view") && allow("grn"))
    tasks.push(
      db.goodsReceipt
        .findMany({
          where: {
            ...(locationId ? { locationId } : {}),
            OR: [
              { grnNumber: contains },
              { supplierDeliveryNote: contains },
              { vehicleNumber: contains },
            ],
            ...(status ? { status: status as never } : {}),
            ...(date ? { createdAt: date } : {}),
          },
          include: { location: true },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "GRN",
            label: row.grnNumber,
            detail: row.location.name,
            href: `/trace/goods-receipt/${row.id}`,
            date: row.createdAt,
            status: row.status,
            projectId: row.location.projectId ?? undefined,
          })),
        ),
    );
  if (hasPermission(principal, "inventory.view") && allow("stock"))
    tasks.push(
      db.stockTransaction
        .findMany({
          where: {
            ...(locationId ? { locationId } : {}),
            transactionNumber: contains,
            ...(date ? { createdAt: date } : {}),
          },
          include: { location: true, material: true },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Stock transaction",
            label: row.transactionNumber,
            detail: `${row.material.name} · ${row.location.name}`,
            href: `/trace/stock-transaction/${row.id}`,
            date: row.createdAt,
            status: row.type,
            projectId: row.location.projectId ?? undefined,
          })),
        ),
    );
  if (hasPermission(principal, "inventory.view") && allow("movement"))
    tasks.push(
      db.customerStockMovement
        .findMany({
          where: {
            ...(locationId ? { sourceLocationId: locationId } : {}),
            number: contains,
            ...(status ? { status } : {}),
            ...(date ? { createdAt: date } : {}),
          },
          include: { source: true, material: true },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: row.kind.replaceAll("_", " "),
            label: row.number,
            detail: `${row.material.name} · ${row.source.name}`,
            href: `/trace/movement/${row.id}`,
            date: row.createdAt,
            status: row.status,
            projectId: row.source.projectId ?? undefined,
          })),
        ),
    );
  if (hasPermission(principal, "invoice.view") && allow("invoice"))
    tasks.push(
      db.supplierInvoice
        .findMany({
          where: {
            OR: [
              { internalNumber: contains },
              { supplierInvoiceNumber: contains },
              { normalizedInvoiceNumber: contains },
            ],
            ...(status ? { status } : {}),
            ...(date ? { createdAt: date } : {}),
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Supplier invoice",
            label: `${row.internalNumber} · ${row.supplierInvoiceNumber}`,
            detail: row.supplierIdentityKey,
            href: `/trace/invoice/${row.id}`,
            date: row.createdAt,
            status: row.status,
          })),
        ),
    );
  if (hasPermission(principal, "payment.view") && allow("payment"))
    tasks.push(
      db.supplierPayment
        .findMany({
          where: {
            OR: [
              { paymentNumber: contains },
              { referenceNumber: contains },
              { chequeNumber: contains },
            ],
            ...(status ? { status } : {}),
            ...(date ? { paymentDate: date } : {}),
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Payment",
            label: row.paymentNumber,
            detail: row.referenceNumber ?? row.chequeNumber ?? row.method,
            href: `/trace/payment/${row.id}`,
            date: row.createdAt,
            status: row.status,
          })),
        ),
    );
  if (hasPermission(principal, "invoice.view") && allow("note"))
    tasks.push(
      db.supplierFinancialNote
        .findMany({
          where: {
            noteNumber: contains,
            ...(status ? { status } : {}),
            ...(date ? { createdAt: date } : {}),
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: `${row.noteType} note`,
            label: row.noteNumber,
            detail: row.reason,
            href: `/trace/note/${row.id}`,
            date: row.createdAt,
            status: row.status,
          })),
        ),
    );
  if (hasPermission(principal, "tally.export") && allow("tally"))
    tasks.push(
      db.tallyExportEvent
        .findMany({
          where: {
            OR: [{ exportNumber: contains }, { entityId: contains }],
            ...(status ? { status } : {}),
            ...(date ? { createdAt: date } : {}),
          },
          take: 40,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "Tally export",
            label: row.exportNumber,
            detail: `${row.entityType} · ${row.entityId}`,
            href: `/accounts/tally`,
            date: row.createdAt,
            status: row.status,
          })),
        ),
    );
  const all = (await Promise.all(tasks))
    .flat()
    .sort(
      (a, b) =>
        b.date.getTime() - a.date.getTime() || a.label.localeCompare(b.label),
    );
  const filtered = all.filter(
    (row) =>
      (!input.projectId || row.projectId === input.projectId) &&
      (!status || row.status === status),
  );
  const pageSize = 20;
  await db.recentSearch.create({
    data: {
      userId: principal.userId,
      query,
      filters: {
        type: input.type,
        projectId: input.projectId,
        status,
        from: input.from,
        to: input.to,
      },
    },
  });
  return {
    results: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}
