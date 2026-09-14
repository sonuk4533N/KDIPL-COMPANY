import "server-only";

import { Prisma, type CustomerStockMovement } from "@/generated/prisma/client";
import type { StockTransactionType } from "@/generated/prisma/enums";
import { db } from "@/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import {
  financialYear,
  financialYearNumber,
  movementPrefix,
  nextMovementState,
  requiredMovementRole,
  type MovementKind,
} from "@/server/inventory/customer-movement-policy";
import {
  movementCreateSchema,
  movementTransitionSchema,
  type MovementCreateInput,
  type MovementTransitionInput,
} from "./customer-movement-schemas";
import type { AuthenticatedPrincipal } from "@/types/application";

type Tx = Prisma.TransactionClient;
const role = requireCustomerRole;
const nextNumber = nextCustomerNumber;
const D = (value: string | number | Prisma.Decimal) =>
  new Prisma.Decimal(value);
const terminal = [
  "POSTED",
  "ACKNOWLEDGED",
  "RECEIVED",
  "VERIFIED",
  "REJECTED",
  "CANCELLED",
];
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError("VALIDATION_ERROR", message);
}

// Shared with the BEFORE INSERT ledger trigger. Intentionally conservative:
// all movement commands, counts and closure checks use one transaction lock.
export async function lockCustomerInventory(tx: Tx) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(6062026::bigint)::text`;
}

export async function requireCustomerRole(
  tx: Tx,
  principal: AuthenticatedPrincipal,
  code: string,
) {
  requirePermission(principal, "inventory.view");
  if (
    !principal.roleCodes.includes(code) ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  )
    throw new AppError("FORBIDDEN", `This operation requires ${code}.`);
  const user = await tx.user.findFirst({
    where: {
      id: principal.userId,
      status: "ACTIVE",
      roles: { some: { role: { code, isActive: true } } },
    },
  });
  if (!user || user.employeeId !== principal.employeeId)
    throw new AppError("FORBIDDEN");
}

async function assigned(
  tx: Tx,
  principal: AuthenticatedPrincipal,
  scope: string | null | undefined,
  site: boolean,
) {
  if (!scope || !principal.employeeId)
    throw new AppError("FORBIDDEN", "An active assignment is required.");
  const now = new Date();
  const common = {
    employeeId: principal.employeeId,
    isActive: true,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
  const assignment = site
    ? await tx.siteAssignment.findFirst({
        where: { ...common, siteId: scope, role: "SITE_SUPERVISOR" },
      })
    : await tx.projectAssignment.findFirst({
        where: { ...common, projectId: scope, role: "PROJECT_MANAGER" },
      });
  if (!assignment)
    throw new AppError(
      "FORBIDDEN",
      "You are not currently assigned to this site/project.",
    );
}

function gps(input: {
  latitude?: number;
  longitude?: number;
  capturedAt?: string;
}) {
  assert(
    input.latitude !== undefined &&
      input.longitude !== undefined &&
      input.capturedAt,
    "Capture GPS for this site operation.",
  );
  const date = new Date(input.capturedAt);
  assert(
    Math.abs(Date.now() - date.getTime()) <= 15 * 60_000,
    "GPS must have been captured within the last 15 minutes.",
  );
  return {
    latitude: D(input.latitude),
    longitude: D(input.longitude),
    gpsCapturedAt: date,
  };
}

async function evidence(tx: Tx, id?: string | null) {
  assert(id, "Retained, security-scanned evidence is required.");
  const file = await tx.fileRecord.findFirst({
    where: {
      id,
      scanStatus: "CLEAN",
      retentionUntil: { gt: new Date() },
      documentType: "STOCK_MOVEMENT_EVIDENCE",
    },
  });
  assert(
    file,
    "Select clean stock-movement evidence with an active retention period.",
  );
}

export async function nextCustomerNumber(tx: Tx, prefix: string) {
  const year = financialYear(new Date());
  const sequence = await tx.businessSequence.upsert({
    where: { prefix_year: { prefix, year } },
    create: { prefix, year, currentValue: BigInt(1) },
    update: { currentValue: { increment: BigInt(1) } },
  });
  return financialYearNumber(prefix, year, sequence.currentValue);
}

export async function customerBalance(
  tx: Tx,
  locationId: string,
  materialId: string,
  unitId: string,
) {
  const rows = await tx.$queryRaw<
    Array<{ quantityOnHand: Prisma.Decimal }>
  >`SELECT "quantityOnHand" FROM "InventoryStockBalance" WHERE "locationId"=${locationId}::uuid AND "materialId"=${materialId}::uuid AND "unitId"=${unitId}::uuid`;
  return rows[0]?.quantityOnHand ?? D(0);
}

async function available(
  tx: Tx,
  m: CustomerStockMovement,
  excludeSelf = false,
) {
  const reserved = await tx.customerStockMovement.aggregate({
    where: {
      kind: "TRANSFER",
      status: "DISPATCHED",
      sourceLocationId: m.sourceLocationId,
      materialId: m.materialId,
      unitId: m.unitId,
      ...(excludeSelf ? { id: { not: m.id } } : {}),
    },
    _sum: { quantity: true },
  });
  return (
    await customerBalance(tx, m.sourceLocationId, m.materialId, m.unitId)
  ).minus(reserved._sum.quantity ?? 0);
}

async function carryingCost(
  tx: Tx,
  m: Pick<CustomerStockMovement, "sourceLocationId" | "materialId" | "unitId">,
) {
  const rows = await tx.$queryRaw<
    Array<{ quantity: Prisma.Decimal; cost: Prisma.Decimal; unpriced: bigint }>
  >`
    SELECT COALESCE(SUM(v."signedQuantity"),0) AS quantity,
      COALESCE(SUM(v."signedQuantity" * v."unitCost"),0) AS cost,
      COUNT(*) FILTER (WHERE v."unitCost" IS NULL) AS unpriced
    FROM "CustomerInventoryValuation" v WHERE v."locationId"=${m.sourceLocationId}::uuid
      AND v."materialId"=${m.materialId}::uuid AND v."unitId"=${m.unitId}::uuid`;
  const row = rows[0];
  assert(
    row && row.unpriced === BigInt(0),
    "Legacy/opening stock has no acquisition valuation. Resolve its valuation before moving it.",
  );
  if (row.quantity.gt(0)) return row.cost.div(row.quantity).toDecimalPlaces(6);
  const last = await tx.stockTransaction.findFirst({
    where: {
      materialId: m.materialId,
      unitId: m.unitId,
      goodsReceiptLineId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    include: { goodsReceiptLine: { include: { purchaseOrderLine: true } } },
  });
  const price = last?.goodsReceiptLine?.purchaseOrderLine.unitPrice;
  assert(price, "No posted acquisition price is available for this material.");
  return price;
}

async function postLeg(
  tx: Tx,
  m: CustomerStockMovement,
  actor: string,
  leg: string,
  type: StockTransactionType,
  locationId: string,
  quantity: Prisma.Decimal,
  unitCost: Prisma.Decimal,
  reversalOfId?: string,
) {
  if (quantity.isZero()) return;
  const entry = await tx.stockTransaction.create({
    data: {
      transactionNumber: await nextNumber(tx, "STK"),
      type,
      locationId,
      materialId: m.materialId,
      unitId: m.unitId,
      quantity,
      createdById: actor,
      reason: m.transitionReason,
      reversalOfId,
    },
  });
  await tx.customerMovementPosting.create({
    data: { movementId: m.id, transactionId: entry.id, leg, unitCost },
  });
}

async function pair(
  tx: Tx,
  m: CustomerStockMovement,
  actor: string,
  quantity: Prisma.Decimal,
  cost: Prisma.Decimal,
  issue = false,
) {
  assert(m.destinationLocationId, "Destination is required.");
  await postLeg(
    tx,
    m,
    actor,
    "SOURCE",
    issue ? "ISSUE" : "TRANSFER_OUT",
    m.sourceLocationId,
    quantity,
    cost,
  );
  await postLeg(
    tx,
    m,
    actor,
    "DESTINATION",
    "TRANSFER_IN",
    m.destinationLocationId,
    quantity,
    cost,
  );
}

async function audit(
  tx: Tx,
  principal: AuthenticatedPrincipal,
  id: string,
  before: unknown,
  after: unknown,
  reason: string,
) {
  await AuditService.record(
    {
      actorUserId: principal.userId,
      action: before ? "UPDATE" : "CREATE",
      entityType: "CustomerStockMovement",
      entityId: id,
      before,
      after,
      reason,
    },
    tx,
  );
}

async function variance(
  tx: Tx,
  m: CustomerStockMovement,
  quantity: Prisma.Decimal,
  direction: "IN" | "OUT",
  evidenceId: string,
  reason: string,
) {
  // Physical verification establishes the facts, but never gives Accounts or a
  // receiver the authority to approve or post an adjustment.
  const child = await tx.customerStockMovement.create({
    data: {
      number: await nextNumber(tx, "ADJ"),
      kind: "ADJUSTMENT",
      sourceLocationId: m.sourceLocationId,
      materialId: m.materialId,
      unitId: m.unitId,
      quantity,
      direction,
      reason,
      transitionReason: reason,
      evidenceId,
      varianceOfId: m.id,
      closureProjectId: m.closureProjectId,
      unitCost: m.unitCost,
      createdById: m.dispatchedById ?? m.createdById,
      updatedById: m.updatedById,
    },
  });
  return child;
}

export const CustomerMovementService = {
  async create(principal: AuthenticatedPrincipal, raw: MovementCreateInput) {
    const input = movementCreateSchema.parse(raw);
    return db.$transaction(
      async (tx) => {
        await lockCustomerInventory(tx);
        await role(
          tx,
          principal,
          ["ISSUE", "RETURN"].includes(input.kind)
            ? "SITE_SUPERVISOR"
            : "STORE_KEEPER",
        );
        const source = await tx.inventoryLocation.findFirst({
          where: { id: input.sourceLocationId, isActive: true },
        });
        const destination = input.destinationLocationId
          ? await tx.inventoryLocation.findFirst({
              where: { id: input.destinationLocationId, isActive: true },
            })
          : null;
        assert(source, "Select an active source.");
        if (["ISSUE", "TRANSFER", "RETURN"].includes(input.kind))
          assert(destination, "Select an active destination.");
        const material = await tx.material.findFirst({
          where: {
            id: input.materialId,
            isActive: true,
            defaultUnitId: input.unitId,
          },
        });
        assert(material, "Use an active material and its configured unit.");
        if (input.kind === "ISSUE") {
          assert(
            destination?.siteId,
            "Issue destination must be a site store.",
          );
          await assigned(tx, principal, destination.siteId, true);
          assert(
            !source.projectId || source.projectId === destination.projectId,
            "Use a stock transfer for cross-project movements.",
          );
        }
        if (input.kind === "RETURN") {
          await assigned(tx, principal, source.siteId, true);
          const original = await tx.customerStockMovement.findUnique({
            where: { id: input.originalIssueId! },
          });
          assert(
            original?.kind === "ISSUE" &&
              original.status === "ACKNOWLEDGED" &&
              original.destinationLocationId === source.id &&
              original.materialId === input.materialId &&
              original.unitId === input.unitId &&
              original.sourceLocationId === destination?.id,
            "Return must preserve the original acknowledged issue and store/site/material links.",
          );
          const returns = await tx.customerStockMovement.aggregate({
            where: {
              originalIssueId: original.id,
              status: { notIn: ["CANCELLED", "REJECTED"] },
            },
            _sum: { quantity: true },
          });
          assert(
            D(input.quantity)
              .plus(returns._sum.quantity ?? 0)
              .lte(original.actualQuantity!),
            "Return exceeds the unreturned issue quantity.",
          );
        }
        let position: ReturnType<typeof gps> | undefined;
        if (
          ["ISSUE", "RETURN"].includes(input.kind) ||
          (input.kind === "NON_USABLE" &&
            source.siteId &&
            ["DAMAGE", "THEFT_LOSS"].includes(input.category ?? ""))
        )
          position = gps(input);
        if (["ADJUSTMENT", "COUNT", "NON_USABLE"].includes(input.kind))
          await evidence(tx, input.evidenceId);
        let closureProjectId: string | undefined;
        if (input.kind === "COUNT") {
          assert(
            source.projectId,
            "Counts are allowed only during project closure.",
          );
          const closure = await tx.projectStockClosure.findUnique({
            where: { projectId: source.projectId },
          });
          assert(
            closure?.status === "OPEN",
            "Start project closure before physical counting.",
          );
          closureProjectId = source.projectId;
          assert(
            !(await tx.customerStockMovement.findFirst({
              where: {
                sourceLocationId: source.id,
                materialId: input.materialId,
                unitId: input.unitId,
                OR: [
                  { kind: "COUNT", status: "REQUESTED" },
                  { kind: "TRANSFER", status: "DISPATCHED" },
                ],
              },
            })),
            "Resolve the existing count or in-transit transfer before counting.",
          );
        }
        for (const location of [source, destination])
          if (location?.projectId) {
            const project = await tx.project.findUniqueOrThrow({
              where: { id: location.projectId },
              include: { stockClosure: true },
            });
            assert(
              !["COMPLETED", "CANCELLED"].includes(project.status),
              "This project is no longer open for stock operations.",
            );
            if (input.kind === "ISSUE")
              assert(
                !project.stockClosure,
                "New issues are blocked during project closure.",
              );
          }
        if (input.correctionOfId) {
          const original = await tx.customerStockMovement.findUnique({
            where: { id: input.correctionOfId },
          });
          assert(
            original?.kind === "ADJUSTMENT" &&
              original.status === "POSTED" &&
              original.sourceLocationId === source.id &&
              original.materialId === input.materialId &&
              original.unitId === input.unitId,
            "Corrections must reference a posted adjustment of the same stock key.",
          );
          assert(
            !(await tx.customerStockMovement.findFirst({
              where: {
                correctionOfId: original.id,
                status: { notIn: ["CANCELLED", "REJECTED"] },
              },
            })),
            "A correction already exists for that adjustment.",
          );
        }
        const movement = await tx.customerStockMovement.create({
          data: {
            number: await nextNumber(tx, movementPrefix(input.kind)),
            kind: input.kind,
            sourceLocationId: source.id,
            destinationLocationId: destination?.id,
            materialId: input.materialId,
            unitId: input.unitId,
            quantity: D(input.quantity),
            reason: input.reason,
            transitionReason: input.reason,
            evidenceId: input.evidenceId,
            originalIssueId: input.originalIssueId,
            correctionOfId: input.correctionOfId,
            category: input.category,
            direction: input.direction,
            disposition: input.disposition,
            createdById: principal.userId,
            updatedById: principal.userId,
            ...position,
            closureProjectId,
            bookQuantity:
              input.kind === "COUNT"
                ? await customerBalance(
                    tx,
                    source.id,
                    input.materialId,
                    input.unitId,
                  )
                : undefined,
          },
        });
        await audit(tx, principal, movement.id, null, movement, input.reason);
        return { id: movement.id };
      },
      { timeout: 20_000 },
    );
  },

  async transition(
    principal: AuthenticatedPrincipal,
    raw: MovementTransitionInput,
  ) {
    const input = movementTransitionSchema.parse(raw);
    return db.$transaction(
      async (tx) => {
        await lockCustomerInventory(tx);
        const before = await tx.customerStockMovement.findUnique({
          where: { id: input.id },
          include: { source: true, destination: true },
        });
        if (!before) throw new AppError("NOT_FOUND");
        const kind = before.kind as MovementKind;
        const code = requiredMovementRole(
          kind,
          input.command,
          !!before.destination?.siteId,
        );
        await role(tx, principal, code);
        if (code === "SITE_SUPERVISOR")
          await assigned(
            tx,
            principal,
            kind === "RETURN"
              ? before.source.siteId
              : before.destination?.siteId,
            true,
          );
        if (code === "PROJECT_MANAGER")
          await assigned(tx, principal, before.destination?.projectId, false);
        const status = nextMovementState(kind, before.status, input.command);
        assert(
          !before.varianceOfId || !["CANCEL", "REJECT"].includes(input.command),
          "A verified variance must be resolved with an MD-approved adjustment, not discarded.",
        );
        const data: Prisma.CustomerStockMovementUncheckedUpdateInput = {
          status,
          updatedById: principal.userId,
          transitionReason: input.reason,
        };
        if (["APPROVE", "REJECT"].includes(input.command)) {
          assert(
            kind === "TRANSFER" || before.createdById !== principal.userId,
            "The creator cannot approve or reject their own adjustment.",
          );
          if (input.command === "APPROVE") {
            data.approvedById = principal.userId;
            data.approvedAt = new Date();
          }
        }
        if (input.command === "APPROVE_EXTRA") {
          assert(
            input.quantity && D(input.quantity).gt(before.quantity),
            "Excess approval must specify a quantity greater than requested.",
          );
          data.approvedQuantity = D(input.quantity);
          data.approvedById = principal.userId;
          data.approvedAt = new Date();
        }
        if (input.command === "ISSUE") {
          const amount = D(input.quantity ?? before.quantity);
          assert(
            amount.gt(0) &&
              amount.lte(before.approvedQuantity ?? before.quantity),
            "Issue quantity exceeds the request or PM-approved limit.",
          );
          const reserved = await tx.customerStockMovement.count({
            where: {
              sourceLocationId: before.sourceLocationId,
              materialId: before.materialId,
              unitId: before.unitId,
              kind: "TRANSFER",
              status: "DISPATCHED",
            },
          });
          assert(
            !reserved || (await available(tx, before)).gte(amount),
            "Issued stock cannot use dispatched-transfer reservations.",
          );
          data.actualQuantity = amount;
          data.unitCost = await carryingCost(tx, before);
        }
        if (input.command === "DISPATCH") {
          assert(
            (await available(tx, before)).gte(before.quantity),
            "Insufficient unreserved stock for dispatch.",
          );
          data.dispatchedById = principal.userId;
          data.dispatchedAt = new Date();
          data.unitCost = await carryingCost(tx, before);
        }
        if (input.command === "RECEIVE") {
          assert(
            input.quantity !== undefined,
            "Record the actual received quantity, including zero for total loss.",
          );
          const amount = D(input.quantity);
          assert(
            amount.lte(before.quantity),
            "Actual receipt cannot exceed dispatch quantity.",
          );
          assert(
            (await available(tx, before, true)).gte(before.quantity),
            "Dispatched stock is no longer available; resolve the discrepancy first.",
          );
          data.actualQuantity = amount;
          if (before.destination?.siteId) {
            const position = gps(input);
            data.receiptLatitude = position.latitude;
            data.receiptLongitude = position.longitude;
            data.receiptGpsCapturedAt = position.gpsCapturedAt;
          }
          if (amount.lt(before.quantity)) {
            await evidence(tx, input.evidenceId);
            data.evidenceId = input.evidenceId;
          }
        }
        if (input.command === "VERIFY_RETURN") {
          assert(
            (await available(tx, before)).gte(before.quantity),
            "Returned stock is not available at the issue site.",
          );
          const original = await tx.customerStockMovement.findUniqueOrThrow({
            where: { id: before.originalIssueId! },
          });
          data.unitCost = original.unitCost;
        }
        if (input.command === "VERIFY_COUNT") {
          assert(
            (
              await customerBalance(
                tx,
                before.sourceLocationId,
                before.materialId,
                before.unitId,
              )
            ).eq(before.bookQuantity!),
            "Book stock changed after capture. Cancel and recount.",
          );
          if (!before.quantity.eq(before.bookQuantity!))
            data.unitCost = await carryingCost(tx, before);
        }
        if (input.command === "POST") {
          await evidence(tx, before.evidenceId);
          data.unitCost = before.unitCost ?? (await carryingCost(tx, before));
        }
        if (terminal.includes(status)) data.completedAt = new Date();
        const movement = await tx.customerStockMovement.update({
          where: { id: before.id },
          data,
        });
        if (input.command === "ISSUE")
          await pair(
            tx,
            movement,
            principal.userId,
            movement.actualQuantity!,
            movement.unitCost!,
            true,
          );
        if (input.command === "RECEIVE") {
          await pair(
            tx,
            movement,
            before.dispatchedById!,
            movement.actualQuantity!,
            movement.unitCost!,
          );
          const shortage = before.quantity.minus(movement.actualQuantity!);
          if (shortage.gt(0)) {
            const child = await variance(
              tx,
              movement,
              shortage,
              "OUT",
              movement.evidenceId!,
              input.reason,
            );
            await audit(tx, principal, child.id, null, child, input.reason);
          }
        }
        if (input.command === "VERIFY_RETURN")
          await pair(
            tx,
            movement,
            principal.userId,
            movement.quantity,
            movement.unitCost!,
          );
        if (input.command === "VERIFY_COUNT") {
          const difference = movement.quantity.minus(movement.bookQuantity!);
          if (!difference.isZero()) {
            const child = await variance(
              tx,
              movement,
              difference.abs(),
              difference.gt(0) ? "IN" : "OUT",
              movement.evidenceId!,
              input.reason,
            );
            await audit(tx, principal, child.id, null, child, input.reason);
          }
        }
        if (input.command === "POST") {
          if (movement.correctionOfId) {
            const original = await tx.customerMovementPosting.findUniqueOrThrow(
              {
                where: {
                  movementId_leg: {
                    movementId: movement.correctionOfId,
                    leg: "ADJUSTMENT",
                  },
                },
                include: { transaction: true },
              },
            );
            await postLeg(
              tx,
              movement,
              principal.userId,
              "REVERSAL",
              "REVERSAL",
              movement.sourceLocationId,
              original.transaction.quantity,
              original.unitCost,
              original.transactionId,
            );
          }
          if (movement.direction === "OUT") {
            const reservations = await tx.customerStockMovement.count({
              where: {
                kind: "TRANSFER",
                status: "DISPATCHED",
                sourceLocationId: movement.sourceLocationId,
                materialId: movement.materialId,
                unitId: movement.unitId,
              },
            });
            assert(
              !reservations ||
                (await available(tx, movement)).gte(movement.quantity),
              "Resolve dispatched transfers before reducing reserved stock.",
            );
          }
          await postLeg(
            tx,
            movement,
            principal.userId,
            "ADJUSTMENT",
            movement.direction === "IN" && kind === "ADJUSTMENT"
              ? "ADJUSTMENT_IN"
              : "ADJUSTMENT_OUT",
            movement.sourceLocationId,
            movement.quantity,
            movement.unitCost!,
          );
        }
        await audit(tx, principal, movement.id, before, movement, input.reason);
        return { id: movement.id };
      },
      { timeout: 20_000 },
    );
  },
};
