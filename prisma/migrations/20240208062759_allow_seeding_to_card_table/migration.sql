/*
  Warnings:

  - A unique constraint covering the columns `[scryfall_id]` on the table `Card` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Card` MODIFY `scryfall_id` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Card_scryfall_id_key` ON `Card`(`scryfall_id`);
