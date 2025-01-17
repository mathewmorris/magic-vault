import { CollectionCard } from "~/pages/collection/components/CollectionCards";
import { api } from "~/utils/api";
import Button from "./Button";

interface CardViewerProps {
  cards?: CollectionCard[];
  onChange?: (collectionId: CollectionCard['collectionId'], cardId: CollectionCard['cardId'], count: CollectionCard['count']) => void;
}

export default function CardViewer({ cards, onChange }: CardViewerProps) {
  if (!cards) return null;
  const mutation = api.collection.setCardCount.useMutation()
  const context = api.useContext();

  return cards.map(({ card, collectionId, count }) => {
    async function addCard() {
      await mutation.mutateAsync({ collectionId, cardId: card.id, count: count + 1 })
      if (onChange) {
        onChange(collectionId, card.id, count + 1)
      }
      context.collection.byId.invalidate({ id: collectionId })
    }

    async function removeCard() {
      if (count - 1 < 0) {
        alert('you shouldn\'t be able to do that')
      } else {
        // TODO: Confirm user want to remove card? #configurable
        await mutation.mutateAsync({ collectionId, cardId: card.id, count: count - 1 })
      }
      if (onChange) {
        onChange(collectionId, card.id, count - 1)
      }
      context.collection.byId.invalidate({ id: collectionId })
    }

    return (
      <div key={card.id} className="flex justify-between">
        <p>{card.name}</p>
        <p>{count}</p>
        <Button onClick={addCard}>+1</Button>
        <Button onClick={removeCard}>{count == 1 ? "Delete" : "-1"}</Button>
      </div>
    )
  })
}

