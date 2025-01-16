import { Card, CardsOnCollections } from "@prisma/client";
import Image from "next/image";

export type Cards = CardsOnCollections & { card: Card }[];

interface CardViewerProps {
  cards?: Cards;
}

export default function CardViewer({ cards }: CardViewerProps) {
  if (!cards) return null;

  return cards.map(({ card }) => {
    const images = card.image_uris as { small: string } | null;

    return (
      <div key={card.id}>
        <p>{card.name}</p>
        <Image src={images?.small ?? ""} width={100} height={200} alt={card.name} />
      </div>
    )
  })
}

