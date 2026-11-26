-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "prices" JSONB,
ADD COLUMN     "purchase_uris" JSONB;

-- AlterTable
ALTER TABLE "CardsOnCollections" DROP CONSTRAINT "CardsOnCollections_pkey",
ADD COLUMN     "finish" TEXT NOT NULL DEFAULT 'nonfoil',
ADD CONSTRAINT "CardsOnCollections_pkey" PRIMARY KEY ("collectionId", "cardId", "finish");
