import { describe, expect, it } from "vitest";
import {
  financialYear,
  financialYearNumber,
  nextMovementState,
  requiredMovementRole,
  movementPrefix,
  movementKinds,
} from "../../src/server/inventory/customer-movement-policy";
import { movementCreateSchema } from "../../src/features/inventory/customer-movement-schemas";

describe("customer-aligned movement rules", () => {
  it.each([
    ["2026-03-31T18:29:59.999Z", 2025],
    ["2026-03-31T18:30:00.000Z", 2026],
    ["2027-01-01T00:00:00.000Z", 2026],
    ["2027-03-31T18:30:00.000Z", 2027],
  ])("uses Indian financial-year boundaries for %s", (date, year) =>
    expect(financialYear(new Date(date))).toBe(year),
  );
  it.each(movementKinds)("numbers %s safely", (kind) =>
    expect(financialYearNumber(movementPrefix(kind), 2026, BigInt(1))).toMatch(
      /^[A-Z]{2,5}-26-27-0001$/,
    ),
  );
  it("does not truncate larger sequence values", () =>
    expect(financialYearNumber("COUNT", 2026, BigInt(10001))).toBe(
      "COUNT-26-27-10001",
    ));
  it.each([0, -1])("rejects invalid sequence %s", (value) =>
    expect(() => financialYearNumber("MI", 2026, BigInt(value))).toThrow(),
  );
  it.each([
    ["TRANSFER", "REQUESTED", "DISPATCH"],
    ["TRANSFER", "APPROVED", "RECEIVE"],
    ["ADJUSTMENT", "REQUESTED", "POST"],
    ["COUNT", "REQUESTED", "POST"],
    ["ISSUE", "REQUESTED", "ACKNOWLEDGE"],
    ["RETURN", "POSTED", "VERIFY_RETURN"],
    ["TRANSFER", "RECEIVED", "RECEIVE"],
    ["NON_USABLE", "REQUESTED", "POST"],
  ] as const)("blocks %s %s → %s", (kind, state, command) =>
    expect(() => nextMovementState(kind, state, command)).toThrow(),
  );
  it("requires PD approval before SK dispatch", () => {
    expect(requiredMovementRole("TRANSFER", "APPROVE")).toBe(
      "PROJECT_DIRECTOR",
    );
    expect(nextMovementState("TRANSFER", "REQUESTED", "APPROVE")).toBe(
      "APPROVED",
    );
    expect(requiredMovementRole("TRANSFER", "DISPATCH")).toBe("STORE_KEEPER");
  });
  it("requires supervisor site receipt without a Store Keeper bypass", () =>
    expect(requiredMovementRole("TRANSFER", "RECEIVE", true)).toBe(
      "SITE_SUPERVISOR",
    ));
  it("requires independent MD adjustment approval and Accounts count verification", () => {
    expect(requiredMovementRole("ADJUSTMENT", "APPROVE")).toBe(
      "MANAGING_DIRECTOR",
    );
    expect(requiredMovementRole("COUNT", "VERIFY_COUNT")).toBe("ACCOUNTS");
  });
  it("requires GPS for issue and return requests", () => {
    const base = {
      kind: "ISSUE",
      sourceLocationId: "00000000-0000-4000-8000-000000000001",
      destinationLocationId: "00000000-0000-4000-8000-000000000002",
      materialId: "00000000-0000-4000-8000-000000000003",
      unitId: "00000000-0000-4000-8000-000000000004",
      quantity: "1.125",
      reason: "Site request",
    };
    expect(movementCreateSchema.safeParse(base).success).toBe(false);
    expect(
      movementCreateSchema.safeParse({
        ...base,
        latitude: 0,
        longitude: 0,
        capturedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
    expect(
      movementCreateSchema.safeParse({
        ...base,
        latitude: 91,
        longitude: 0,
        capturedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});
