-- DropIndex
DROP INDEX "CardStash_data_idx";

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "hash" TEXT;
