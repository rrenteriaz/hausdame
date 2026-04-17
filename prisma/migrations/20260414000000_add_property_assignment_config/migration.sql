-- CreateTable: PropertyAssignmentConfig
-- Almacena el ejecutor preferido que el TL define para recibir automáticamente
-- las limpiezas de una propiedad específica.

CREATE TABLE "PropertyAssignmentConfig" (
    "id" TEXT NOT NULL,
    "hostTenantId" TEXT NOT NULL,
    "servicesTenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "preferredMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyAssignmentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAssignmentConfig_propertyId_teamId_key" ON "PropertyAssignmentConfig"("propertyId", "teamId");
CREATE INDEX "PropertyAssignmentConfig_hostTenantId_idx" ON "PropertyAssignmentConfig"("hostTenantId");
CREATE INDEX "PropertyAssignmentConfig_servicesTenantId_idx" ON "PropertyAssignmentConfig"("servicesTenantId");
CREATE INDEX "PropertyAssignmentConfig_teamId_idx" ON "PropertyAssignmentConfig"("teamId");

-- AddForeignKey
ALTER TABLE "PropertyAssignmentConfig" ADD CONSTRAINT "PropertyAssignmentConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyAssignmentConfig" ADD CONSTRAINT "PropertyAssignmentConfig_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyAssignmentConfig" ADD CONSTRAINT "PropertyAssignmentConfig_preferredMembershipId_fkey" FOREIGN KEY ("preferredMembershipId") REFERENCES "TeamMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
