import { useRouter } from 'next/router';
import { api } from '~/utils/api';
import { CollectionName } from './components/CollectionName';
import CollectionCards from './components/CollectionCards';
import Toolbar from './components/Toolbar';

export function CollectionDetailsPage() {
  const router = useRouter()

  const { data: collection } = api.collection.byId.useQuery({ id: router.query.id as string })
  const mutation = api.collection.rename.useMutation()
  const context = api.useContext()

  function handleSave(name: string) {
    if (!collection) return null;
    void mutation.mutateAsync({ id: collection.id, name }).then(() => {
      void context.collection.byId.invalidate({ id: collection.id })
    })
  }

  return (
    <div>
      <CollectionName name={collection?.name ?? ''} onSave={handleSave} />
      <Toolbar />
      <CollectionCards cards={collection?.cards} />
    </div>
  );
}

export default CollectionDetailsPage;

