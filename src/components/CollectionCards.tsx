"use client";

import Image from "next/image";
import { type RouterOutputs } from "~/utils/api";
import { smallImageUrl } from "~/utils/cardImage";
import {
  cardFinishes,
  finishLabel,
  formatUsd,
  isFinish,
  priceFor,
  type Finish,
} from "~/utils/price";
import Button from "./Button";

export type CollectionCard = RouterOutputs["collection"]["cards"][number];

type CollectionCardsProps = {
  cards: CollectionCard[];
  editable?: boolean;
  disabled?: boolean;
  onIncrement: (cardId: string, finish: Finish) => void;
  onDecrement: (cardId: string, finish: Finish) => void;
  onRemove: (cardId: string, finish: Finish) => void;
  onChangeFinish: (cardId: string, from: Finish, to: Finish) => void;
};

export default function CollectionCards({
  cards,
  editable = true,
  disabled = false,
  onIncrement,
  onDecrement,
  onRemove,
  onChangeFinish,
}: CollectionCardsProps) {
  if (cards.length === 0) {
    return <p>No cards in this collection yet.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
      {cards.map(({ card, finish: storedFinish, count }) => {
        const image = smallImageUrl(card);
        // The API only ever stores one of the known finishes.
        const finish: Finish = isFinish(storedFinish) ? storedFinish : "nonfoil";
        const options = cardFinishes(card.finishes);
        const price = priceFor(card.prices, finish);
        const label = `${card.name} (${finishLabel(finish)})`;

        return (
          <li key={`${card.id}:${finish}`} className="flex flex-col items-center gap-2">
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
            {editable && options.length > 1 ? (
              <label className="flex items-center gap-2 text-sm">
                <span className="sr-only">Finish for {card.name}</span>
                <select
                  className="rounded bg-gray-800 px-1 py-0.5"
                  value={finish}
                  disabled={disabled}
                  onChange={(e) => {
                    const to = options.find((option) => option === e.target.value);
                    if (to && to !== finish) onChangeFinish(card.id, finish, to);
                  }}
                >
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {finishLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-sm text-gray-400">{finishLabel(finish)}</p>
            )}
            <p className="text-sm" aria-label={`${label} price`}>
              {price === null ? (
                <span className="text-gray-400">no price</span>
              ) : count > 1 ? (
                `${formatUsd(price)} each`
              ) : (
                formatUsd(price)
              )}
            </p>
            {editable ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  aria-label={`Remove one ${label}`}
                  disabled={disabled}
                  onClick={() => onDecrement(card.id, finish)}
                >
                  -
                </Button>
                <span aria-label={`${label} count`}>{count}</span>
                <Button
                  type="button"
                  aria-label={`Add one ${label}`}
                  disabled={disabled}
                  onClick={() => onIncrement(card.id, finish)}
                >
                  +
                </Button>
                <Button
                  type="button"
                  aria-label={`Remove all ${label}`}
                  disabled={disabled}
                  onClick={() => onRemove(card.id, finish)}
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
