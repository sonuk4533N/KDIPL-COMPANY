-- The workflow values and policy fields below implement the approval policy
-- confirmed by KDIPL on 2026-08-25.
ALTER TYPE "MaterialRequirementStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "MaterialRequirementStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "MaterialRequirementStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

CREATE TYPE "MaterialRequirementSubmitterRole" AS ENUM ('SITE_SUPERVISOR', 'PROJECT_MANAGER');
CREATE TYPE "MaterialRequirementWorkflowAction" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'SEND_BACK');

ALTER TABLE "MaterialRequirement"
ADD COLUMN "submittedById" UUID,
ADD COLUMN "submittedByRole" "MaterialRequirementSubmitterRole",
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "decidedById" UUID,
ADD COLUMN "decidedAt" TIMESTAMP(3),
ADD COLUMN "decisionReason" VARCHAR(1000);

ALTER TABLE "MaterialRequirement"
ADD CONSTRAINT "MaterialRequirement_workflow_state_check"
CHECK (
    (
        "status" = 'DRAFT'
        AND "submittedById" IS NULL
        AND "submittedByRole" IS NULL
        AND "submittedAt" IS NULL
        AND "decidedById" IS NULL
        AND "decidedAt" IS NULL
        AND "decisionReason" IS NULL
    )
    OR (
        "status" = 'SUBMITTED'
        AND "submittedById" IS NOT NULL
        AND "submittedByRole" IS NOT NULL
        AND "submittedAt" IS NOT NULL
        AND "decidedById" IS NULL
        AND "decidedAt" IS NULL
        AND "decisionReason" IS NULL
    )
    OR (
        "status" = 'APPROVED'
        AND "submittedById" IS NOT NULL
        AND "submittedByRole" IS NOT NULL
        AND "submittedAt" IS NOT NULL
        AND "decidedById" IS NOT NULL
        AND "decidedAt" IS NOT NULL
    )
    OR (
        "status" = 'REJECTED'
        AND "submittedById" IS NOT NULL
        AND "submittedByRole" IS NOT NULL
        AND "submittedAt" IS NOT NULL
        AND "decidedById" IS NOT NULL
        AND "decidedAt" IS NOT NULL
        AND LENGTH(BTRIM("decisionReason")) > 0
    )
);

CREATE TABLE "MaterialRequirementWorkflowEvent" (
    "id" UUID NOT NULL,
    "requirementId" UUID NOT NULL,
    "action" "MaterialRequirementWorkflowAction" NOT NULL,
    "fromStatus" "MaterialRequirementStatus" NOT NULL,
    "toStatus" "MaterialRequirementStatus" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialRequirementWorkflowEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaterialRequirementWorkflowEvent_transition_check" CHECK (
        ("action" = 'SUBMIT' AND "fromStatus" = 'DRAFT' AND "toStatus" = 'SUBMITTED')
        OR ("action" = 'APPROVE' AND "fromStatus" = 'SUBMITTED' AND "toStatus" = 'APPROVED')
        OR (
            "action" = 'REJECT'
            AND "fromStatus" = 'SUBMITTED'
            AND "toStatus" = 'REJECTED'
            AND LENGTH(BTRIM("reason")) > 0
        )
        OR (
            "action" = 'SEND_BACK'
            AND "fromStatus" = 'SUBMITTED'
            AND "toStatus" = 'DRAFT'
            AND LENGTH(BTRIM("reason")) > 0
        )
    )
);

CREATE INDEX "MaterialRequirement_submittedById_submittedAt_idx" ON "MaterialRequirement"("submittedById", "submittedAt");
CREATE INDEX "MaterialRequirement_decidedById_decidedAt_idx" ON "MaterialRequirement"("decidedById", "decidedAt");
CREATE INDEX "MaterialRequirementWorkflowEvent_requirementId_createdAt_idx" ON "MaterialRequirementWorkflowEvent"("requirementId", "createdAt");
CREATE INDEX "MaterialRequirementWorkflowEvent_actorUserId_createdAt_idx" ON "MaterialRequirementWorkflowEvent"("actorUserId", "createdAt");
CREATE INDEX "MaterialRequirementWorkflowEvent_action_createdAt_idx" ON "MaterialRequirementWorkflowEvent"("action", "createdAt");

ALTER TABLE "MaterialRequirement" ADD CONSTRAINT "MaterialRequirement_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequirement" ADD CONSTRAINT "MaterialRequirement_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequirementWorkflowEvent" ADD CONSTRAINT "MaterialRequirementWorkflowEvent_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "MaterialRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequirementWorkflowEvent" ADD CONSTRAINT "MaterialRequirementWorkflowEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
