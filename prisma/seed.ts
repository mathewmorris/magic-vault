import { PrismaClient, type Card } from '@prisma/client';

const prisma = new PrismaClient()

async function fetchDefaultCards(): Promise<Card[] | undefined> {
  const headers = {
    'User-Agent': "MagicVaultScryfallDataBroker/1.0",
    'Accept': "application/json;q=1.0,*/*;q=0.9"
  }

  const downloadUriResponse = await fetch('https://api.scryfall.com/bulk-data/default-cards', { headers });

  if (downloadUriResponse.ok) {
    const { download_uri } = await downloadUriResponse.json() as Record<'download_uri', string>;

    const bulk_data_response = await fetch(download_uri, { headers });

    if (bulk_data_response.ok) {
      const cards = await bulk_data_response.json() as Card[];
      return Promise.resolve(cards);
    }

    return Promise.reject(new Error('The bulk data response is not available'));
  }

  return Promise.reject(new Error('The download link is not available'));
}

async function deleteCards() {
  await prisma.card.deleteMany();
  console.log('deleted cards');
}

async function main() {
  const cards = await fetchDefaultCards();

  if (cards != null) {
    await deleteCards();
    await prisma.card.createMany({
      data: cards.map((card) => ({
        id: card.id,
        name: card.name,
        scryfall_uri: card.scryfall_uri,
        image_status: card.image_status,
        image_uris: card.image_uris ?? {},
        card_faces: card.card_faces ?? {},
        all_parts: card.all_parts ?? {},
        layout: card.layout,
      }))
    })
  }
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


