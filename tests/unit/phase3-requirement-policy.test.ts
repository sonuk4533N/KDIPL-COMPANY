import { describe, expect, it } from "vitest";

import {
  canDecideRequirement,
  resolveRequirementSubmitterRole,
  type RequirementPolicyFacts,
} from "@/features/requirements/requirement-policy";
import type { AuthenticatedPrincipal } from "@/types/application";

function principal(
  values: Partial<AuthenticatedPrincipal> = {},
): AuthenticatedPrincipal {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "Workflow User",
    email: "workflow@kdipl.test",
    employeeId: "22222222-2222-4222-8222-222222222222",
    mustChangePassword: false,
    roleCodes: [],
    permissions: [
      "material_requirement.view",
      "material_requirement.create",
      "material_requirement.approve",
    ],
    ...values,
  };
}

function facts(
  values: Partial<RequirementPolicyFacts> = {},
): RequirementPolicyFacts {
  return {
    status: "DRAFT",
    createdById: "33333333-3333-4333-8333-333333333333",
    submittedById: null,
    submittedByRole: null,
    isProjectManagerAssigned: false,
    isSiteSupervisorAssigned: false,
    ...values,
  };
}

describe("Phase 3 requirement approval policy", () => {
  it("allows assigned supervisors and managers to submit, preferring manager authority", () => {
    expect(
      resolveRequirementSubmitterRole(
        principal(),
        facts({ isSiteSupervisorAssigned: true }),
      ),
    ).toBe("SITE_SUPERVISOR");
    expect(
      resolveRequirementSubmitterRole(
        principal(),
        facts({
          isSiteSupervisorAssigned: true,
          isProjectManagerAssigned: true,
        }),
      ),
    ).toBe("PROJECT_MANAGER");
  });

  it("requires a different assigned project manager for supervisor submissions", () => {
    const submitted = facts({
      status: "SUBMITTED",
      submittedById: "44444444-4444-4444-8444-444444444444",
      submittedByRole: "SITE_SUPERVISOR",
      isProjectManagerAssigned: true,
    });
    expect(canDecideRequirement(principal(), submitted)).toBe(true);
    expect(
      canDecideRequirement(
        principal({ userId: submitted.submittedById! }),
        submitted,
      ),
    ).toBe(false);
    expect(
      canDecideRequirement(
        principal({ userId: submitted.createdById }),
        submitted,
      ),
    ).toBe(false);
  });

  it("routes manager submissions to a project director and blocks system admins", () => {
    const submitted = facts({
      status: "SUBMITTED",
      submittedById: "44444444-4444-4444-8444-444444444444",
      submittedByRole: "PROJECT_MANAGER",
    });
    expect(
      canDecideRequirement(
        principal({ roleCodes: ["PROJECT_DIRECTOR"] }),
        submitted,
      ),
    ).toBe(true);
    expect(
      canDecideRequirement(
        principal({
          roleCodes: ["PROJECT_DIRECTOR", "SYSTEM_ADMINISTRATOR"],
        }),
        submitted,
      ),
    ).toBe(false);
  });
});
