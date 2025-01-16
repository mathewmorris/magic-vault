import { useRouter } from 'next/router';
import CardViewer, { Cards } from '~/components/CardViewer';
import { api } from '~/utils/api';
import { CollectionName } from './components/CollectionName';

export function CollectionDetailsPage() {
  const router = useRouter()

  const { data: collection } = api.collection.byId.useQuery({ id: router.query.id as string })
  const mutation = api.collection.rename.useMutation();

  function handleSave(name: string) {
    if (!collection) return null;
    return mutation.mutateAsync({ id: collection.id, name })
  }

  return (
    <div>
      <CollectionName name={collection?.name ?? ''} onSave={handleSave} />
      <CardViewer cards={collection?.cards as unknown as Cards} />
    </div>
  );
}

export default CollectionDetailsPage;

