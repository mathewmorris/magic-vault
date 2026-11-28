import { createTRPCRouter } from "~/server/api/trpc";

import { collectionRouter } from "~/server/api/routers/collection";
import { cardRouter } from "~/server/api/routers/card";
import { deckRouter } from "~/server/api/routers/deck";
import { scanRouter } from "~/server/api/routers/scan";
import { achievementRouter } from "~/server/api/routers/achievement";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  collection: collectionRouter,
  card: cardRouter,
  deck: deckRouter,
  scan: scanRouter,
  achievement: achievementRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
