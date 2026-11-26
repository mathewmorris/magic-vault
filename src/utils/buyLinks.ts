/**
 * "Buy this card" links for card pages and collections.
 *
 * Affiliate tracking is behind a switch (AFFILIATE_LINKS, off by default).
 *
 * - While it's off, links are Scryfall's own `purchase_uris`
 *   (https://scryfall.com/docs/api/cards#print-fields), passed through as
 *   they are. Those carry Scryfall's tracking, which helps pay for the free
 *   API this app runs on, and earn Magic Vault nothing. Where Scryfall has no
 *   link (Card Kingdom never does), it's a plain store search by name.
 * - While it's on, a store with an ID set gets Magic Vault's tracking on the
 *   plain store page instead. A store with no ID keeps the link from above.
 *
 * Cardmarket has no link-based affiliate program (only sign-up referrals),
 * so it never gets Magic Vault tracking.
 */

export const STORES = ["tcgplayer", "cardkingdom", "cardmarket"] as const;
export type Store = (typeof STORES)[number];

export const STORE_LABELS: Record<Store, string> = {
  tcgplayer: "TCGplayer",
  cardkingdom: "Card Kingdom",
  cardmarket: "Cardmarket",
};

export interface AffiliateConfig {
  /** The AFFILIATE_LINKS switch. */
  enabled: boolean;
  /**
   * TCGplayer's tracking link from Impact, like
   * https://partner.tcgplayer.com/c/1234567/1830156/21018. The product page
   * goes on the end as `?u=<page>`.
   */
  tcgplayerUrl?: string;
  /** Card Kingdom partner ID, sent as `partner=<id>`. */
  cardKingdomPartner?: string;
}

export const AFFILIATE_OFF: AffiliateConfig = { enabled: false };

export interface BuyLink {
  store: Store;
  label: string;
  href: string;
  /** True when the link carries Magic Vault's affiliate tracking (Scryfall's own doesn't count). */
  affiliate: boolean;
}

export interface BuyableCard {
  name: string;
  purchase_uris?: unknown;
}

/** Query parameters that only exist to track a referral. */
const TRACKING_PARAMS =
  /^(utm_\w+|referrer|ref|partner|partner_args|affiliate_id|subId\d*|irclickid|irgwc)$/i;

function storeUrl(raw: unknown, hosts: RegExp): URL | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !hosts.test(url.hostname)) return null;
  return url;
}

function stripTracking(url: URL): string {
  const clean = new URL(url.toString());
  for (const key of [...clean.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) clean.searchParams.delete(key);
  }
  return clean.toString();
}

function purchaseUri(card: BuyableCard, store: string): unknown {
  const uris = card.purchase_uris;
  if (typeof uris !== "object" || uris === null || Array.isArray(uris))
    return undefined;
  return (uris as Record<string, unknown>)[store];
}

const TCGPLAYER_HOST = /^(www\.)?tcgplayer\.com$/;
const TCGPLAYER_REDIRECT_HOST =
  /^(partner\.tcgplayer\.com|tcgplayer\.pxf\.io)$/;
const CARDMARKET_HOST = /^(www\.)?cardmarket\.com$/;

function tcgplayerSearch(card: BuyableCard): string {
  const search = new URL("https://www.tcgplayer.com/search/magic/product");
  search.searchParams.set("productLineName", "magic");
  search.searchParams.set("q", card.name);
  return search.toString();
}

/**
 * TCGplayer's page for the card with no tracking. Scryfall's TCGplayer link
 * is a tracking redirect with the product page in its `u` parameter, so the
 * page is pulled out of it. Falls back to a search by name.
 */
export function tcgplayerPage(card: BuyableCard): string {
  const raw = purchaseUri(card, "tcgplayer");
  const redirect = storeUrl(raw, TCGPLAYER_REDIRECT_HOST);
  const target = redirect
    ? storeUrl(redirect.searchParams.get("u"), TCGPLAYER_HOST)
    : storeUrl(raw, TCGPLAYER_HOST);
  return target ? stripTracking(target) : tcgplayerSearch(card);
}

/** Scryfall's TCGplayer link as it is, or a plain search when it has none. */
function tcgplayerDefault(card: BuyableCard): string {
  const raw = purchaseUri(card, "tcgplayer");
  const url =
    storeUrl(raw, TCGPLAYER_REDIRECT_HOST) ?? storeUrl(raw, TCGPLAYER_HOST);
  return url ? url.toString() : tcgplayerSearch(card);
}

/** Card Kingdom isn't in Scryfall's purchase_uris, so this is a search by name. */
export function cardKingdomPage(card: BuyableCard): string {
  const search = new URL("https://www.cardkingdom.com/catalog/search");
  search.searchParams.set("search", "header");
  search.searchParams.set("filter[name]", card.name);
  return search.toString();
}

/** Scryfall's Cardmarket link as it is, or a plain search when it has none. */
export function cardmarketPage(card: BuyableCard): string {
  const url = storeUrl(purchaseUri(card, "cardmarket"), CARDMARKET_HOST);
  if (url) return url.toString();

  const search = new URL("https://www.cardmarket.com/en/Magic/Products/Search");
  search.searchParams.set("searchString", card.name);
  return search.toString();
}

/** Impact's deep link: the tracking link with the store page as `u`. */
function impactLink(trackingUrl: string, page: string): string | null {
  let url: URL;
  try {
    url = new URL(trackingUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  url.searchParams.set("u", page);
  return url.toString();
}

/** Card Kingdom's partner link, in the shape other MTG sites use. */
function cardKingdomLink(page: string, partner: string): string {
  const url = new URL(page);
  url.searchParams.set("partner", partner);
  url.searchParams.set("utm_source", partner);
  url.searchParams.set("utm_medium", "affiliate");
  url.searchParams.set("utm_campaign", partner);
  return url.toString();
}

/** Magic Vault's tracked link for a store, or null when it has none. */
function trackedLink(
  store: Store,
  card: BuyableCard,
  config: AffiliateConfig,
): string | null {
  if (!config.enabled) return null;
  if (store === "tcgplayer" && config.tcgplayerUrl) {
    return impactLink(config.tcgplayerUrl, tcgplayerPage(card));
  }
  if (store === "cardkingdom" && config.cardKingdomPartner) {
    return cardKingdomLink(cardKingdomPage(card), config.cardKingdomPartner);
  }
  return null;
}

function defaultLink(store: Store, card: BuyableCard): string {
  if (store === "tcgplayer") return tcgplayerDefault(card);
  if (store === "cardkingdom") return cardKingdomPage(card);
  return cardmarketPage(card);
}

/**
 * Buy links for one card, in a fixed store order. `affiliate` is true only
 * on links that carry Magic Vault's tracking, which is what decides whether
 * the disclosure line shows.
 */
export function buyLinks(
  card: BuyableCard,
  config: AffiliateConfig = AFFILIATE_OFF,
): BuyLink[] {
  return STORES.map((store) => {
    const tracked = trackedLink(store, card, config);
    return {
      store,
      label: STORE_LABELS[store],
      href: tracked ?? defaultLink(store, card),
      affiliate: tracked !== null,
    };
  });
}

/** Whether any link in the list earns Magic Vault a commission. */
export function anyAffiliate(
  links: Iterable<Pick<BuyLink, "affiliate">>,
): boolean {
  for (const link of links) if (link.affiliate) return true;
  return false;
}

export const AFFILIATE_DISCLOSURE =
  "Magic Vault earns a commission when you buy through some of these store links. It doesn't change your price.";
