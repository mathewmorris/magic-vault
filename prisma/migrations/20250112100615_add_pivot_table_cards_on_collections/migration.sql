/*
  Warnings:

  - You are about to drop the column `cards` on the `Collection` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Collection" DROP COLUMN "cards";

-- CreateTable
CREATE TABLE "CardsOnCollections" (
    "cardId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,

    CONSTRAINT "CardsOnCollections_pkey" PRIMARY KEY ("cardId","collectionId")
);

-- AddForeignKey
ALTER TABLE "CardsOnCollections" ADD CONSTRAINT "CardsOnCollections_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardsOnCollections" ADD CONSTRAINT "CardsOnCollections_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
