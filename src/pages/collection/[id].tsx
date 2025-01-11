import Image from 'next/image';
import { useRouter } from 'next/router';
import Button from '~/components/Button';
import { api } from '~/utils/api';

export default function Page() {
  const router = useRouter()
  const { data: collection } = api.collection.byId.useQuery({ id: router.query.id as string })
  const cards = api.card.findMany.useQuery({ cardIds: collection?.cards ?? [] })
  const { mutate: deleteCollection } = api.collection.softDelete.useMutation();
  const { mutate: recoverCollection } = api.collection.recoverCollection.useMutation();

  function onDeleteClick() {
    if (collection?.id) {
      deleteCollection({ collectionId: collection?.id })
      router.back();
    }
  }

  function onRecoverClick() {
    if (collection?.id) {
      recoverCollection({ collectionId: collection?.id })
      router.back();
    }
  }

  return (
    <div>
      <h1>{collection?.name}</h1>
      {collection?.deletedAt == null ? (
        <Button type="button" onClick={onDeleteClick}>Delete</Button>
      ) : (
        <Button type="button" onClick={onRecoverClick}>Recover</Button>
      )}
      {cards.data?.map(card => {
        const images = card.image_uris as { small: string } | null;

        return (
          <div key={card.id}>
            <p>{card.name}</p>
            <Image src={images?.small ?? ""} width={100} height={200} alt={card.name} />
          </div>
        )
      })}
    </div>
  );
}
