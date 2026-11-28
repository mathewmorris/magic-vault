-- Prices move out of "Card" into their own small table, so the nightly sync
-- rewrites a ~200 byte price row instead of a ~2 KB card row when a price
-- moves. "Card"."prices" stays for now (nothing writes or reads it after this
-- release) and is dropped in a later migration.

-- CreateTable
CREATE TABLE "CardPrice" (
    "cardId" TEXT NOT NULL,
    "prices" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPrice_pkey" PRIMARY KEY ("cardId")
);

-- AddForeignKey
ALTER TABLE "CardPrice" ADD CONSTRAINT "CardPrice_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy the prices the cards already have.
INSERT INTO "CardPrice" ("cardId", "prices")
SELECT "id", "prices" FROM "Card" WHERE "prices" IS NOT NULL;
