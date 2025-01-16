import { useRouter } from "next/router"
import { useState } from "react"
import Button from "~/components/Button"
import SearchBar from "~/components/SearchBar"
import { api } from "~/utils/api"

export function useMap(initialValue: Map<string, number>): [Map<string, number>, (key: string, value: number) => void, (key: string) => void] {
  const [map, update] = useState(initialValue);

  function set(key: string, value: number) {
    update(map => map.set(key, value));
  }

  function remove(key: string) {
    update(map => {
      map.delete(key);
      return map;
    });
  }

  return [map, set, remove];
}

export default function CreateCollectionPage() {
  const router = useRouter();
  const [name, setName] = useState<string>('')

  const [cards, set, remove] = useMap(new Map());

  const { mutate: collectionMutation } = api.collection.create.useMutation({
    onSuccess: collection => {
      void router.replace(`/collection/${collection.id}`)
    }
  });

  function onCreateCollectionClick() {
    collectionMutation({
      name,
      cards,
    });
  }

  function onAddCard(id: string) {
    if (cards.has(id)) {
      const number = cards.get(id)!;
      set(id, number + 1);
    } else {
      set(id, 1);
    }
  }

  function onRemoveCard(id: string) {
    if (cards.has(id)) {
      const number = cards.get(id)!;
      if (number > 1) {
        set(id, number - 1);
      } else {
        remove(id);
      }
    }
  }

  return (
    <div>
      <h1>Creating Collection</h1>
      <form>
        <div className="p-4">
          <label htmlFor="collectionName">Collection Name</label>
          <input className="text-black" type="text" id="collectionName" onChange={e => setName(e.target.value)} value={name} />
        </div>
        <Button type="button" onClick={onCreateCollectionClick}>Create Collection</Button>
        <div className="p-4">
          <SearchBar onAddCard={onAddCard} onRemoveCard={onRemoveCard} />
        </div>
      </form>
    </div>
  )
}

