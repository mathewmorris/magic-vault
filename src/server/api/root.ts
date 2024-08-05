import { createTRPCRouter } from "~/server/api/trpc";

import { collectionRouter } from "~/server/api/routers/collection";
import { cardRouter } from "~/server/api/routers/card";
import { migrationRouter } from "~/server/api/routers/migration";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  collection: collectionRouter,
  card: cardRouter,
  migration: migrationRouter
});

// export type definition of API
export type AppRouter = typeof appRouter;
