/** Adapters from Prisma's raw query API to the executor matchEmbeddings takes. */

import { type PrismaClient } from "@prisma/client";

import { type SqlExecutor, type SqlTransaction } from "./matchEmbeddings";

type RawClient = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export function prismaExecutor(client: RawClient): SqlExecutor {
  return async <Row>(sql: string, params: unknown[]) => {
    // SET returns no result set; run it as a command.
    if (/^\s*SET\s/i.test(sql)) {
      await client.$executeRawUnsafe(sql, ...params);
      return [];
    }
    return client.$queryRawUnsafe<Row[]>(sql, ...params);
  };
}

export function prismaTransaction(prisma: Pick<PrismaClient, "$transaction">): SqlTransaction {
  return (fn) => prisma.$transaction((tx) => fn(prismaExecutor(tx)));
}
