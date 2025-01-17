import { Card, CardsOnCollections } from "@prisma/client";
import Button from "~/components/Button";
import { api } from "~/utils/api";

export type CollectionCard = CardsOnCollections & { card: Card };

type CollectionCardsProps = {
  cards?: CollectionCard[];
}

export function CollectionCards({ cards }: CollectionCardsProps) {
  const mutation = api.collection.setCardCount.useMutation()
  const context = api.useContext();

  if (!cards || cards.length <= 0) {
    return <div>No cards</div>
  }

  return cards.map(({ card, collectionId, count }) => {
    async function addCard() {
      await mutation.mutateAsync({ collectionId, cardId: card.id, count: count + 1 })
      context.collection.byId.invalidate({ id: collectionId })
    }

    async function removeCard() {
      if (count - 1 < 0) {
        alert('you shouldn\'t be able to do that')
      } else {
        // TODO: Confirm user want to remove card? #configurable
        await mutation.mutateAsync({ collectionId, cardId: card.id, count: count - 1 })
      }
      context.collection.byId.invalidate({ id: collectionId })
    }

    return (
      <div key={card.id} className="flex justify-between">
        <div>
          <p>{card.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <p>{count}</p>
          <Button onClick={removeCard}>{count == 1 ? "Delete" : "-1"}</Button>
          <Button onClick={addCard}>+1</Button>
        </div>
      </div>
    )
  })
}

export default CollectionCards

