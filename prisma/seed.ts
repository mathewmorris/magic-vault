import { type Prisma, PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient()

type CardFromJsonFile = {
  id: string,
  name: string,
  scryfall_uri: string,
  image_status: string,
  image_uris: Prisma.JsonObject,
  card_faces: Prisma.JsonObject,
  all_parts: Prisma.JsonObject,
  layout: string,
}

// TODO: Remove hard coded path (fetch file?)

async function main() {
  const cards = JSON.parse(fs.readFileSync('./scryfall-data-broker/scryfall_downloads/default_cards_2024_10_11.json', 'utf8')) as CardFromJsonFile[];
  await prisma.card.deleteMany()
  console.log('deleted cards')
  await prisma.card.createMany({
    data: cards.map((card) => ({
      id: card.id,
      name: card.name,
      scryfall_uri: card.scryfall_uri,
      image_status: card.image_status,
      image_uris: card.image_uris,
      card_faces: card.card_faces,
      all_parts: card.all_parts,
      layout: card.layout,
    }))
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })


