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
import type { PrismaClient } from '@prisma/client';

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
    await simpleMigrate(ctx.prisma);
    return {};
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



const upsertBatch = async (cardBatch: CardFromFile[], prisma: PrismaClient) => {
  const ids = cardBatch.map(card => card.value.id);
  const cardBatchMap = new Map<string, CardData>();
  cardBatch.forEach(card => cardBatchMap.set(card.value.id, card.value));

  const existingCards = await prisma.card.findMany({
    where: {
      scryfall_id: {
        in: ids
      }
    }
  });
  const existingCardIds = existingCards.map(card => card.scryfall_id);
  const cardsNeedUpdate = existingCards.filter(card => card.hash !== hashJsonString(JSON.stringify(cardBatchMap.get(card.scryfall_id))));
  const newCount = cardBatch.length - existingCardIds.length;
  const updateCount = cardsNeedUpdate.length;;
  if (newCount > 0 || updateCount > 0) {
    console.log(`Inserting ${cardBatch.length - existingCardIds.length} new cards and updating ${cardsNeedUpdate.length} existing cards`);
  } else {
    console.log("No changes to update for this batch");
  }
  const cardsToInsert = cardBatch.filter(card => !existingCardIds.includes(card.value.id));
  await prisma.card.createMany({
    data: cardsToInsert.map(card => ({
      name: card.value.name,
      scryfall_id: card.value.id,
      layout: card.value.layout,
      image_status: card.value.image_status,
      image_uris: card.value.image_uris,
      scryfall_uri: card.value.scryfall_uri,
      hash: hashJsonString(JSON.stringify(card.value))
    }))
  });
  for (const card of cardsNeedUpdate) {
    const updatedCard = cardBatchMap.get(card.scryfall_id);
    if (updatedCard === undefined) {
      console.error(`Failed to find updated card for id ${card.scryfall_id}`);
      continue;
    }
    await prisma.card.update({
      where: {
        scryfall_id: card.scryfall_id
      },
      data: {
        name: updatedCard.name,
        layout: updatedCard.layout,
        image_status: updatedCard.image_status,
        image_uris: updatedCard.image_uris,
        scryfall_uri: updatedCard.scryfall_uri,
        hash: hashJsonString(JSON.stringify(updatedCard))
      }
    });
  }
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

async function simpleMigrate(prisma: PrismaClient): Promise<void> {

  const response = await fetch('https://api.scryfall.com/bulk-data/default-cards');
  const metadata: CardDataJson = await response.json() as CardDataJson;
  const filename = metadata.download_uri.split('/').pop();
  const folder = process.cwd();
  const filePath = `${folder}/${filename}`;
  console.log(filePath);
  if (!existsSync(filePath)) {
    await downloadJsonFile(metadata.download_uri, filePath);
  };

  const streamPipeline = chain([
    createReadStream(filePath),
    StreamArray.withParser(),
    new Batch({batchSize: 100})  ]);
  
  let done = false;
  let batchCount = 0;
  
  streamPipeline.on('data', data => {
    console.log('Batch size:', data.length);
    if (data.length > 0) {
      upsertBatch(data as CardFromFile[], prisma)
        .then(() => {
          batchCount += 1;
          console.log(`Done upserting batch ${batchCount}`);
          // streamPipeline.destroy();
          
        })
        .catch(err => {
          console.error('Error in upsertBatch:', err);
          streamPipeline.destroy();
        });
      }
  });
  streamPipeline.on('end', () => {done=true; console.log('done');});

  while (!done) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
