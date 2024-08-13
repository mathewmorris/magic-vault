/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import fetch from 'node-fetch';
import Batch from 'stream-json/utils/Batch';
import StreamArray from 'stream-json/streamers/StreamArray';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { chain } from 'stream-chain';
import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { Prisma } from '@prisma/client'
import type { Card, PrismaClient, PrismaPromise } from '@prisma/client';

interface CardDataJson {
  uri: string;
  name: string;
  description: string;
  size: number;
  download_uri: string;
  content_type: string;
  content_encoding: string;
}

interface CardData {
  id: string;
  uri: string;
  name: string;
  layout: string;
  image_status: string;
  image_uris: {
    small: string;
    normal: string;
    large: string;
    png: string;
    art_crop: string;
    border_crop: string;
  };
  scryfall_uri: string;
}

export const migrationRouter = createTRPCRouter({
  runSimpleMigration: protectedProcedure.input(z.string().min(0)).query(async ({ ctx, input }) =>  { 
    return await simpleMigrate(ctx.prisma);
  }),
});

async function downloadJsonFile(url: string, path: string): Promise<void> {
  const response = await fetch(url);
  const fileStream = createWriteStream(path);
  response.body?.pipe(fileStream);
  return new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
  });
}

interface CardFromFile {
  key: number;
  value: CardData;
}

interface UpsertBatchResult {
  numberInserted: number;
  numberUpdated: number;
  numberSkipped: number;
}

interface CardsThatNeedUpdates {
  cardsToUpdate: CardFromFile[];
  cardsToCreate: CardFromFile[];
}

const findChangedCards = async (cardBatch: CardFromFile[], prisma: PrismaClient) : Promise<CardsThatNeedUpdates> => {
  const hashesToCheck = cardBatch.map(card => ({
    id: card.value.id,
    hash: hashJsonString(JSON.stringify(card.value)),
  }));

  console.dir(hashesToCheck);
  // Create a string that constructs the VALUES part of the query
  // Manually construct the VALUES part of the query
  const valuesString = hashesToCheck.map(h => `('${h.id}', '${h.hash}')`).join(', ');

  const query = `
    SELECT c.scryfall_id
    FROM "Card" c
    JOIN (
      VALUES ${valuesString}
    ) AS v(id, hash)
    ON c.scryfall_id = v.id
    WHERE c.hash != v.hash
  `;
  console.dir(query);

  const existingCards = await prisma.$queryRawUnsafe<{ scryfall_id: string }[]>(query);
  console.dir(existingCards);

  const ids = cardBatch.map(card => card.value.id);
  const cardBatchMap = new Map<string, CardData>();
  cardBatch.forEach(card => cardBatchMap.set(card.value.id, card.value));

  const cardsFound = await prisma.card.findMany({
    where: {
      scryfall_id: {
        in: ids
      },
    }
  });

  const missingCards = cardBatch.filter(card => !cardsFound.map(card => card.scryfall_id).includes(card.value.id));
  const upsertCards = cardBatch.filter(card => existingCards.map(card => card.scryfall_id).includes(card.value.id));

  return {
    cardsToUpdate: upsertCards,
    cardsToCreate: missingCards
  };
}

const updateBatch = async (cardBatch: CardFromFile[], prisma: PrismaClient) : Promise<number> => {
  const updates = [];
  for (const card of cardBatch) {
    const cardData = card.value;
    updates.push(prisma.card.update({
          where: {
            scryfall_id: cardData.id
          },
          data: {
            name: cardData.name,
            layout: cardData.layout,
            image_status: cardData.image_status,
            image_uris: cardData.image_uris,
            scryfall_uri: cardData.scryfall_uri,
            hash: hashJsonString(JSON.stringify(cardData))
          }
        }));
    }
  const updated = await prisma.$transaction(updates);
  return updated.length;
}

const createBatch = async (cardBatch: CardFromFile[], prisma: PrismaClient) : Promise<number> => {
  const created = await prisma.card.createMany({
    data: cardBatch.map(card => ({
      name: card.value.name,
      scryfall_id: card.value.id,
      layout: card.value.layout,
      image_status: card.value.image_status,
      image_uris: card.value.image_uris,
      scryfall_uri: card.value.scryfall_uri,
      hash: hashJsonString(JSON.stringify(card.value))
    }))
  });
  return created.count;
}

function hashString(str: string): number {
  let hash = 0, i: number, chr: number;
  if (str.length === 0) return hash;
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function hashJsonString(jsonString: string): string | null {
  try {
    // Parse the JSON string
    const jsonObject = JSON.parse(jsonString);
    // Stringify the JSON object to ensure consistent format
    const normalizedString = JSON.stringify(jsonObject);
    // Hash the normalized string
    return hashString(normalizedString).toString();
  } catch (e) {
    console.error("Invalid JSON string:", e);
    return null;
  }
}

interface MigrateResult {
  batchResults: UpsertBatchResult[];
  totalInserted: number;
  totalUpdated: number;
  duration: number;
  totalProcessed: number;
}

async function simpleMigrate(prisma: PrismaClient): Promise<MigrateResult> {

  const start = new Date().getTime();

  const response = await fetch('https://api.scryfall.com/bulk-data/default-cards');
  const metadata: CardDataJson = await response.json() as CardDataJson;
  const filename = metadata.download_uri.split('/').pop();
  const folder = process.cwd();
  const filePath = `${folder}/batch_data/${filename}`;
  console.log(filePath);
  if (!existsSync(filePath)) {
    console.log(`Downloading file ${filename}`);
    await downloadJsonFile(metadata.download_uri, filePath);
  };

  const streamPipeline = chain([
    createReadStream(filePath),
    StreamArray.withParser(),
    new Batch({batchSize: 50})  ]);
  
  let done = false;
  const results: UpsertBatchResult[] = [];
  
  streamPipeline.on('data', data => {
    console.log('Batch size:', data.length);
    findChangedCards(data as CardFromFile[], prisma).then(
      staged => {
        Promise.all([
          updateBatch(staged.cardsToUpdate, prisma),
          createBatch(staged.cardsToCreate, prisma)
        ]).then(([updateResult, createResult]) => {
          results.push({
            numberInserted: createResult,
            numberUpdated: updateResult,
            numberSkipped: data.length - createResult - updateResult
          });
          // streamPipeline.resume();
        })
        .catch(err => {
          console.error('Error in upsertBatch:', err);
          streamPipeline.pause();
        });
      }
    ).catch(err => {
      console.error('Error in findChangedCards:', err);
      streamPipeline.pause();
    });
  });
  streamPipeline.on('end', () => {done=true; console.log('done');});

  while (!done) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('Migration complete');
  const end = new Date().getTime();
  const duration = end - start;
  return {
    totalProcessed: results.reduce((acc, result) => acc + result.numberInserted + result.numberUpdated + result.numberSkipped, 0),
    batchResults: results,
    totalInserted: results.reduce((acc, result) => acc + result.numberInserted, 0),
    totalUpdated: results.reduce((acc, result) => acc + result.numberUpdated, 0),
    duration: duration
  };
}
