import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";

import { bulkDownloadUri, readBulkCards } from "./bulkFile";

const cards = [
  { id: "a", name: "One", scryfall_uri: "https://scryfall.com/a", image_status: "lowres", layout: "normal" },
  { id: "b", name: "Two", scryfall_uri: "https://scryfall.com/b", image_status: "lowres", layout: "normal" },
];

const jsonl = cards.map((c) => JSON.stringify(c)).join("\n") + "\n";

async function collect(data: Buffer | string, chunkSize = 7) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const chunks: Buffer[] = [];
  for (let i = 0; i < buf.length; i += chunkSize) chunks.push(buf.subarray(i, i + chunkSize));
  const out = [];
  for await (const card of readBulkCards(Readable.from(chunks))) out.push(card);
  return out;
}

describe("bulkDownloadUri", () => {
  test("prefers download_uri, falls back to jsonl_download_uri", () => {
    expect(bulkDownloadUri({ download_uri: "https://x/a.json", jsonl_download_uri: "https://x/a.jsonl" })).toBe(
      "https://x/a.json",
    );
    expect(bulkDownloadUri({ jsonl_download_uri: "https://x/a.jsonl.gz" })).toBe("https://x/a.jsonl.gz");
    expect(bulkDownloadUri({})).toBeUndefined();
  });
});

describe("readBulkCards", () => {
  test("reads JSON Lines", async () => {
    expect(await collect(jsonl)).toEqual(cards);
  });

  test("reads gzipped JSON Lines", async () => {
    expect(await collect(gzipSync(jsonl))).toEqual(cards);
  });

  test("skips blank lines", async () => {
    expect(await collect("\n" + jsonl.replace("\n", "\n\n"))).toEqual(cards);
  });

  test("reads the older JSON array format", async () => {
    const array = "[\n" + cards.map((c) => JSON.stringify(c)).join(",\n") + "\n]\n";
    expect(await collect(array)).toEqual(cards);
  });

  test("reads an empty file", async () => {
    expect(await collect("")).toEqual([]);
  });
});
