/*
  Warnings:

  - You are about to drop the column `scryfall_id` on the `Card` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Card_scryfall_id_key";

-- AlterTable
ALTER TABLE "Card" DROP COLUMN "scryfall_id";
