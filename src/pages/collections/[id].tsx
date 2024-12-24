import Image from 'next/image';
import { useRouter } from 'next/router';
import { api } from '~/utils/api';

export default function Page() {
  const router = useRouter()
  const collection = api.collection.byId.useQuery({ id: router.query.id as string })
  const cards = api.card.findMany.useQuery({ cardIds: collection.data?.cards ?? [] })

  return (
    <div>
      <h1>{collection.data?.name}</h1>
      {cards.data?.map(card => {
        return (
          <div key={card.id}>
            <p>{card.name}</p>
            <Image src={card.image_uris?.normal ?? ""} width={100} height={200} />
          </div>
        )
      })}
    </div>
  );
}
