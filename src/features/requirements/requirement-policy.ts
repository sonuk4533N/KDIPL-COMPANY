import type { AuthenticatedPrincipal } from "@/types/application";

export type RequirementStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export type RequirementSubmitterRole = "SITE_SUPERVISOR" | "PROJECT_MANAGER";

export type RequirementPolicyFacts = {
  status: RequirementStatus;
  createdById: string;
  submittedById: string | null;
  submittedByRole: RequirementSubmitterRole | null;
  isProjectManagerAssigned: boolean;
  isSiteSupervisorAssigned: boolean;
};

export function resolveRequirementSubmitterRole(
  principal: AuthenticatedPrincipal,
  facts: RequirementPolicyFacts,
): RequirementSubmitterRole | null {
  if (
    facts.status !== "DRAFT" ||
    !principal.employeeId ||
    !principal.permissions.includes("material_requirement.create")
  ) {
    return null;
  }
  if (facts.isProjectManagerAssigned) return "PROJECT_MANAGER";
  if (facts.isSiteSupervisorAssigned) return "SITE_SUPERVISOR";
  return null;
}

export function canDecideRequirement(
  principal: AuthenticatedPrincipal,
  facts: RequirementPolicyFacts,
): boolean {
  if (
    facts.status !== "SUBMITTED" ||
    !facts.submittedByRole ||
    !principal.permissions.includes("material_requirement.approve") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") ||
    principal.userId === facts.createdById ||
    principal.userId === facts.submittedById
  ) {
    return false;
  }
  return facts.submittedByRole === "SITE_SUPERVISOR"
    ? facts.isProjectManagerAssigned
    : principal.roleCodes.includes("PROJECT_DIRECTOR");
}

export function requirementStatusLabel(
  status: RequirementStatus,
): "Draft" | "Submitted" | "Approved" | "Rejected" {
  return (
    {
      DRAFT: "Draft",
      SUBMITTED: "Submitted",
      APPROVED: "Approved",
      REJECTED: "Rejected",
    } as const
  )[status];
}
