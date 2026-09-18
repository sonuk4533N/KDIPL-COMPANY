import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db/prisma";
import { globalSearch } from "../../src/features/reporting/global-search";
import { reportRows } from "../../src/features/reporting/reporting-queries";
import { getReportingScope } from "../../src/features/reporting/reporting-scope";
import { traceabilityChain } from "../../src/features/reporting/traceability";
import type {
  AuthenticatedPrincipal,
  PermissionCode,
} from "../../src/types/application";

const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && !!process.env.TEST_DATABASE_URL;
const createdJobIds: string[] = [];
const searchUserIds: string[] = [];

async function demoPrincipal(email: string): Promise<AuthenticatedPrincipal> {
  const user = await db.user.findUniqueOrThrow({
    where: { emailNormalized: email },
    include: {
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  return {
    userId: user.id,
    employeeId: user.employeeId,
    email: user.email,
    displayName: user.displayName,
    mustChangePassword: false,
    roleCodes: user.roles.map(({ role }) => role.code),
    permissions: [
      ...new Set(
        user.roles.flatMap(({ role }) =>
          role.permissions.map(
            ({ permission }) => permission.code as PermissionCode,
          ),
        ),
      ),
    ],
  };
}

describe.skipIf(!enabled)("Phase 8 reporting and search", () => {
  let managingDirector: AuthenticatedPrincipal;
  let projectManager: AuthenticatedPrincipal;

  beforeAll(async () => {
    managingDirector = await demoPrincipal("managing.director@kdipl.test");
    projectManager = await demoPrincipal("project.manager@kdipl.test");
    searchUserIds.push(managingDirector.userId, projectManager.userId);
  });

  afterAll(async () => {
    if (createdJobIds.length)
      await db.reportExportJob.deleteMany({
        where: { id: { in: createdJobIds } },
      });
    if (searchUserIds.length)
      await db.recentSearch.deleteMany({
        where: { userId: { in: searchUserIds } },
      });
  });

  it("defaults stock valuation to quantity only while CA policy is pending", async () => {
    const policy = await db.stockValuationPolicy.findFirst({
      orderBy: { effectiveFrom: "desc" },
    });
    expect(policy?.method).toBe("QUANTITY_ONLY");
  });

  it("derives current stock from immutable ledger postings", async () => {
    const rows = await reportRows(managingDirector, "current-stock-location");
    expect(
      rows.some(
        (row) =>
          row.materialCode === "MAT-MS-SQ-PIPE" && Number(row.quantity) >= 100,
      ),
    ).toBe(true);
  });

  it("resolves company-wide and assigned-project scopes", async () => {
    const directorScope = await getReportingScope(managingDirector);
    const managerScope = await getReportingScope(projectManager);
    expect(directorScope.companyWide).toBe(true);
    expect(managerScope.companyWide).toBe(false);
    expect(managerScope.projectIds?.length).toBeGreaterThan(0);
  });

  it("isolates search results to the caller's authorized project scope", async () => {
    const result = await globalSearch(projectManager, {
      query: "PRJ-",
      type: "project",
    });
    const scope = await getReportingScope(projectManager);
    expect(
      result.results.every(
        (row) => !!row.projectId && scope.projectIds?.includes(row.projectId),
      ),
    ).toBe(true);
  });

  it("links the requirement-to-ledger-to-finance trace chain", async () => {
    const po = await db.purchaseOrder.findUniqueOrThrow({
      where: { poNumber: "PO-2026-P7DEMO" },
    });
    const trace = await traceabilityChain(
      managingDirector,
      "purchase-order",
      po.id,
    );
    expect(
      trace?.nodes.some((node) => node.stage === "Material requirement"),
    ).toBe(true);
    expect(trace?.nodes.some((node) => node.stage === "Stock ledger")).toBe(
      true,
    );
  });

  it("keeps export requests idempotent", async () => {
    const idempotencyKey = `p8-${randomUUID()}`;
    const input = {
      requestedById: managingDirector.userId,
      reportType: "current-stock-location",
      format: "csv",
      filters: {},
      financialYear: "26-27",
      idempotencyKey,
    };
    const first = await db.reportExportJob.upsert({
      where: { idempotencyKey },
      create: input,
      update: {},
    });
    const second = await db.reportExportJob.upsert({
      where: { idempotencyKey },
      create: input,
      update: {},
    });
    createdJobIds.push(first.id);
    expect(second.id).toBe(first.id);
  });

  it("installs reporting indexes for largest date and scope filters", async () => {
    const indexes = await db.$queryRaw<
      Array<{ indexname: string }>
    >`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('StockTransaction_createdAt_locationId_idx', 'SupplierInvoice_finalizedAt_status_idx', 'GoodsReceipt_postedAt_status_idx')`;
    expect(indexes.map((row) => row.indexname).sort()).toEqual([
      "GoodsReceipt_postedAt_status_idx",
      "StockTransaction_createdAt_locationId_idx",
      "SupplierInvoice_finalizedAt_status_idx",
    ]);
  });
});
