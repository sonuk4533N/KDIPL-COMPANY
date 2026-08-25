CREATE TYPE "RequestForQuotationStatus" AS ENUM ('DRAFT');

CREATE TABLE "RequestForQuotation" (
    "id" UUID NOT NULL,
    "rfqNumber" VARCHAR(30) NOT NULL,
    "requirementId" UUID NOT NULL,
    "status" "RequestForQuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "responseDueDate" DATE NOT NULL,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestForQuotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RequestForQuotationSupplier" (
    "rfqId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestForQuotationSupplier_pkey" PRIMARY KEY ("rfqId", "supplierId")
);

CREATE UNIQUE INDEX "RequestForQuotation_rfqNumber_key" ON "RequestForQuotation"("rfqNumber");
CREATE INDEX "RequestForQuotation_requirementId_status_idx" ON "RequestForQuotation"("requirementId", "status");
CREATE INDEX "RequestForQuotation_status_responseDueDate_idx" ON "RequestForQuotation"("status", "responseDueDate");
CREATE INDEX "RequestForQuotation_createdById_createdAt_idx" ON "RequestForQuotation"("createdById", "createdAt");
CREATE INDEX "RequestForQuotationSupplier_supplierId_idx" ON "RequestForQuotationSupplier"("supplierId");
CREATE INDEX "RequestForQuotationSupplier_rfqId_isActive_idx" ON "RequestForQuotationSupplier"("rfqId", "isActive");

ALTER TABLE "RequestForQuotation" ADD CONSTRAINT "RequestForQuotation_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "MaterialRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestForQuotation" ADD CONSTRAINT "RequestForQuotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestForQuotationSupplier" ADD CONSTRAINT "RequestForQuotationSupplier_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RequestForQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestForQuotationSupplier" ADD CONSTRAINT "RequestForQuotationSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
