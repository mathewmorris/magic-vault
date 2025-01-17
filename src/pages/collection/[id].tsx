import { useRouter } from 'next/router';
import { api } from '~/utils/api';
import { CollectionName } from './components/CollectionName';
import CollectionCards from './components/CollectionCards';

export function CollectionDetailsPage() {
  const router = useRouter()

  const { data: collection } = api.collection.byId.useQuery({ id: router.query.id as string })
  const mutation = api.collection.rename.useMutation()
  const context = api.useContext()

  async function handleSave(name: string) {
    if (!collection) return null;
    await mutation.mutateAsync({ id: collection.id, name })
    context.collection.byId.invalidate({ id: collection.id })
  }

  return (
    <div>
      <CollectionName name={collection?.name ?? ''} onSave={handleSave} />
      <CollectionCards cards={collection?.cards} />
    </div>
  );
}

export default CollectionDetailsPage;

