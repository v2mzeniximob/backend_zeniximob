-- AlterTable
ALTER TABLE "Broker" ADD COLUMN     "profileImageUrl" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "isHighlighted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RealEstate" ADD COLUMN     "aboutText" TEXT,
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "footerText" TEXT,
ADD COLUMN     "heroImageUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "whatsappDisplay" TEXT;
