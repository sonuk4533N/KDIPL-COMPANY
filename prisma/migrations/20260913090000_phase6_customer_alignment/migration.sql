-- CreateTable
CREATE TABLE "CustomerStockMovement" (
    "id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    "sourceLocationId" UUID NOT NULL,
    "destinationLocationId" UUID,
    "materialId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "approvedQuantity" DECIMAL(18,3),
    "actualQuantity" DECIMAL(18,3),
    "bookQuantity" DECIMAL(18,3),
    "unitCost" DECIMAL(24,6),
    "reason" VARCHAR(1000) NOT NULL,
    "transitionReason" VARCHAR(1000) NOT NULL,
    "evidenceId" UUID,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "gpsCapturedAt" TIMESTAMP(3),
    "receiptLatitude" DECIMAL(9,6),
    "receiptLongitude" DECIMAL(9,6),
    "receiptGpsCapturedAt" TIMESTAMP(3),
    "category" VARCHAR(20),
    "direction" VARCHAR(3) NOT NULL DEFAULT 'OUT',
    "disposition" VARCHAR(10) NOT NULL DEFAULT 'DISPOSAL',
    "originalIssueId" UUID,
    "varianceOfId" UUID,
    "correctionOfId" UUID,
    "closureProjectId" UUID,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "approvedById" UUID,
    "dispatchedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMovementPosting" (
    "id" UUID NOT NULL,
    "movementId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "leg" VARCHAR(20) NOT NULL,
    "unitCost" DECIMAL(24,6) NOT NULL,

    CONSTRAINT "CustomerMovementPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStockClosure" (
    "projectId" UUID NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectStockClosure_pkey" PRIMARY KEY ("projectId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerStockMovement_number_key" ON "CustomerStockMovement"("number");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerStockMovement_varianceOfId_key" ON "CustomerStockMovement"("varianceOfId");

-- CreateIndex
CREATE INDEX "CustomerStockMovement_sourceLocationId_materialId_status_idx" ON "CustomerStockMovement"("sourceLocationId", "materialId", "status");

-- CreateIndex
CREATE INDEX "CustomerStockMovement_destinationLocationId_status_idx" ON "CustomerStockMovement"("destinationLocationId", "status");

-- CreateIndex
CREATE INDEX "CustomerStockMovement_originalIssueId_status_idx" ON "CustomerStockMovement"("originalIssueId", "status");

-- CreateIndex
CREATE INDEX "CustomerStockMovement_closureProjectId_status_idx" ON "CustomerStockMovement"("closureProjectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMovementPosting_transactionId_key" ON "CustomerMovementPosting"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMovementPosting_movementId_leg_key" ON "CustomerMovementPosting"("movementId", "leg");

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "FileRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_originalIssueId_fkey" FOREIGN KEY ("originalIssueId") REFERENCES "CustomerStockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_varianceOfId_fkey" FOREIGN KEY ("varianceOfId") REFERENCES "CustomerStockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "CustomerStockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerStockMovement_closureProjectId_fkey" FOREIGN KEY ("closureProjectId") REFERENCES "ProjectStockClosure"("projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMovementPosting" ADD CONSTRAINT "CustomerMovementPosting_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "CustomerStockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMovementPosting" ADD CONSTRAINT "CustomerMovementPosting_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "StockTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStockClosure" ADD CONSTRAINT "ProjectStockClosure_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStockClosure" ADD CONSTRAINT "ProjectStockClosure_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
