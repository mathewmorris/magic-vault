"use client";

import Image from "next/image";
import { type RouterOutputs } from "~/utils/api";
import { smallImageUrl } from "~/utils/cardImage";
import Button from "./Button";

export type CollectionCard = RouterOutputs["collection"]["cards"][number];

type CollectionCardsProps = {
  cards: CollectionCard[];
  editable?: boolean;
  disabled?: boolean;
  onIncrement: (cardId: string) => void;
  onDecrement: (cardId: string) => void;
  onRemove: (cardId: string) => void;
};

export default function CollectionCards({
  cards,
  editable = true,
  disabled = false,
  onIncrement,
  onDecrement,
  onRemove,
}: CollectionCardsProps) {
  if (cards.length === 0) {
    return <p>No cards in this collection yet.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
      {cards.map(({ card, count }) => {
        const image = smallImageUrl(card);

        return (
          <li key={card.id} className="flex flex-col items-center gap-2">
            {image ? (
              <Image
                src={image}
                width={146}
                height={204}
                alt={card.name}
                className="rounded-lg"
              />
            ) : (
              <div className="flex h-[204px] w-[146px] items-center justify-center rounded-lg bg-gray-800 p-2 text-center">
                {card.name}
              </div>
            )}
            <p className="text-center">{card.name}</p>
            {editable ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  aria-label={`Remove one ${card.name}`}
                  disabled={disabled}
                  onClick={() => onDecrement(card.id)}
                >
                  -
                </Button>
                <span aria-label={`${card.name} count`}>{count}</span>
                <Button
                  type="button"
                  aria-label={`Add one ${card.name}`}
                  disabled={disabled}
                  onClick={() => onIncrement(card.id)}
                >
                  +
                </Button>
                <Button
                  type="button"
                  aria-label={`Remove all ${card.name}`}
                  disabled={disabled}
                  onClick={() => onRemove(card.id)}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <p>x{count}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
