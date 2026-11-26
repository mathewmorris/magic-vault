/**
 * In-process Postgres (PGlite + pgvector + pg_trgm) with every Prisma migration
 * applied, for unit tests of raw SQL. Boots in about two seconds, so create
 * one per test file in beforeAll.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite-pgvector";

import type { SqlExecutor, SqlTransaction } from "../server/recognition/matchEmbeddings";

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "prisma", "migrations");

export async function createMigratedDatabase(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { vector, pg_trgm } });
  const folders = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const folder of folders) {
    await db.exec(readFileSync(path.join(MIGRATIONS_DIR, folder, "migration.sql"), "utf8"));
  }
  return db;
}

type Queryable = Pick<PGlite, "query">;

export function pgliteExecutor(db: Queryable): SqlExecutor {
  return async <Row>(sql: string, params: unknown[]) => (await db.query<Row>(sql, params)).rows;
}

export function pgliteTransaction(db: PGlite): SqlTransaction {
  return (fn) => db.transaction((tx) => fn(pgliteExecutor(tx)));
}
