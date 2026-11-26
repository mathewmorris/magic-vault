import { Readable } from 'node:stream';
import { type ReadableStream as WebReadableStream } from 'node:stream/web';

import { PrismaClient } from '@prisma/client';

import { bulkDownloadUri, readBulkCards, type BulkDataObject } from '../src/server/scryfall/bulkFile';
import { toCardRow } from '../src/server/scryfall/cacheCards';

const prisma = new PrismaClient();

const headers = {
  'User-Agent': 'MagicVaultScryfallDataBroker/1.0 (+https://github.com/mathewmorris/magic-vault)',
  Accept: 'application/json;q=1.0,*/*;q=0.9',
};

const BATCH_SIZE = 1000;

async function openDefaultCards(): Promise<Readable> {
  const objectResponse = await fetch('https://api.scryfall.com/bulk-data/default-cards', { headers });
  if (!objectResponse.ok) throw new Error(`The bulk data object is not available (${objectResponse.status})`);

  const uri = bulkDownloadUri((await objectResponse.json()) as BulkDataObject);
  if (!uri) throw new Error('The bulk data object has no download link');

  const fileResponse = await fetch(uri, { headers });
  if (!fileResponse.ok || !fileResponse.body) {
    throw new Error(`The bulk data file is not available (${fileResponse.status})`);
  }
  return Readable.fromWeb(fileResponse.body as unknown as WebReadableStream<Uint8Array>);
}

/**
 * Load every card from Scryfall's default_cards bulk file.
 *
 * Inserts in batches and skips cards that already exist, so it's safe to run
 * on a database that has collections pointing at cards. The nightly
 * Scryfall sync workflow keeps existing rows up to date.
 */
async function main() {
  let batch: ReturnType<typeof toCardRow>[] = [];
  let seen = 0;
  let inserted = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const { count } = await prisma.card.createMany({ data: batch, skipDuplicates: true });
    inserted += count;
    batch = [];
  };

  for await (const card of readBulkCards(await openDefaultCards())) {
    seen += 1;
    if (!card.id || !card.name || !card.scryfall_uri || !card.image_status || !card.layout) continue;
    batch.push(toCardRow(card));
    if (batch.length >= BATCH_SIZE) {
      await flush();
      if (seen % 20000 < BATCH_SIZE) console.log(`read ${seen} cards, inserted ${inserted}`);
    }
  }
  await flush();
  console.log(`done: read ${seen} cards, inserted ${inserted} new`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
