import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  findProject: vi.fn(),
  findSite: vi.fn(),
}));

vi.mock("@/db/prisma", () => ({
  db: {
    project: { findFirst: database.findProject },
    site: { findFirst: database.findSite },
  },
}));

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
  mustChangePassword: false,
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

  it("defaults resource scope to denial except for the bootstrap administrator", async () => {
    await expect(canAccessProject(principal, "project-1")).resolves.toBe(true);
    expect(
      await canAccessSite(
        { ...principal, employeeId: null, roleCodes: ["SITE_SUPERVISOR"] },
        "site-1",
      ),
    ).toBe(false);
  });

  it("resolves non-administrator scope from active employee assignments", async () => {
    const assignedPrincipal: AuthenticatedPrincipal = {
      ...principal,
      employeeId: "123e4567-e89b-12d3-a456-426614174000",
      roleCodes: ["PROJECT_MANAGER"],
      permissions: ["app.access", "project.view", "site.view"],
    };
    database.findProject.mockResolvedValueOnce({ id: "project-1" });
    database.findSite.mockResolvedValueOnce(null);

    await expect(
      canAccessProject(assignedPrincipal, "project-1"),
    ).resolves.toBe(true);
    await expect(canAccessSite(assignedPrincipal, "site-2")).resolves.toBe(
      false,
    );
    expect(database.findProject).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true } }),
    );
  });
});
