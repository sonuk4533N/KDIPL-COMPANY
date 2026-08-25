-- Phase 3 starts with draft requirements only. Approval workflow enum values
-- are deliberately deferred until KDIPL confirms authority and segregation rules.
CREATE TYPE "MaterialRequirementStatus" AS ENUM ('DRAFT');

CREATE TABLE "MaterialRequirement" (
    "id" UUID NOT NULL,
    "requirementNumber" VARCHAR(30) NOT NULL,
    "projectId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "status" "MaterialRequirementStatus" NOT NULL DEFAULT 'DRAFT',
    "neededBy" DATE NOT NULL,
    "purpose" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialRequirementLine" (
    "id" UUID NOT NULL,
    "requirementId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "notes" VARCHAR(500),
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequirementLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MaterialRequirementLine"
ADD CONSTRAINT "MaterialRequirementLine_quantity_check" CHECK ("quantity" > 0),
ADD CONSTRAINT "MaterialRequirementLine_position_check" CHECK ("position" >= 0);

CREATE UNIQUE INDEX "Site_id_projectId_key" ON "Site"("id", "projectId");
CREATE UNIQUE INDEX "MaterialRequirement_requirementNumber_key" ON "MaterialRequirement"("requirementNumber");
CREATE INDEX "MaterialRequirement_projectId_status_neededBy_idx" ON "MaterialRequirement"("projectId", "status", "neededBy");
CREATE INDEX "MaterialRequirement_siteId_status_idx" ON "MaterialRequirement"("siteId", "status");
CREATE INDEX "MaterialRequirement_createdById_createdAt_idx" ON "MaterialRequirement"("createdById", "createdAt");
CREATE UNIQUE INDEX "MaterialRequirementLine_requirementId_materialId_key" ON "MaterialRequirementLine"("requirementId", "materialId");
CREATE INDEX "MaterialRequirementLine_requirementId_isActive_position_idx" ON "MaterialRequirementLine"("requirementId", "isActive", "position");
CREATE INDEX "MaterialRequirementLine_materialId_idx" ON "MaterialRequirementLine"("materialId");
CREATE INDEX "MaterialRequirementLine_unitId_idx" ON "MaterialRequirementLine"("unitId");

ALTER TABLE "MaterialRequirement" ADD CONSTRAINT "MaterialRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequirement" ADD CONSTRAINT "MaterialRequirement_siteId_projectId_fkey" FOREIGN KEY ("siteId", "projectId") REFERENCES "Site"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequirement" ADD CONSTRAINT "MaterialRequirement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequirementLine" ADD CONSTRAINT "MaterialRequirementLine_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "MaterialRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequirementLine" ADD CONSTRAINT "MaterialRequirementLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequirementLine" ADD CONSTRAINT "MaterialRequirementLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
