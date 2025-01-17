import { Card, CardsOnCollections } from "@prisma/client";
import CardViewer from "~/components/CardViewer";

export type CollectionCard = CardsOnCollections & { card: Card };

type CollectionCardsProps = {
  cards?: CollectionCard[];
}

export function CollectionCards({ cards }: CollectionCardsProps) {
  if (!cards || cards.length <= 0) {
    return <div>No cards</div>
  }

  return (
    <div className="p-4">
      <CardViewer cards={cards} />
    </div>
  )
}

export default CollectionCards

