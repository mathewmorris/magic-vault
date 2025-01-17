import { Card, CardsOnCollections } from "@prisma/client";
import { useState } from "react";
import Button from "~/components/Button";
import CardViewer from "~/components/CardViewer";
import SearchBar from "~/components/SearchBar";

export type CollectionCard = CardsOnCollections & { card: Card };

type CollectionCardsProps = {
  cards?: CollectionCard[];
}

export function CollectionCards({ cards }: CollectionCardsProps) {
  if (!cards || cards.length <= 0) {
    return <div>No cards</div>
  }

  const [showSearch, setShowSearch] = useState(false)

  return (
    <div className="p-4">
      <Button onClick={() => setShowSearch(true)}>Add new card</Button>
      {showSearch && (
        <SearchBar onAddCard={() => { }} onRemoveCard={() => { }} />
      )}
      <CardViewer cards={cards} />
    </div>
  )
}

export default CollectionCards

