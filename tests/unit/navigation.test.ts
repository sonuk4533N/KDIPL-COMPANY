import { describe, expect, it } from "vitest";

import {
  canAccessNavigationItem,
  primaryNavigation,
  storeMobileNavigation,
} from "@/components/layout/navigation";
import type { PermissionCode } from "@/types/application";

function visibleLabels(permissions: PermissionCode[]) {
  return primaryNavigation
    .filter((item) => canAccessNavigationItem(item, permissions))
    .map((item) => item.label);
}

describe("permission-filtered navigation", () => {
  it("shows a Store Keeper only operational modules", () => {
    expect(
      visibleLabels(["app.access", "inventory.view", "inventory.receive"]),
    ).toEqual(["Dashboard", "Inventory", "Mobile work"]);
    expect(
      storeMobileNavigation
        .filter((item) =>
          canAccessNavigationItem(item, [
            "app.access",
            "inventory.view",
            "inventory.receive",
          ]),
        )
        .map((item) => item.label),
    ).toEqual(["Home", "Stock", "Capture", "Receive"]);
  });

  it("does not expose modules without at least one required permission", () => {
    expect(
      visibleLabels([
        "app.access",
        "project.view",
        "site.view",
        "material_requirement.view",
        "material_requirement.create",
      ]),
    ).toEqual(["Dashboard", "Projects", "Requirements", "Mobile work"]);
  });
});
