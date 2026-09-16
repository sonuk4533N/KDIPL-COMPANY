import "server-only";

import { db } from "@/db/prisma";
import { AuditService } from "@/server/audit/audit-service";
import { requireFinanceRole } from "@/server/finance/policy";
import type { AuthenticatedPrincipal } from "@/types/application";
import { taxRuleSchema } from "./finance-schemas";

export const TaxRuleService = {
  createVersion(
    principal: AuthenticatedPrincipal,
    raw: Parameters<typeof taxRuleSchema.parse>[0],
  ) {
    const input = taxRuleSchema.parse(raw);
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, ["ACCOUNTS_ADMIN"]);
      const version = await tx.taxRuleVersion.create({
        data: {
          code: input.code,
          kind: input.kind,
          rate: input.rate,
          effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
          effectiveTo: input.effectiveTo
            ? new Date(`${input.effectiveTo}T00:00:00.000Z`)
            : undefined,
          settings: { caApprovalReference: input.approvalReference },
          approvedById: principal.userId,
          createdById: principal.userId,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: "CREATE",
          entityType: "TaxRuleVersion",
          entityId: version.id,
          after: {
            code: version.code,
            kind: version.kind,
            rate: version.rate,
            effectiveFrom: version.effectiveFrom,
            approvalReference: input.approvalReference,
          },
          reason: `CA approval: ${input.approvalReference}`,
        },
        tx,
      );
      return { id: version.id };
    });
  },
};
