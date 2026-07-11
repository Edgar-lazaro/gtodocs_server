CREATE TABLE "glpi_validacion_decisiones" (
    "id" BIGSERIAL NOT NULL,
    "validationId" INTEGER NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "solutionId" INTEGER,
    "approved" BOOLEAN NOT NULL,
    "glpiUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "glpi_validacion_decisiones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "glpi_validacion_decisiones_validationId_key" ON "glpi_validacion_decisiones"("validationId");
