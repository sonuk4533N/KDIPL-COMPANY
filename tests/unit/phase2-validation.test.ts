import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  materialSchema,
  supplierSchema,
  unitSchema,
} from "@/features/catalog/catalog-schemas";
import {
  dateInput,
  projectAssignmentSchema,
  projectSchema,
  projectStatusSchema,
  siteSchema,
} from "@/features/projects/project-schemas";

describe("Phase 2 project validation", () => {
  it("normalizes project fields and converts date-only input at UTC midnight", () => {
    const result = projectSchema.parse({
      projectCode: " prj-026 ",
      name: " Northern Warehouse ",
      clientId: randomUUID(),
      location: " Gurugram ",
      startDate: "2026-08-24",
      expectedCompletionDate: "2026-08-24",
    });

    expect(result).toMatchObject({
      projectCode: "PRJ-026",
      name: "Northern Warehouse",
      location: "Gurugram",
    });
    expect(dateInput(result.startDate)?.toISOString()).toBe(
      "2026-08-24T00:00:00.000Z",
    );
    expect(dateInput(undefined)).toBeUndefined();
  });

  it("rejects a completion date before the project start date", () => {
    const result = projectSchema.safeParse({
      projectCode: "PRJ-027",
      name: "Eastern Warehouse",
      clientId: randomUUID(),
      location: "Kolkata",
      startDate: "2026-08-25",
      expectedCompletionDate: "2026-08-24",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toMatchObject({
        expectedCompletionDate: [
          "Expected completion cannot be before the start date.",
        ],
      });
    }
  });

  it("normalizes site codes and rejects unsupported code characters", () => {
    const valid = siteSchema.parse({
      projectId: randomUUID(),
      siteCode: " site-01 ",
      name: " Main Site ",
      location: " Pune ",
    });
    const invalid = siteSchema.safeParse({
      projectId: randomUUID(),
      siteCode: "SITE_01",
      name: "Main Site",
      location: "Pune",
    });

    expect(valid).toMatchObject({
      siteCode: "SITE-01",
      name: "Main Site",
      location: "Pune",
    });
    expect(invalid.success).toBe(false);
  });

  it("defaults assignment primacy and limits project workflow states", () => {
    expect(
      projectAssignmentSchema.parse({
        projectId: randomUUID(),
        employeeId: randomUUID(),
        role: "PROJECT_MANAGER",
      }),
    ).toMatchObject({ role: "PROJECT_MANAGER", isPrimary: false });
    expect(
      projectStatusSchema.safeParse({
        projectId: randomUUID(),
        status: "ON_HOLD",
      }).success,
    ).toBe(true);
    expect(
      projectStatusSchema.safeParse({
        projectId: randomUUID(),
        status: "ARCHIVED",
      }).success,
    ).toBe(false);
  });
});

describe("Phase 2 catalog validation", () => {
  it("coerces stock values and accepts a reorder level at the minimum", () => {
    const result = materialSchema.parse({
      materialCode: " cement_opc ",
      name: " OPC Cement ",
      categoryId: randomUUID(),
      defaultUnitId: randomUUID(),
      minimumStockLevel: "10.25",
      reorderLevel: "10.25",
    });

    expect(result).toMatchObject({
      materialCode: "CEMENT_OPC",
      name: "OPC Cement",
      minimumStockLevel: 10.25,
      reorderLevel: 10.25,
    });
  });

  it("rejects negative stock and a reorder level below the minimum", () => {
    const negative = materialSchema.safeParse({
      materialCode: "MAT-001",
      name: "Steel Rod",
      categoryId: randomUUID(),
      defaultUnitId: randomUUID(),
      minimumStockLevel: -1,
      reorderLevel: 5,
    });
    const belowMinimum = materialSchema.safeParse({
      materialCode: "MAT-002",
      name: "Steel Plate",
      categoryId: randomUUID(),
      defaultUnitId: randomUUID(),
      minimumStockLevel: 10,
      reorderLevel: 9.999,
    });

    expect(negative.success).toBe(false);
    if (!negative.success) {
      expect(negative.error.flatten().fieldErrors).toHaveProperty(
        "minimumStockLevel",
      );
    }
    expect(belowMinimum.success).toBe(false);
    if (!belowMinimum.success) {
      expect(belowMinimum.error.flatten().fieldErrors).toMatchObject({
        reorderLevel: ["Reorder level cannot be below minimum stock."],
      });
    }
  });

  it("coerces valid UOM precision and rejects fractional or excessive scales", () => {
    const base = {
      code: "KG",
      name: "Kilogram",
      symbol: "kg",
    };

    expect(unitSchema.parse({ ...base, decimalScale: "3" }).decimalScale).toBe(
      3,
    );
    expect(unitSchema.safeParse({ ...base, decimalScale: "2.5" }).success).toBe(
      false,
    );
    expect(unitSchema.safeParse({ ...base, decimalScale: 7 }).success).toBe(
      false,
    );
  });

  it("normalizes GSTIN and requires it only for registered suppliers", () => {
    const registered = supplierSchema.parse({
      supplierCode: " sup-001 ",
      legalName: " Acme Materials Private Limited ",
      gstin: "27aaacs1234a1z1",
      city: " Mumbai ",
      state: " Maharashtra ",
      postalCode: "400001",
      email: "accounts@acme.test",
      isGstRegistered: true,
    });
    const missingGstin = supplierSchema.safeParse({
      supplierCode: "SUP-002",
      legalName: "Bharat Materials",
      city: "Delhi",
      state: "Delhi",
      isGstRegistered: true,
    });
    const unregistered = supplierSchema.safeParse({
      supplierCode: "SUP-003",
      legalName: "Local Aggregate Depot",
      city: "Jaipur",
      state: "Rajasthan",
    });

    expect(registered).toMatchObject({
      supplierCode: "SUP-001",
      legalName: "Acme Materials Private Limited",
      gstin: "27AAACS1234A1Z1",
      city: "Mumbai",
      state: "Maharashtra",
    });
    expect(missingGstin.success).toBe(false);
    if (!missingGstin.success) {
      expect(missingGstin.error.flatten().fieldErrors).toMatchObject({
        gstin: ["GSTIN is required for a GST-registered supplier."],
      });
    }
    expect(unregistered.success).toBe(true);
    if (unregistered.success) {
      expect(unregistered.data.isGstRegistered).toBe(false);
      expect(unregistered.data.gstin).toBeUndefined();
    }
  });

  it("rejects malformed GSTIN, postal code, and supplier email", () => {
    const result = supplierSchema.safeParse({
      supplierCode: "SUP-004",
      legalName: "Invalid Supplier",
      gstin: "NOT-A-GSTIN",
      city: "Chennai",
      state: "Tamil Nadu",
      postalCode: "6000",
      email: "invalid-email",
      isGstRegistered: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toMatchObject({
        gstin: expect.any(Array),
        postalCode: expect.any(Array),
        email: expect.any(Array),
      });
    }
  });
});
