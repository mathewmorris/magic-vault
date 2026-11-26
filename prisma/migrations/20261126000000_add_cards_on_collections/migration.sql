-- CreateTable
CREATE TABLE "CardsOnCollections" (
    "collectionId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardsOnCollections_pkey" PRIMARY KEY ("collectionId","cardId")
);

-- AddForeignKey
ALTER TABLE "CardsOnCollections" ADD CONSTRAINT "CardsOnCollections_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy existing cards over from "Collection"."cards". Each id becomes one row,
-- and repeats of the same id become its count. createdAt is offset by the
-- position the card first appeared at, so cards keep the order they were added in.
-- The old "cards" column is left in place untouched.
INSERT INTO "CardsOnCollections" ("collectionId", "cardId", "count", "createdAt", "updatedAt")
SELECT
    c."id",
    t."cardId",
    COUNT(*)::INTEGER,
    CURRENT_TIMESTAMP + (MIN(t."position") * INTERVAL '1 millisecond'),
    CURRENT_TIMESTAMP
FROM "Collection" c
CROSS JOIN LATERAL unnest(c."cards") WITH ORDINALITY AS t("cardId", "position")
WHERE t."cardId" IS NOT NULL AND t."cardId" <> ''
GROUP BY c."id", t."cardId";
