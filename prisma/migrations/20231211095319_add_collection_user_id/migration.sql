/*
  Warnings:

  - Added the required column `userId` to the `Collection` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Collection` ADD COLUMN `userId` VARCHAR(191) NOT NULL;
