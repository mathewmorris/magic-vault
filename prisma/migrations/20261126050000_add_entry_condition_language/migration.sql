-- AlterTable
ALTER TABLE "CardsOnCollections" ADD COLUMN     "condition" TEXT NOT NULL DEFAULT 'NM',
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';
