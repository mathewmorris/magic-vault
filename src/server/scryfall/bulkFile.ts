import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

import { type ScryfallCard } from "./client";

/**
 * Reading Scryfall bulk-data files (https://scryfall.com/docs/api/bulk-data).
 *
 * Bulk-data objects now link a gzipped JSON Lines file (jsonl_download_uri,
 * one card per line). Older objects linked a JSON array (download_uri).
 * These helpers read either, streaming JSON Lines so the whole file is never
 * held in memory.
 */

export type BulkDataObject = {
  download_uri?: string | null;
  jsonl_download_uri?: string | null;
};

/** The file link on a bulk-data object, whichever format it offers. */
export function bulkDownloadUri(object: BulkDataObject): string | undefined {
  return object.download_uri ?? object.jsonl_download_uri ?? undefined;
}

/** Peek at the first bytes and gunzip the stream if it is gzipped. */
export async function maybeGunzip(source: Readable): Promise<Readable> {
  const chunks = source[Symbol.asyncIterator]() as AsyncIterator<Buffer | string>;
  let first = await chunks.next();
  let head = first.done ? Buffer.alloc(0) : Buffer.from(first.value);
  // Make sure we can see both magic bytes even if the first chunk is tiny.
  while (!first.done && head.length < 2) {
    first = await chunks.next();
    if (!first.done) head = Buffer.concat([head, Buffer.from(first.value)]);
  }
  const done = first.done ?? false;

  async function* replay() {
    if (head.length > 0) yield head;
    if (done) return;
    for (let next = await chunks.next(); !next.done; next = await chunks.next()) {
      yield Buffer.from(next.value);
    }
  }
  const stream = Readable.from(replay());
  if (head[0] !== 0x1f || head[1] !== 0x8b) return stream;

  const gunzip = createGunzip();
  stream.on("error", (err) => gunzip.destroy(err));
  return stream.pipe(gunzip);
}

/** Stream cards out of a bulk file: JSON Lines or a JSON array, gzipped or not. */
export async function* readBulkCards(source: Readable): AsyncGenerator<ScryfallCard> {
  const lines = createInterface({ input: await maybeGunzip(source), crlfDelay: Infinity });
  let arrayLines: string[] | null = null;
  for await (const raw of lines) {
    if (arrayLines) {
      arrayLines.push(raw);
      continue;
    }
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("[")) {
      // The older format: one JSON array. Rare now, so just parse it whole.
      arrayLines = [raw];
      continue;
    }
    yield JSON.parse(line) as ScryfallCard;
  }
  if (arrayLines) {
    for (const card of JSON.parse(arrayLines.join("\n")) as ScryfallCard[]) yield card;
  }
}
