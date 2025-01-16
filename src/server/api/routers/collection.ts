import { z } from "zod";
import { sub } from 'date-fns/sub';
import { isBefore } from 'date-fns/isBefore';

import {
  createTRPCRouter,
  cronProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { verifyCollectionOwnership } from "~/server/api/util";

type CardsOnCollectionConnection = {
  assignedBy: string;
  assignedAt: Date;
  count: number;
  card: {
    connect: {
      id: string;
    }
  }
}

function createCardCollectionConnectionArray(cards: Map<string, number>, assignedBy: string): CardsOnCollectionConnection[] {
  const cardsToConnect: CardsOnCollectionConnection[] = [];
  const assignedAt = new Date();

  cards.forEach((count, id) => {
    cardsToConnect.push({
      assignedBy,
      assignedAt,
      count,
      card: {
        connect: {
          id,
        },
      },
    });
  });

  return cardsToConnect;
}

export const collectionRouter = createTRPCRouter({
  getAll: protectedProcedure.query(({ ctx }) => {
    return ctx.prisma.collection.findMany({
      where: {
        userId: ctx.session.user.id,
        deletedAt: null,
      }
    })
  }),

  getDeleted: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.collection.findMany({
      where: {
        userId: ctx.session.user.id,
        deletedAt: {
          not: null
        },
      },
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.collection.findUnique({
        where: {
          id: input.id
        },
        include: {
          cards: {
            include: {
              card: true,
            },
          },
        }
      });
    }),

  create: protectedProcedure.input(z.object({
    name: z.string(),
    cards: z.map(z.string(), z.number()),
  }))
    .mutation(async ({ ctx, input }) => {
      const cardsToConnect = createCardCollectionConnectionArray(input.cards, ctx.session.user.name!);

      const collection = await ctx.prisma.collection.create({
        data: {
          name: input.name,
          cards: {
            create: cardsToConnect,
          },
          user: {
            connect: {
              id: ctx.session.user.id
            }
          }
        },
        include: {
          cards: true,
        }
      });

      return collection;
    }),

  rename: protectedProcedure.input(z.object({
    id: z.string(),
    name: z.string(),
  })).mutation(async ({ ctx, input: { id, name } }) => {
    const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, id)

    return await ctx.prisma.collection.update({
      where: {
        id: collection.id,
      },
      data: {
        name,
      }
    })
  }),
  setCardCount: protectedProcedure.input(z.object({
    collectionId: z.string(),
    cardId: z.string(),
    count: z.number(),
  })).mutation(async ({ ctx, input: { collectionId, cardId, count } }) => {
    const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, collectionId)

    if (count <= 0) {
      await ctx.prisma.cardsOnCollections.delete({
        where: {
          cardId_collectionId: {
            collectionId: collection.id,
            cardId,
          }
        }
      })
    } else {
      await ctx.prisma.cardsOnCollections.upsert({
        where: {
          cardId_collectionId: {
            collectionId: collection.id,
            cardId,
          }
        },
        create: {
          assignedBy: ctx.session.user.name!,
          assignedAt: new Date(),
          count,
          collection: {
            connect: {
              id: collection.id,
            },
          },
          card: {
            connect: {
              id: cardId,
            }
          }
        },
        update: {
          count: count,
        },
      })
    }

  }),

  softDelete: protectedProcedure.input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      return await ctx.prisma.collection.update({
        where: {
          id: collection.id,
        },
        data: {
          deletedAt: new Date(),
        }
      })
    }),

  recover: protectedProcedure.input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      return await ctx.prisma.collection.update({
        where: {
          id: collection.id,
        },
        data: {
          deletedAt: null,
        }
      })
    }),

  destroy: protectedProcedure.input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      return ctx.prisma.collection.delete({
        where: {
          id: collection.id,
        }
      })
    }),

  destroy30DaysOld: cronProcedure
    .mutation(async ({ ctx }) => {
      const thirtyDaysAgo = sub(new Date(), { days: 30 });
      const softDeletedCollections = await ctx.prisma.collection.findMany({
        where: {
          deletedAt: {
            not: null,
          },
        },
      })

      const readyToBeDeleted = softDeletedCollections.filter(({ deletedAt }) => {
        return deletedAt != null && isBefore(deletedAt, thirtyDaysAgo);
      })


      if (readyToBeDeleted.length > 0) {
        // attempt to delete list (if one doesn't exist, does query fail?)
        const deleted = await ctx.prisma.collection.deleteMany({
          where: {
            id: {
              in: readyToBeDeleted.map(collection => collection.id),
            }
          }
        });

        return deleted;
      } else {
        return { count: 0 };
      }
    }),
});

