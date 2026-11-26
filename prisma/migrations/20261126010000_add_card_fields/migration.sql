-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "artist" TEXT,
ADD COLUMN     "cmc" DOUBLE PRECISION,
ADD COLUMN     "collector_number" TEXT,
ADD COLUMN     "color_identity" JSONB,
ADD COLUMN     "colors" JSONB,
ADD COLUMN     "finishes" JSONB,
ADD COLUMN     "flavor_text" TEXT,
ADD COLUMN     "keywords" JSONB,
ADD COLUMN     "lang" TEXT,
ADD COLUMN     "legalities" JSONB,
ADD COLUMN     "loyalty" TEXT,
ADD COLUMN     "mana_cost" TEXT,
ADD COLUMN     "oracle_id" TEXT,
ADD COLUMN     "oracle_text" TEXT,
ADD COLUMN     "power" TEXT,
ADD COLUMN     "rarity" TEXT,
ADD COLUMN     "released_at" TEXT,
ADD COLUMN     "set" TEXT,
ADD COLUMN     "set_name" TEXT,
ADD COLUMN     "toughness" TEXT,
ADD COLUMN     "type_line" TEXT;

-- CreateIndex
CREATE INDEX "Card_oracle_id_idx" ON "Card"("oracle_id");

-- CreateIndex
CREATE INDEX "Card_set_collector_number_idx" ON "Card"("set", "collector_number");
