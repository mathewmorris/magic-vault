import {
  AFFILIATE_DISCLOSURE,
  anyAffiliate,
  type BuyLink,
} from "~/utils/buyLinks";

type BuyLinksProps = {
  links: BuyLink[];
  /** Card name, so screen readers hear "Buy Lightning Bolt on TCGplayer". */
  cardName: string;
  /** "full" for the card page, "compact" for one card in a collection grid. */
  variant?: "full" | "compact";
  /** Show the affiliate disclosure under the links when any link is tracked. */
  showDisclosure?: boolean;
};

/**
 * Links out to stores that sell the card. Affiliate links get
 * rel="sponsored" (Google's marking for paid links); every link opens in a
 * new tab.
 */
export default function BuyLinks({
  links,
  cardName,
  variant = "full",
  showDisclosure = variant === "full",
}: BuyLinksProps) {
  if (links.length === 0) return null;

  const compact = variant === "compact";

  return (
    <div
      className={
        compact ? "flex flex-col items-center gap-1" : "flex flex-col gap-2"
      }
    >
      {!compact && <h2 className="text-lg font-semibold">Buy this card</h2>}
      <ul
        className={
          compact
            ? "flex flex-wrap justify-center gap-x-2 text-xs"
            : "flex flex-wrap gap-2"
        }
        aria-label={compact ? `Buy ${cardName}` : undefined}
      >
        {links.map((link) => (
          <li key={link.store}>
            <a
              href={link.href}
              target="_blank"
              rel={
                link.affiliate
                  ? "sponsored noopener noreferrer"
                  : "noopener noreferrer"
              }
              className={
                compact
                  ? "text-gray-300 underline hover:text-pink-300"
                  : "inline-block rounded border border-gray-600 px-3 py-1.5 font-semibold hover:border-pink-300 hover:text-pink-300"
              }
            >
              <span className="sr-only">Buy {cardName} on </span>
              {link.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
      {showDisclosure && anyAffiliate(links) && <AffiliateDisclosure />}
    </div>
  );
}

/** The line that says some links pay Magic Vault a commission. */
export function AffiliateDisclosure({ className }: { className?: string }) {
  return (
    <p
      className={["text-xs text-gray-400", className].filter(Boolean).join(" ")}
    >
      {AFFILIATE_DISCLOSURE}
    </p>
  );
}
