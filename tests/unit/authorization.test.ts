import { describe, expect, it } from "vitest";

import {
  canAccessProject,
  canAccessSite,
  hasPermission,
  requirePermission,
} from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import type { AuthenticatedPrincipal } from "@/types/application";

const principal: AuthenticatedPrincipal = {
  userId: "user-1",
  displayName: "Admin",
  email: "admin@kdipl.test",
  employeeId: null,
  roleCodes: ["SYSTEM_ADMINISTRATOR"],
  permissions: ["app.access", "user.manage"],
};

describe("authorization", () => {
  it("evaluates typed permissions", () => {
    expect(hasPermission(principal, "user.manage")).toBe(true);
    expect(hasPermission(principal, "inventory.adjust")).toBe(false);
  });

  it("denies missing principals and permissions", () => {
    expect(() => requirePermission(null, "app.access")).toThrowError(AppError);
    expect(() => requirePermission(principal, "role.manage")).toThrowError(
      AppError,
    );
  });

  it("defaults resource scope to denial except for the bootstrap administrator", () => {
    expect(canAccessProject(principal, "project-1")).toBe(true);
    expect(
      canAccessSite({ ...principal, roleCodes: ["SITE_SUPERVISOR"] }, "site-1"),
    ).toBe(false);
  });
});
