// Seeds the e2e database with every English printing of one card from
// Scryfall, and writes a fake camera video of the printing to scan.
// Used by the "Scanner in a browser" CI job; see e2e/scan.spec.ts.
//
//   node e2e/scan/seed-cards.mjs <out-dir>
//
// Writes <out-dir>/card.png and <out-dir>/target.json ({ id, name, set, collectorNumber }).

import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CARD_NAME = "Lightning Bolt";
// A 2015-frame printing has the set code and number on the collector line,
// which is what the scanner matches on before any card images are indexed.
const TARGET_QUERY = `!"${CARD_NAME}" frame:2015 lang:en -is:promo border:black game:paper`;

const outDir = process.argv[2] ?? "e2e-out";
const headers = { "User-Agent": "magic-vault-ci/1.0", Accept: "application/json" };

async function scryfall(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Scryfall ${response.status} for ${url}`);
  return response.json();
}

async function allPages(url) {
  const cards = [];
  let next = url;
  while (next) {
    const page = await scryfall(next);
    cards.push(...page.data);
    next = page.has_more ? page.next_page : null;
    if (next) await new Promise((r) => setTimeout(r, 120));
  }
  return cards;
}

const toRow = (card) => ({
  id: card.id,
  name: card.name,
  scryfall_uri: card.scryfall_uri,
  image_status: card.image_status,
  image_uris: card.image_uris ?? undefined,
  card_faces: card.card_faces ?? undefined,
  layout: card.layout,
  oracle_id: card.oracle_id ?? null,
  mana_cost: card.mana_cost ?? null,
  cmc: card.cmc ?? null,
  type_line: card.type_line ?? null,
  oracle_text: card.oracle_text ?? null,
  set: card.set,
  set_name: card.set_name,
  collector_number: card.collector_number,
  rarity: card.rarity,
  released_at: card.released_at,
  lang: card.lang,
  finishes: card.finishes ?? undefined,
  border_color: card.border_color ?? null,
  frame: card.frame ?? null,
  frame_effects: card.frame_effects ?? [],
  promo_types: card.promo_types ?? [],
  security_stamp: card.security_stamp ?? null,
  illustration_id: card.illustration_id ?? null,
});

const printings = await allPages(
  `https://api.scryfall.com/cards/search?unique=prints&q=${encodeURIComponent(`!"${CARD_NAME}" lang:en`)}`,
);
const [target] = await allPages(
  `https://api.scryfall.com/cards/search?unique=prints&order=released&dir=desc&q=${encodeURIComponent(TARGET_QUERY)}`,
);
if (!target?.image_uris?.png) throw new Error("No scannable target printing found");

const prisma = new PrismaClient();
const { count } = await prisma.card.createMany({ data: printings.map(toRow), skipDuplicates: true });
await prisma.$disconnect();

await mkdir(outDir, { recursive: true });
const image = await fetch(target.image_uris.png, { headers: { "User-Agent": headers["User-Agent"] } });
if (!image.ok) throw new Error(`Card image ${image.status}`);
await writeFile(path.join(outDir, "card.png"), Buffer.from(await image.arrayBuffer()));
const info = { id: target.id, name: target.name, set: target.set, collectorNumber: target.collector_number };
await writeFile(path.join(outDir, "target.json"), JSON.stringify(info));
console.log(`Seeded ${count} printings; scanning ${info.name} (${info.set} ${info.collectorNumber}).`);
