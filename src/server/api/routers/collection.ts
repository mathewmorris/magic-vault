import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

export const collectionRouter = createTRPCRouter({
  getAll: protectedProcedure.query(({ ctx }) => {
    return ctx.prisma.collection.findMany();
  }),
  create: protectedProcedure
  .input(z.object({ text: z.string() }))
  .mutation((opts) => {
    console.log(opts);
    return 'create';
  }),
});

