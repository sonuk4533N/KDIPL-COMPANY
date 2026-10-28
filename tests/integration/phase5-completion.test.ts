import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && Boolean(testDatabaseUrl);
const testDb =
  enabled && testDatabaseUrl
    ? new PrismaClient({
        adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
      })
    : null;

describe.skipIf(!enabled)("Phase 5 completion database controls", () => {
  afterAll(async () => testDb?.$disconnect());

  it("installs the full purchase-order lifecycle enum", async () => {
    const rows = await testDb!.$queryRaw<Array<{ value: string }>>`
      SELECT e.enumlabel AS "value"
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'PurchaseOrderStatus'
      ORDER BY e.enumsortorder
    `;

    expect(rows.map(({ value }) => value)).toEqual([
      "DRAFT",
      "ISSUED",
      "ACCEPTED",
      "PARTIALLY_RECEIVED",
      "RECEIVED",
      "CLOSED",
      "CANCELLED",
    ]);
  });

  it("installs the separated GRN approval lifecycle", async () => {
    const rows = await testDb!.$queryRaw<Array<{ value: string }>>`
      SELECT e.enumlabel AS "value"
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'GoodsReceiptStatus'
      ORDER BY e.enumsortorder
    `;

    expect(rows.map(({ value }) => value)).toEqual([
      "DRAFT",
      "POSTED",
      "CANCELLED",
      "PHYSICALLY_VERIFIED",
      "PENDING_PM_APPROVAL",
    ]);
  });

  it("installs damaged/rejected exception statuses and guard triggers", async () => {
    const statuses = await testDb!.$queryRaw<Array<{ value: string }>>`
      SELECT e.enumlabel AS "value"
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'GoodsReceiptExceptionStatus'
      ORDER BY e.enumsortorder
    `;
    expect(statuses.map(({ value }) => value)).toEqual([
      "OPEN",
      "REPLACEMENT_EXPECTED",
      "RETURN_PENDING",
      "RETURNED",
      "RESOLVED",
    ]);

    const controls = await testDb!.$queryRaw<
      Array<{ relationName: string; triggerName: string }>
    >`
      SELECT c.relname AS "relationName", tg.tgname AS "triggerName"
      FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      WHERE NOT tg.tgisinternal
        AND tg.tgname IN (
          'GoodsReceipt_post_guard',
          'GoodsReceipt_exception_register',
          'GoodsReceipt_immutable_guard',
          'GoodsReceiptLine_draft_guard',
          'PurchaseOrder_close_guard',
          'PurchaseOrder_transition_guard',
          'StockTransaction_immutable_guard',
          'StockTransaction_receipt_source_guard'
        )
      ORDER BY tg.tgname
    `;

    expect(controls).toEqual([
      {
        relationName: "GoodsReceiptLine",
        triggerName: "GoodsReceiptLine_draft_guard",
      },
      {
        relationName: "GoodsReceipt",
        triggerName: "GoodsReceipt_exception_register",
      },
      {
        relationName: "GoodsReceipt",
        triggerName: "GoodsReceipt_immutable_guard",
      },
      { relationName: "GoodsReceipt", triggerName: "GoodsReceipt_post_guard" },
      {
        relationName: "PurchaseOrder",
        triggerName: "PurchaseOrder_close_guard",
      },
      {
        relationName: "PurchaseOrder",
        triggerName: "PurchaseOrder_transition_guard",
      },
      {
        relationName: "StockTransaction",
        triggerName: "StockTransaction_immutable_guard",
      },
      {
        relationName: "StockTransaction",
        triggerName: "StockTransaction_receipt_source_guard",
      },
    ]);
  });
});
