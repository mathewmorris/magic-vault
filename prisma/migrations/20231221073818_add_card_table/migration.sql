/*
  Warnings:

  - Added the required column `description` to the `Collection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Collection` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Collection` ADD COLUMN `description` VARCHAR(191) NOT NULL,
    ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT 'My Collection',
    ADD COLUMN `userId` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `Card` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `scryfall_id` TEXT NOT NULL,
    `scryfall_uri` TEXT NOT NULL,
    `image_status` TEXT NOT NULL,
    `layout` TEXT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
