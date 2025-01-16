/*
  Warnings:

  - Made the column `name` on table `Collection` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Collection" ALTER COLUMN "name" SET NOT NULL;
