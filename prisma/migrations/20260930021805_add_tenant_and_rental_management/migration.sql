-- CreateTable
CREATE TABLE "MasterAdmin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "modules" JSONB NOT NULL,
    "hasSupport" BOOLEAN NOT NULL DEFAULT false,
    "supportPrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Franchisee" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "corporateName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "stateRegistration" TEXT,
    "cityRegistration" TEXT,
    "cep" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "respName" TEXT NOT NULL,
    "respCpf" TEXT NOT NULL,
    "respAddress" TEXT NOT NULL,
    "respPhone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "contractUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Franchisee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealEstate" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "corporateName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "stateRegistration" TEXT NOT NULL,
    "cityRegistration" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "respName" TEXT NOT NULL,
    "respCpf" TEXT NOT NULL,
    "respPhone" TEXT NOT NULL,
    "respAddress" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "contractUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "planId" TEXT NOT NULL,
    "franchiseeId" TEXT,

    CONSTRAINT "RealEstate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "creci" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "realEstateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "transaction" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "condoFee" DOUBLE PRECISION DEFAULT 0,
    "iptu" DOUBLE PRECISION DEFAULT 0,
    "area" DOUBLE PRECISION NOT NULL,
    "bedrooms" INTEGER NOT NULL DEFAULT 0,
    "bathrooms" INTEGER NOT NULL DEFAULT 0,
    "garage" INTEGER NOT NULL DEFAULT 0,
    "yearBuilt" INTEGER,
    "amenities" TEXT[],
    "cep" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "description" TEXT,
    "imageUrls" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "realEstateId" TEXT NOT NULL,
    "brokerId" TEXT,
    "rentStatus" TEXT DEFAULT 'Vago',
    "inspectionUrl" TEXT,
    "contractUrl" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "interest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Novo',
    "notes" TEXT,
    "propertyId" TEXT,
    "realEstateId" TEXT NOT NULL,
    "brokerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "currentAddress" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "documentUrl" TEXT,
    "maritalStatus" TEXT NOT NULL,
    "spouseName" TEXT,
    "spouseCpf" TEXT,
    "spouseDocUrl" TEXT,
    "guarantorName" TEXT,
    "guarantorCpf" TEXT,
    "guarantorDocUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "realEstateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterAdmin_email_key" ON "MasterAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Franchisee_cnpj_key" ON "Franchisee"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Franchisee_email_key" ON "Franchisee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RealEstate_cnpj_key" ON "RealEstate"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "RealEstate_slug_key" ON "RealEstate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RealEstate_email_key" ON "RealEstate"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Broker_cpf_key" ON "Broker"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Broker_email_key" ON "Broker"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_cpf_key" ON "tenants"("cpf");

-- AddForeignKey
ALTER TABLE "RealEstate" ADD CONSTRAINT "RealEstate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealEstate" ADD CONSTRAINT "RealEstate_franchiseeId_fkey" FOREIGN KEY ("franchiseeId") REFERENCES "Franchisee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_realEstateId_fkey" FOREIGN KEY ("realEstateId") REFERENCES "RealEstate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_realEstateId_fkey" FOREIGN KEY ("realEstateId") REFERENCES "RealEstate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_realEstateId_fkey" FOREIGN KEY ("realEstateId") REFERENCES "RealEstate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_realEstateId_fkey" FOREIGN KEY ("realEstateId") REFERENCES "RealEstate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
