import { PrismaClient } from '@prisma/client';
import { cards } from './cards';

const prisma = new PrismaClient()

async function main() {
  await prisma.card.deleteMany();
  console.log('deleted cards');
  await prisma.card.createMany({
    data: cards.map((card) => ({
      name: card.name,
      scryfall_id: card.id,
      layout: card.layout,
      image_status: card.image_status,
      image_uris: card.image_uris,
      scryfall_uri: card.scryfall_uri,
    }))
  });
  const lathril = await prisma.card.upsert({
    where: { scryfall_id: '098jk2' },
    update: {},
    create: {
      name: 'Lathril Blade of Elves',
      layout: 'oihwen',
      scryfall_id: '098jk2',
      image_status: 'lkffj',
      scryfall_uri: 'dsadfk',
    },
  })
  console.log({ lathril })
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


