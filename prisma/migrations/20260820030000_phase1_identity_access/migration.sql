-- Phase 1 identity and organization lifecycle
ALTER TABLE "User"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "departmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Employee" ADD COLUMN "positionId" UUID;

CREATE UNIQUE INDEX "Position_code_key" ON "Position"("code");
CREATE UNIQUE INDEX "Position_name_key" ON "Position"("name");
CREATE INDEX "Position_departmentId_idx" ON "Position"("departmentId");
CREATE INDEX "Position_isActive_idx" ON "Position"("isActive");
CREATE INDEX "Employee_positionId_idx" ON "Employee"("positionId");

ALTER TABLE "Position" ADD CONSTRAINT "Position_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey"
FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
