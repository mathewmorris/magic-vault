import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { ACHIEVEMENT_KEYS } from "~/utils/achievements/achievements";

export const achievementRouter = createTRPCRouter({
  // The achievements the signed-in user has earned, oldest first.
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.userAchievement.findMany({
      where: { userId: ctx.session.user.id },
      select: { key: true, earnedAt: true },
      orderBy: { earnedAt: "asc" },
    }),
  ),

  // Earn an achievement. Earning one twice keeps the first date.
  unlock: protectedProcedure
    .input(z.object({ key: z.enum(ACHIEVEMENT_KEYS) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.prisma.userAchievement.findUnique({
        where: { userId_key: { userId, key: input.key } },
        select: { key: true, earnedAt: true },
      });
      if (existing) return { ...existing, isNew: false };

      const earned = await ctx.prisma.userAchievement.upsert({
        where: { userId_key: { userId, key: input.key } },
        create: { userId, key: input.key },
        update: {},
        select: { key: true, earnedAt: true },
      });
      return { ...earned, isNew: true };
    }),
});
