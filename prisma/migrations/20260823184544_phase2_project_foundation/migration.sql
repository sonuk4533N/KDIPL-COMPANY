-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectAssignmentRole" AS ENUM ('PROJECT_MANAGER', 'PROJECT_MEMBER');

-- CreateEnum
CREATE TYPE "SiteAssignmentRole" AS ENUM ('SITE_SUPERVISOR', 'SITE_MEMBER');

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "clientCode" VARCHAR(50) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "address" TEXT,
    "city" VARCHAR(120),
    "state" VARCHAR(120),
    "postalCode" VARCHAR(12),
    "phone" VARCHAR(30),
    "email" VARCHAR(320),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "projectCode" VARCHAR(50) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "clientId" UUID NOT NULL,
    "location" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "startDate" DATE,
    "expectedCompletionDate" DATE,
    "actualCompletionDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" UUID NOT NULL,
    "siteCode" VARCHAR(50) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "projectId" UUID NOT NULL,
    "location" VARCHAR(240) NOT NULL,
    "address" TEXT,
    "description" TEXT,
    "status" "SiteStatus" NOT NULL DEFAULT 'PLANNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAssignment" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "role" "ProjectAssignmentRole" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAssignment" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "role" "SiteAssignmentRole" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCategory" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "decimalScale" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "materialCode" VARCHAR(50) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "categoryId" UUID NOT NULL,
    "defaultUnitId" UUID NOT NULL,
    "minimumStockLevel" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "supplierCode" VARCHAR(50) NOT NULL,
    "legalName" VARCHAR(180) NOT NULL,
    "tradeName" VARCHAR(180),
    "gstin" VARCHAR(15),
    "address" TEXT,
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(120) NOT NULL,
    "postalCode" VARCHAR(12),
    "phone" VARCHAR(30),
    "email" VARCHAR(320),
    "isGstRegistered" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "designation" VARCHAR(120),
    "phone" VARCHAR(30),
    "email" VARCHAR(320),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- Domain constraints
ALTER TABLE "Client"
ADD CONSTRAINT "Client_postalCode_check"
CHECK ("postalCode" IS NULL OR "postalCode" ~ '^[0-9]{6}$');

ALTER TABLE "Project"
ADD CONSTRAINT "Project_dates_check"
CHECK (
    ("startDate" IS NULL OR "expectedCompletionDate" IS NULL OR "expectedCompletionDate" >= "startDate")
    AND ("startDate" IS NULL OR "actualCompletionDate" IS NULL OR "actualCompletionDate" >= "startDate")
);

ALTER TABLE "ProjectAssignment"
ADD CONSTRAINT "ProjectAssignment_lifecycle_check"
CHECK (
    ("isActive" AND "endsAt" IS NULL)
    OR (NOT "isActive" AND "endsAt" IS NOT NULL)
),
ADD CONSTRAINT "ProjectAssignment_dates_check"
CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt"),
ADD CONSTRAINT "ProjectAssignment_primary_check"
CHECK (
    NOT "isPrimary"
    OR ("isActive" AND "role" = 'PROJECT_MANAGER')
);

ALTER TABLE "SiteAssignment"
ADD CONSTRAINT "SiteAssignment_lifecycle_check"
CHECK (
    ("isActive" AND "endsAt" IS NULL)
    OR (NOT "isActive" AND "endsAt" IS NOT NULL)
),
ADD CONSTRAINT "SiteAssignment_dates_check"
CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt"),
ADD CONSTRAINT "SiteAssignment_primary_check"
CHECK (
    NOT "isPrimary"
    OR ("isActive" AND "role" = 'SITE_SUPERVISOR')
);

ALTER TABLE "UnitOfMeasure"
ADD CONSTRAINT "UnitOfMeasure_decimalScale_check"
CHECK ("decimalScale" BETWEEN 0 AND 6);

ALTER TABLE "Material"
ADD CONSTRAINT "Material_stockLevels_check"
CHECK (
    "minimumStockLevel" >= 0
    AND "reorderLevel" >= "minimumStockLevel"
);

ALTER TABLE "Supplier"
ADD CONSTRAINT "Supplier_gstRegistration_check"
CHECK (
    ("isGstRegistered" AND "gstin" IS NOT NULL)
    OR (NOT "isGstRegistered" AND "gstin" IS NULL)
),
ADD CONSTRAINT "Supplier_gstinFormat_check"
CHECK (
    "gstin" IS NULL
    OR "gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
),
ADD CONSTRAINT "Supplier_postalCode_check"
CHECK ("postalCode" IS NULL OR "postalCode" ~ '^[0-9]{6}$');

ALTER TABLE "SupplierContact"
ADD CONSTRAINT "SupplierContact_primary_check"
CHECK (NOT "isPrimary" OR "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Client_clientCode_key" ON "Client"("clientCode");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_isActive_name_idx" ON "Client"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_status_name_idx" ON "Project"("status", "name");

-- CreateIndex
CREATE INDEX "Project_startDate_expectedCompletionDate_idx" ON "Project"("startDate", "expectedCompletionDate");

-- CreateIndex
CREATE INDEX "Site_projectId_status_idx" ON "Site"("projectId", "status");

-- CreateIndex
CREATE INDEX "Site_status_name_idx" ON "Site"("status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Site_projectId_siteCode_key" ON "Site"("projectId", "siteCode");

-- CreateIndex
CREATE INDEX "ProjectAssignment_projectId_isActive_role_idx" ON "ProjectAssignment"("projectId", "isActive", "role");

-- CreateIndex
CREATE INDEX "ProjectAssignment_employeeId_isActive_idx" ON "ProjectAssignment"("employeeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAssignment_projectId_employeeId_role_key" ON "ProjectAssignment"("projectId", "employeeId", "role");

-- At most one active primary project manager can represent a project.
CREATE UNIQUE INDEX "ProjectAssignment_active_primary_manager_key"
ON "ProjectAssignment"("projectId")
WHERE "isActive" AND "isPrimary" AND "role" = 'PROJECT_MANAGER' AND "endsAt" IS NULL;

-- CreateIndex
CREATE INDEX "SiteAssignment_siteId_isActive_role_idx" ON "SiteAssignment"("siteId", "isActive", "role");

-- CreateIndex
CREATE INDEX "SiteAssignment_employeeId_isActive_idx" ON "SiteAssignment"("employeeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SiteAssignment_siteId_employeeId_role_key" ON "SiteAssignment"("siteId", "employeeId", "role");

-- At most one active primary site supervisor can represent a site.
CREATE UNIQUE INDEX "SiteAssignment_active_primary_supervisor_key"
ON "SiteAssignment"("siteId")
WHERE "isActive" AND "isPrimary" AND "role" = 'SITE_SUPERVISOR' AND "endsAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_code_key" ON "MaterialCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_name_key" ON "MaterialCategory"("name");

-- CreateIndex
CREATE INDEX "MaterialCategory_isActive_name_idx" ON "MaterialCategory"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_code_key" ON "UnitOfMeasure"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_name_key" ON "UnitOfMeasure"("name");

-- CreateIndex
CREATE INDEX "UnitOfMeasure_isActive_name_idx" ON "UnitOfMeasure"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Material_materialCode_key" ON "Material"("materialCode");

-- CreateIndex
CREATE INDEX "Material_categoryId_isActive_idx" ON "Material"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "Material_defaultUnitId_idx" ON "Material"("defaultUnitId");

-- CreateIndex
CREATE INDEX "Material_isActive_name_idx" ON "Material"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Material_name_defaultUnitId_key" ON "Material"("name", "defaultUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_supplierCode_key" ON "Supplier"("supplierCode");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_gstin_key" ON "Supplier"("gstin");

-- CreateIndex
CREATE INDEX "Supplier_isActive_legalName_idx" ON "Supplier"("isActive", "legalName");

-- CreateIndex
CREATE INDEX "Supplier_state_city_idx" ON "Supplier"("state", "city");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_legalName_city_key" ON "Supplier"("legalName", "city");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_isActive_idx" ON "SupplierContact"("supplierId", "isActive");

-- A supplier may have many contacts, but only one active primary contact.
CREATE UNIQUE INDEX "SupplierContact_active_primary_key"
ON "SupplierContact"("supplierId")
WHERE "isActive" AND "isPrimary";

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignment" ADD CONSTRAINT "ProjectAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignment" ADD CONSTRAINT "ProjectAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_defaultUnitId_fkey" FOREIGN KEY ("defaultUnitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
