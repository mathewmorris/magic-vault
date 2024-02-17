/*
  Warnings:

  - You are about to drop the `cards` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `cards`;

-- CreateTable
CREATE TABLE `Card` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `scryfall_id` VARCHAR(191) NOT NULL,
    `scryfall_uri` TEXT NOT NULL,
    `image_status` TEXT NOT NULL,
    `image_uris` JSON NULL,
    `card_faces` JSON NULL,
    `all_parts` JSON NULL,
    `layout` TEXT NOT NULL,

    UNIQUE INDEX `Card_scryfall_id_key`(`scryfall_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
