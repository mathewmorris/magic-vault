"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { api, type RouterOutputs } from "~/utils/api";
import {
  LEGALITY_LABELS,
  cardImages,
  formatRarity,
  legalityRows,
  readCardFaces,
  smallImage,
  type Legality,
} from "~/utils/cardDetail";
import { splitOracleText, splitSymbols } from "~/utils/manaSymbols";
import Button from "./Button";
import ManaSymbols, { SymbolText } from "./ManaSymbols";

export type CardDetailData = RouterOutputs["card"]["byId"];

const LEGALITY_CLASS: Record<Legality, string> = {
  legal: "bg-green-700 text-white",
  not_legal: "bg-gray-700 text-gray-300",
  banned: "bg-red-700 text-white",
  restricted: "bg-blue-700 text-white",
};

interface FaceText {
  name: string;
  mana_cost?: string | null;
  type_line?: string | null;
  oracle_text?: string | null;
  power?: string | null;
  toughness?: string | null;
  loyalty?: string | null;
  flavor_text?: string | null;
}

/** Name, cost, type, rules text, stats and flavor for one face (or the whole card). */
function FaceDetails({ face, titleAs = "h2" }: { face: FaceText; titleAs?: "h1" | "h2" }) {
  const Title = titleAs;
  const stats =
    face.power != null && face.toughness != null
      ? `${face.power}/${face.toughness}`
      : face.loyalty != null
        ? `Loyalty: ${face.loyalty}`
        : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-700 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Title className={titleAs === "h1" ? "text-3xl font-semibold" : "text-xl font-semibold"}>
          {face.name}
        </Title>
        {face.mana_cost && <ManaSymbols cost={face.mana_cost} />}
      </div>
      {face.type_line && <p className="border-t border-gray-700 pt-3">{face.type_line}</p>}
      {face.oracle_text && (
        <div className="flex flex-col gap-2 border-t border-gray-700 pt-3">
          {splitOracleText(face.oracle_text).map((line, index) => (
            <p key={index}>
              <SymbolText segments={line} />
            </p>
          ))}
        </div>
      )}
      {face.flavor_text && (
        <p className="whitespace-pre-line italic text-gray-300">{face.flavor_text}</p>
      )}
      {stats && <p className="self-end font-semibold">{stats}</p>}
    </div>
  );
}

function LegalityGrid({ legalities }: { legalities: unknown }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Legality</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {legalityRows(legalities).map(({ key, label, legality }) => (
          <li key={key} className="flex items-center gap-2">
            <span
              className={`w-24 shrink-0 rounded px-2 py-1 text-center text-xs font-semibold uppercase ${LEGALITY_CLASS[legality]}`}
            >
              {LEGALITY_LABELS[legality]}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Rulings are fetched from Scryfall only once someone opens this section. */
function Rulings({ id }: { id: string }) {
  const [opened, setOpened] = useState(false);
  const rulings = api.card.rulings.useQuery(
    { id },
    { enabled: opened, staleTime: Infinity, retry: false },
  );

  return (
    <details
      className="rounded-lg border border-gray-700 p-4"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="cursor-pointer text-lg font-semibold">Rulings</summary>
      <div className="mt-3">
        {rulings.isError ? (
          <p className="text-gray-400">Couldn&apos;t load rulings right now.</p>
        ) : !rulings.data ? (
          <p className="text-gray-400">Loading rulings...</p>
        ) : rulings.data.length === 0 ? (
          <p className="text-gray-400">No rulings to show for this card.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rulings.data.map((ruling, index) => (
              <li key={index} className="flex flex-col gap-1">
                <p>
                  <SymbolText segments={splitSymbols(ruling.comment)} />
                </p>
                <p className="text-xs text-gray-400">
                  {ruling.published_at} ({ruling.source === "wotc" ? "Wizards of the Coast" : "Scryfall"})
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function Printings({ card }: { card: CardDetailData }) {
  if (card.printings.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Other printings</h2>
      <ul className="flex flex-col divide-y divide-gray-800">
        {card.printings.map((printing) => {
          const thumb = smallImage(printing);
          return (
            <li key={printing.id}>
              <Link
                href={`/card/${printing.id}`}
                className="flex items-center gap-3 py-2 hover:text-pink-300"
              >
                {thumb ? (
                  <Image
                    src={thumb}
                    width={36}
                    height={50}
                    alt=""
                    className="rounded"
                  />
                ) : (
                  <span className="h-[50px] w-[36px] rounded bg-gray-800" />
                )}
                <span className="flex-1">
                  {printing.set_name ?? printing.name}
                  {printing.set && (
                    <span className="ml-1 text-gray-400">({printing.set.toUpperCase()})</span>
                  )}
                </span>
                <span className="text-sm text-gray-400">
                  {[
                    printing.collector_number && `#${printing.collector_number}`,
                    formatRarity(printing.rarity),
                    printing.released_at?.slice(0, 4),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {card.hasMorePrintings && card.oracle_id && (
        <a
          href={`https://scryfall.com/search?unique=prints&q=${encodeURIComponent(`oracleid:${card.oracle_id}`)}`}
          className="text-sm underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          See every printing on Scryfall
        </a>
      )}
    </section>
  );
}

export default function CardDetail({ card }: { card: CardDetailData }) {
  const images = cardImages(card);
  const faces = readCardFaces(card.card_faces);
  const [side, setSide] = useState(0);
  const image = images[side] ?? images[0];
  // Split and adventure cards share one image, so it's named after the card.
  const imageAlt = images.length > 1 ? (faces[side]?.name ?? card.name) : card.name;

  // Multi-face cards keep their rules text on each face, not at the top.
  const showFaces = faces.length > 1 && !card.oracle_text;
  const setLine = [
    card.set_name && card.set ? `${card.set_name} (${card.set.toUpperCase()})` : card.set_name,
    card.collector_number && `#${card.collector_number}`,
    formatRarity(card.rarity),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-8 px-4 md:flex-row md:items-start">
      <div className="flex flex-col items-center gap-3 md:w-[400px] md:shrink-0">
        {image ? (
          <Image
            src={image}
            width={672}
            height={936}
            alt={imageAlt}
            priority
            sizes="(min-width: 768px) 400px, 100vw"
            className="h-auto w-full max-w-[400px] rounded-xl"
          />
        ) : (
          <div className="flex aspect-[5/7] w-full max-w-[400px] items-center justify-center rounded-xl bg-gray-800 p-4 text-center">
            {card.name}
          </div>
        )}
        {images.length > 1 && (
          <Button type="button" onClick={() => setSide((current) => (current + 1) % images.length)}>
            Flip to {faces[(side + 1) % images.length]?.name ?? "other side"}
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {showFaces ? (
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-semibold">{card.name}</h1>
            {faces.map((face, index) => (
              <FaceDetails key={index} face={face} />
            ))}
          </div>
        ) : (
          <FaceDetails face={card} titleAs="h1" />
        )}

        <div className="flex flex-col gap-1 text-sm text-gray-300">
          {card.artist && <p>Illustrated by {card.artist}</p>}
          {setLine && <p>{setLine}</p>}
          <a
            href={card.scryfall_uri}
            className="font-semibold text-pink-300 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Scryfall
          </a>
        </div>

        <LegalityGrid legalities={card.legalities} />
        <Rulings id={card.id} />
        <Printings card={card} />
      </div>
    </div>
  );
}
