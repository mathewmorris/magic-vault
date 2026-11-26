"use client";

import Link from "next/link";
import Button from "~/components/Button";
import { type RouterOutputs } from "~/utils/api";
import { CARD_TYPE_GROUPS, CARD_TYPE_GROUP_LABELS, cardTypeGroup } from "~/utils/deck/cardType";
import { type DeckBoard } from "~/utils/deck/checkDeck";
import { type OwnershipEntry } from "~/utils/deck/ownership";

export type DeckCardEntry = RouterOutputs["deck"]["getById"]["cards"][number];

const BOARDS: { board: DeckBoard; label: string }[] = [
  { board: "commander", label: "Commander" },
  { board: "main", label: "Main deck" },
  { board: "side", label: "Sideboard" },
];

type DeckCardListProps = {
  cards: DeckCardEntry[];
  /** Ownership by card id; a card missing here just shows no ownership yet. */
  ownership: Map<string, OwnershipEntry>;
  editable?: boolean;
  onIncrement: (cardId: string, board: DeckBoard) => void;
  onDecrement: (cardId: string, board: DeckBoard) => void;
};

function total(cards: DeckCardEntry[]) {
  return cards.reduce((sum, entry) => sum + entry.count, 0);
}

function OwnedBadge({ entry }: { entry: OwnershipEntry | undefined }) {
  if (!entry) return null;
  const covered = Math.min(entry.owned, entry.needed);

  return (
    <span
      className={`text-sm ${entry.missing === 0 ? "text-green-400" : "text-amber-400"}`}
      title={`You own ${entry.owned} in your collections, in any printing`}
    >
      own {covered} of {entry.needed}
    </span>
  );
}

export default function DeckCardList({
  cards,
  ownership,
  editable = true,
  onIncrement,
  onDecrement,
}: DeckCardListProps) {
  if (cards.length === 0) {
    return <p>No cards in this deck yet. Search below to add some.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {BOARDS.map(({ board, label }) => {
        const boardCards = cards.filter((entry) => entry.board === board);
        if (boardCards.length === 0) return null;

        return (
          <section key={board} className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">
              {label} ({total(boardCards)})
            </h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {CARD_TYPE_GROUPS.map((group) => {
                const groupCards = boardCards
                  .filter((entry) => cardTypeGroup(entry.card.type_line) === group)
                  .sort((a, b) => a.card.name.localeCompare(b.card.name));
                if (groupCards.length === 0) return null;

                return (
                  <div key={group} className="flex flex-col gap-1">
                    <h4 className="font-semibold dark:text-gray-300">
                      {CARD_TYPE_GROUP_LABELS[group]} ({total(groupCards)})
                    </h4>
                    <ul className="flex flex-col gap-1">
                      {groupCards.map(({ card, count }) => (
                        <li key={card.id} className="flex flex-wrap items-center gap-2">
                          {editable && (
                            <Button
                              type="button"
                              aria-label={`Remove one ${card.name}`}
                              onClick={() => onDecrement(card.id, board)}
                            >
                              -
                            </Button>
                          )}
                          <span aria-label={`${card.name} count`} className="w-6 text-right">
                            {count}
                          </span>
                          {editable && (
                            <Button
                              type="button"
                              aria-label={`Add one ${card.name}`}
                              onClick={() => onIncrement(card.id, board)}
                            >
                              +
                            </Button>
                          )}
                          <Link href={`/card/${card.id}`} className="hover:underline">
                            {card.name}
                          </Link>
                          <a
                            href={card.scryfall_uri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs dark:text-gray-400 hover:underline"
                          >
                            Scryfall
                          </a>
                          <OwnedBadge entry={ownership.get(card.id)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
