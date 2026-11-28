-- Prices moved to "CardPrice" in 20261128070000_add_card_prices, and nothing
-- has read or written "Card"."prices" since. Dropping a column doesn't give
-- the space back by itself; VACUUM FULL "Card" does.

-- AlterTable
ALTER TABLE "Card" DROP COLUMN "prices";
