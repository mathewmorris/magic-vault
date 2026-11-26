import { type Collection, type User } from "@prisma/client";

import { appRouter } from "~/server/api/root";
import { createInnerTRPCContext } from "~/server/api/trpc";
import { prisma } from "~/server/db";

let counter = 0;
const nextId = () => `${Date.now()}-${++counter}`;

export const createUser = (data: Partial<User> = {}) =>
  prisma.user.create({
    data: {
      name: "Test User",
      email: `user-${nextId()}@example.test`,
      ...data,
    },
  });

export const createCollection = (
  userId: string,
  data: Partial<Omit<Collection, "userId">> = {},
) =>
  prisma.collection.create({
    data: {
      name: "Test Collection",
      cards: [],
      ...data,
      userId,
    },
  });

/** A tRPC caller signed in as `userId`, backed by the real Prisma client. */
export const callerFor = (userId: string) =>
  appRouter.createCaller(
    createInnerTRPCContext({
      session: { user: { id: userId, name: "Test User" }, expires: "1" },
    }),
  );

export { prisma };
