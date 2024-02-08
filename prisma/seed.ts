const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient()

async function main() {
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


