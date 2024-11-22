import { useRouter } from 'next/router';
import { api } from '~/utils/api';

export default function Page() {
  const router = useRouter()
  const collection = api.collection.byId.useQuery({ id: router.query.id as string })

  return (
    <div>
      <h1>{collection.data?.name}</h1>
      {collection.cards?.map(card => <p key={card}>{card}</p>)}
    </div>
  );
}
