import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client";

const connectionString = process.env.TEST_DATABASE_URL ?? "";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && connectionString.length > 0;
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

async function createFixture() {
  const tag = randomUUID().slice(0, 8).toUpperCase();
  const [category, unit, user, client] = await Promise.all([
    testDb!.materialCategory.create({
      data: { code: `P6CAT-${tag}`, name: `Phase 6 Category ${tag}` },
    }),
    testDb!.unitOfMeasure.create({
      data: { code: `P6U-${tag}`, name: `Phase 6 Unit ${tag}`, symbol: "p6" },
    }),
    testDb!.user.create({
      data: {
        email: `p6-${tag.toLowerCase()}@kdipl.test`,
        emailNormalized: `p6-${tag.toLowerCase()}@kdipl.test`,
        passwordHash: "integration-test",
        displayName: "Phase 6 Store Keeper",
      },
    }),
    testDb!.client.create({
      data: { clientCode: `P6C-${tag}`, name: `Phase 6 Client ${tag}` },
    }),
  ]);
  const [material, project] = await Promise.all([
    testDb!.material.create({
      data: {
        materialCode: `P6M-${tag}`,
        name: `Phase 6 Material ${tag}`,
        categoryId: category.id,
        defaultUnitId: unit.id,
      },
    }),
    testDb!.project.create({
      data: {
        projectCode: `P6P-${tag}`,
        name: `Phase 6 Project ${tag}`,
        clientId: client.id,
        location: "Gurugram",
        status: "ACTIVE",
      },
    }),
  ]);
  const [source, destination] = await Promise.all([
    testDb!.inventoryLocation.create({
      data: {
        locationCode: `P6-SOURCE-${tag}`,
        name: "Phase 6 Source",
        type: "CENTRAL_STORE",
      },
    }),
    testDb!.inventoryLocation.create({
      data: {
        locationCode: `P6-DEST-${tag}`,
        name: "Phase 6 Destination",
        type: "PROJECT_STORE",
        projectId: project.id,
      },
    }),
  ]);

  return { tag, unit, user, material, project, source, destination };
}

async function balance(input: {
  locationId: string;
  materialId: string;
  unitId: string;
}) {
  return testDb!.$queryRaw<{ quantityOnHand: string }[]>`
    SELECT "quantityOnHand"::text AS "quantityOnHand"
    FROM "InventoryStockBalance"
    WHERE "locationId" = ${input.locationId}::uuid
      AND "materialId" = ${input.materialId}::uuid
      AND "unitId" = ${input.unitId}::uuid
  `;
}

describe.skipIf(!enabled)("Phase 6 stock movement database foundation", () => {
  afterAll(async () => testDb?.$disconnect());

  it("serializes outbound stock and rejects duplicate issue posting", async () => {
    const fixture = await createFixture();
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6-OPEN-${fixture.tag}`,
        type: "OPENING",
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
        quantity: "10.000",
        createdById: fixture.user.id,
      },
    });

    const makePostedIssue = async (suffix: string, quantity: string) => {
      const issue = await testDb!.materialIssue.create({
        data: {
          issueNumber: `MI-${fixture.tag}-${suffix}`,
          sourceLocationId: fixture.source.id,
          projectId: fixture.project.id,
          purpose: "Concurrent outbound guard test",
          createdById: fixture.user.id,
          lines: {
            create: {
              materialId: fixture.material.id,
              unitId: fixture.unit.id,
              quantity,
            },
          },
        },
        include: { lines: true },
      });
      return testDb!.materialIssue.update({
        where: { id: issue.id },
        data: {
          status: "POSTED",
          postedById: fixture.user.id,
          postedAt: new Date(),
        },
        include: { lines: true },
      });
    };

    const firstIssue = await makePostedIssue("01", "8.000");
    const firstTransaction = await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6-ISSUE-${fixture.tag}-01`,
        type: "ISSUE",
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
        quantity: "8.000",
        materialIssueLineId: firstIssue.lines[0].id,
        createdById: fixture.user.id,
      },
    });
    expect(
      await balance({
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
      }),
    ).toEqual([{ quantityOnHand: "2.000" }]);

    await expect(
      testDb!.stockTransaction.create({
        data: {
          transactionNumber: `P6-ISSUE-${fixture.tag}-DUP`,
          type: "ISSUE",
          locationId: fixture.source.id,
          materialId: fixture.material.id,
          unitId: fixture.unit.id,
          quantity: "8.000",
          materialIssueLineId: firstIssue.lines[0].id,
          createdById: fixture.user.id,
        },
      }),
    ).rejects.toThrow();

    const [secondIssue, thirdIssue] = await Promise.all([
      makePostedIssue("02", "2.000"),
      makePostedIssue("03", "2.000"),
    ]);
    const attempts = await Promise.allSettled(
      [secondIssue, thirdIssue].map((issue, index) =>
        testDb!.stockTransaction.create({
          data: {
            transactionNumber: `P6-ISSUE-${fixture.tag}-${index + 2}`,
            type: "ISSUE",
            locationId: fixture.source.id,
            materialId: fixture.material.id,
            unitId: fixture.unit.id,
            quantity: "2.000",
            materialIssueLineId: issue.lines[0].id,
            createdById: fixture.user.id,
          },
        }),
      ),
    );
    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    expect(
      await balance({
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
      }),
    ).toEqual([{ quantityOnHand: "0.000" }]);

    await expect(
      testDb!.stockTransaction.update({
        where: { id: firstTransaction.id },
        data: { quantity: "7.000" },
      }),
    ).rejects.toThrow(/immutable/i);
  });

  it("tracks transfer in transit and validates reconciliation returns", async () => {
    const fixture = await createFixture();
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6-OPEN-${fixture.tag}`,
        type: "OPENING",
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
        quantity: "10.000",
        createdById: fixture.user.id,
      },
    });
    const transfer = await testDb!.stockTransfer.create({
      data: {
        transferNumber: `TR-${fixture.tag}`,
        sourceLocationId: fixture.source.id,
        destinationLocationId: fixture.destination.id,
        createdById: fixture.user.id,
        lines: {
          create: {
            materialId: fixture.material.id,
            unitId: fixture.unit.id,
            quantity: "4.000",
          },
        },
      },
      include: { lines: true },
    });
    await testDb!.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "DISPATCHED",
        dispatchedById: fixture.user.id,
        dispatchedAt: new Date(),
      },
    });
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6-TR-OUT-${fixture.tag}`,
        type: "TRANSFER_OUT",
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
        quantity: "4.000",
        stockTransferLineId: transfer.lines[0].id,
        createdById: fixture.user.id,
      },
    });
    expect(
      await balance({
        locationId: fixture.destination.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
      }),
    ).toEqual([]);

    await testDb!.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "RECEIVED",
        receivedById: fixture.user.id,
        receivedAt: new Date(),
      },
    });
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6-TR-IN-${fixture.tag}`,
        type: "TRANSFER_IN",
        locationId: fixture.destination.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
        quantity: "4.000",
        stockTransferLineId: transfer.lines[0].id,
        createdById: fixture.user.id,
      },
    });
    expect(
      await balance({
        locationId: fixture.destination.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
      }),
    ).toEqual([{ quantityOnHand: "4.000" }]);

    const issue = await testDb!.materialIssue.create({
      data: {
        issueNumber: `MI-${fixture.tag}-RETURN`,
        sourceLocationId: fixture.source.id,
        projectId: fixture.project.id,
        purpose: "Reconciliation guard test",
        createdById: fixture.user.id,
        lines: {
          create: {
            materialId: fixture.material.id,
            unitId: fixture.unit.id,
            quantity: "3.000",
          },
        },
      },
      include: { lines: true },
    });
    await testDb!.$transaction(async (transaction) => {
      await transaction.materialIssue.update({
        where: { id: issue.id },
        data: {
          status: "POSTED",
          postedById: fixture.user.id,
          postedAt: new Date(),
        },
      });
      await transaction.stockTransaction.create({
        data: {
          transactionNumber: `P6-ISSUE-${fixture.tag}-RETURN`,
          type: "ISSUE",
          locationId: fixture.source.id,
          materialId: fixture.material.id,
          unitId: fixture.unit.id,
          quantity: "3.000",
          materialIssueLineId: issue.lines[0].id,
          createdById: fixture.user.id,
        },
      });
      await transaction.materialIssue.update({
        where: { id: issue.id },
        data: {
          status: "ACKNOWLEDGED",
          acknowledgedById: fixture.user.id,
          acknowledgedAt: new Date(),
        },
      });
    });
    const reconciliation = await testDb!.materialReconciliation.create({
      data: {
        reconciliationNumber: `REC-${fixture.tag}-01`,
        materialIssueLineId: issue.lines[0].id,
        returnLocationId: fixture.source.id,
        consumedQuantity: "1.000",
        returnedQuantity: "2.000",
        createdById: fixture.user.id,
      },
    });
    await testDb!.materialReconciliation.update({
      where: { id: reconciliation.id },
      data: {
        status: "POSTED",
        postedById: fixture.user.id,
        postedAt: new Date(),
      },
    });
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6-RETURN-${fixture.tag}`,
        type: "RETURN",
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
        quantity: "2.000",
        reconciliationId: reconciliation.id,
        createdById: fixture.user.id,
      },
    });

    const excess = await testDb!.materialReconciliation.create({
      data: {
        reconciliationNumber: `REC-${fixture.tag}-02`,
        materialIssueLineId: issue.lines[0].id,
        consumedQuantity: "1.000",
        createdById: fixture.user.id,
      },
    });
    await expect(
      testDb!.materialReconciliation.update({
        where: { id: excess.id },
        data: {
          status: "POSTED",
          postedById: fixture.user.id,
          postedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/exceeds issued quantity/i);
  });

  it("requires approval for adjustments and posts exact count variances", async () => {
    const fixture = await createFixture();
    const reviewer = await testDb!.user.create({
      data: {
        email: `p6-reviewer-${fixture.tag.toLowerCase()}@kdipl.test`,
        emailNormalized: `p6-reviewer-${fixture.tag.toLowerCase()}@kdipl.test`,
        passwordHash: "integration-test",
        displayName: "Phase 6 Independent Reviewer",
      },
    });
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6-OPEN-${fixture.tag}`,
        type: "OPENING",
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
        quantity: "5.000",
        createdById: fixture.user.id,
      },
    });

    const adjustment = await testDb!.stockAdjustment.create({
      data: {
        adjustmentNumber: `ADJ-${fixture.tag}`,
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
        direction: "IN",
        quantity: "2.000",
        reason: "Approved integration adjustment",
        createdById: fixture.user.id,
      },
    });
    await expect(
      testDb!.stockAdjustment.update({
        where: { id: adjustment.id },
        data: {
          status: "APPROVED",
          decidedById: fixture.user.id,
          decidedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/invalid.*transition/i);
    await testDb!.stockAdjustment.update({
      where: { id: adjustment.id },
      data: {
        status: "SUBMITTED",
        submittedById: fixture.user.id,
        submittedAt: new Date(),
      },
    });
    await testDb!.stockAdjustment.update({
      where: { id: adjustment.id },
      data: {
        status: "APPROVED",
        decidedById: reviewer.id,
        decidedAt: new Date(),
        decisionNotes: "Independent adjustment review completed",
      },
    });
    await testDb!.stockAdjustment.update({
      where: { id: adjustment.id },
      data: {
        status: "POSTED",
        postedById: fixture.user.id,
        postedAt: new Date(),
      },
    });
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6-ADJ-${fixture.tag}`,
        type: "ADJUSTMENT_IN",
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
        quantity: "2.000",
        stockAdjustmentId: adjustment.id,
        createdById: fixture.user.id,
      },
    });

    const count = await testDb!.stockCount.create({
      data: {
        countNumber: `COUNT-${fixture.tag}`,
        locationId: fixture.source.id,
        countedAt: new Date(),
        createdById: fixture.user.id,
        lines: {
          create: {
            materialId: fixture.material.id,
            unitId: fixture.unit.id,
            bookQuantity: "7.000",
            countedQuantity: "4.000",
            varianceQuantity: "-3.000",
          },
        },
      },
      include: { lines: true },
    });
    await testDb!.stockCount.update({
      where: { id: count.id },
      data: {
        status: "SUBMITTED",
        submittedById: fixture.user.id,
        submittedAt: new Date(),
      },
    });
    await testDb!.stockCount.update({
      where: { id: count.id },
      data: {
        status: "APPROVED",
        decidedById: reviewer.id,
        decidedAt: new Date(),
        decisionNotes: "Independent count review completed",
      },
    });
    await testDb!.stockCount.update({
      where: { id: count.id },
      data: {
        status: "POSTED",
        postedById: fixture.user.id,
        postedAt: new Date(),
      },
    });
    await expect(
      testDb!.stockCountLine.update({
        where: { id: count.lines[0].id },
        data: { countedQuantity: "5.000", varianceQuantity: "-2.000" },
      }),
    ).rejects.toThrow(/only while their parent is draft/i);
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6-COUNT-${fixture.tag}`,
        type: "ADJUSTMENT_OUT",
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
        quantity: "3.000",
        stockCountLineId: count.lines[0].id,
        createdById: fixture.user.id,
      },
    });
    expect(
      await balance({
        locationId: fixture.source.id,
        materialId: fixture.material.id,
        unitId: fixture.unit.id,
      }),
    ).toEqual([{ quantityOnHand: "4.000" }]);
  });
});
