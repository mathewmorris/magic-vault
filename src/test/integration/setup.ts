import { afterAll, beforeEach } from "@jest/globals";

import { prisma } from "~/server/db";
import { assertTestDatabase } from "./assertTestDatabase";

assertTestDatabase(process.env.DATABASE_URL);

/** Every table in the public schema except Prisma's own migration history. */
const getTableNames = async () => {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  return rows.map(({ tablename }) => `"public"."${tablename}"`);
};

// Start every test from an empty database so tests can't leak into each other.
beforeEach(async () => {
  const tables = await getTableNames();
  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(", ")} CASCADE`);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
