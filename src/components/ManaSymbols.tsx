import { type SymbolSegment, splitSymbols, symbolImageUrl } from "~/utils/manaSymbols";

type SymbolSize = "sm" | "md";

const SIZE_CLASS: Record<SymbolSize, string> = {
  sm: "h-[1em] w-[1em]",
  md: "h-5 w-5",
};

/** One Scryfall symbol image, with the token as its alt text. */
export function ManaSymbol({ token, size = "sm" }: { token: string; size?: SymbolSize }) {
  return (
    // Scryfall's SVGs are tiny and come from svgs.scryfall.io, which
    // next/image isn't set up for (and it doesn't optimize SVGs anyway).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={symbolImageUrl(token)}
      alt={token}
      title={token}
      loading="lazy"
      className={`mx-px inline-block align-[-0.125em] ${SIZE_CLASS[size]}`}
    />
  );
}

/** Text and symbol segments, symbols drawn inline. */
export function SymbolText({ segments, size }: { segments: SymbolSegment[]; size?: SymbolSize }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "symbol" ? (
          <ManaSymbol key={index} token={segment.value} size={size} />
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </>
  );
}

/** A mana cost like "{2}{W/U}" drawn as symbols. */
export default function ManaSymbols({ cost, size = "md" }: { cost: string; size?: SymbolSize }) {
  if (!cost) return null;
  return (
    <span className="inline-flex flex-wrap items-center">
      <SymbolText segments={splitSymbols(cost)} size={size} />
    </span>
  );
}
