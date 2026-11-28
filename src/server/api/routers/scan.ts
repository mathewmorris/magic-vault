import { type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  findNearestCards,
  findPrinting,
  MAX_MATCH_LIMIT,
} from "~/server/recognition/matchEmbeddings";
import { prismaExecutor, prismaTransaction } from "~/server/recognition/prismaSql";
import { isFeatureEnabled } from "~/utils/featureFlags";
import { EMBED_MODEL } from "~/utils/recognition/model";
import { bestVariantIndex, topSimilarity } from "~/utils/recognition/variants";

/** The card fields the scanner shows for a match. */
export const scanCardSelect = {
  id: true,
  name: true,
  set: true,
  set_name: true,
  collector_number: true,
  lang: true,
  rarity: true,
  layout: true,
  image_uris: true,
  card_faces: true,
  // What the printing looks like, to check against the scanner's colour
  // cues (src/utils/recognition/colourCues.ts).
  border_color: true,
  frame: true,
  frame_effects: true,
  promo_types: true,
  finishes: true,
} satisfies Prisma.CardSelect;

export type ScanCard = Prisma.CardGetPayload<{ select: typeof scanCardSelect }>;

export type ScanMatch = { card: ScanCard; face: number; similarity: number };

export type ScanStatus = { enabled: boolean; modelId: string; indexed: number };

export type ScanMatchResult = {
  matches: ScanMatch[];
  printing: ScanCard | null;
  /**
   * Only when `alternates` were sent: which embedding `matches` came from
   * (0 = `embedding`, i = `alternates[i - 1]`), and the best similarity each
   * embedding reached (null when it found nothing), in the same order.
   */
  variant?: number;
  variantSimilarities?: (number | null)[];
};

/** How many extra embeddings (other orientations of the same card) one match call takes. */
export const MAX_MATCH_ALTERNATES = 3;

function assertScanEnabled() {
  if (!isFeatureEnabled("aiScan")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "AI scan is turned off" });
  }
}

export const scanRouter = createTRPCRouter({
  /** Whether AI scan is on, which model the server expects, and how many card faces it has indexed. */
  status: publicProcedure.query(async ({ ctx }): Promise<ScanStatus> => {
    const enabled = isFeatureEnabled("aiScan");
    const indexed = enabled
      ? await ctx.prisma.cardEmbedding.count({ where: { modelId: EMBED_MODEL.id } })
      : 0;
    return { enabled, modelId: EMBED_MODEL.id, indexed };
  }),

  /**
   * Cards whose image embeddings are closest to `embedding`, best first, plus
   * the exact printing when OCR read a set code and collector number.
   *
   * `alternates` are more embeddings of the same capture (the card turned
   * other ways, see src/utils/recognition/orientation.ts). Each one is
   * searched, and the matches of the one whose best match is most similar
   * come back, with its index as `variant` (ties go to `embedding`).
   */
  match: publicProcedure
    .meta({ description: "Match a card image embedding against the indexed card images." })
    .input(
      z.object({
        embedding: z.array(z.number().finite()).length(EMBED_MODEL.dims),
        alternates: z
          .array(z.array(z.number().finite()).length(EMBED_MODEL.dims))
          .max(MAX_MATCH_ALTERNATES)
          .optional(),
        modelId: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(MAX_MATCH_LIMIT).default(20),
        printing: z
          .object({
            set: z.string().trim().min(1).max(10),
            collectorNumber: z.string().trim().min(1).max(16),
            /** The name read off the title bar, to catch a clipped number. */
            name: z.string().trim().min(1).max(200).optional(),
          })
          .optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<ScanMatchResult> => {
      assertScanEnabled();
      if (input.modelId !== EMBED_MODEL.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This scanner is out of date. Reload the page to get the current card model.",
        });
      }

      const exec = prismaExecutor(ctx.prisma);
      const embeddings = [input.embedding, ...(input.alternates ?? [])];
      const [searches, printingRef] = await Promise.all([
        Promise.all(
          embeddings.map((embedding) =>
            findNearestCards(
              exec,
              { embedding, modelId: EMBED_MODEL.id, limit: input.limit },
              { transaction: prismaTransaction(ctx.prisma) },
            ),
          ),
        ),
        input.printing ? findPrinting(exec, input.printing) : Promise.resolve(null),
      ]);
      const variantSimilarities = searches.map((rows) => topSimilarity(rows));
      const variant = bestVariantIndex(variantSimilarities);
      const nearest = searches[variant] ?? [];

      const ids = [...new Set([...nearest.map((n) => n.cardId), ...(printingRef ? [printingRef.id] : [])])];
      const cards =
        ids.length > 0
          ? await ctx.prisma.card.findMany({ where: { id: { in: ids } }, select: scanCardSelect })
          : [];
      const byId = new Map(cards.map((card) => [card.id, card]));

      const matches: ScanMatch[] = [];
      for (const { cardId, face, similarity } of nearest) {
        const card = byId.get(cardId);
        if (card) matches.push({ card, face, similarity });
      }
      const printing = (printingRef && byId.get(printingRef.id)) ?? null;
      return input.alternates ? { matches, printing, variant, variantSimilarities } : { matches, printing };
    }),
});
