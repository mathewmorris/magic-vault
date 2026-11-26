/**
 * Small Scryfall API client for the card search fallback.
 *
 * Bulk data (scryfall-data-broker/) is the main source for the Card table.
 * This client only covers cards that are missing locally, like a set that came
 * out after the last sync. It follows Scryfall's API guidance
 * (https://scryfall.com/docs/api, /docs/api/rate-limits):
 *
 * - every request sends a descriptive User-Agent and an Accept header
 * - /cards/search is limited to 2 requests per second, so calls are spaced at
 *   least 500 ms apart
 * - after a 429 we stop calling Scryfall for at least 30 seconds and never
 *   retry right away
 * - identical searches already in flight share one request
 * - "no cards found" answers are remembered for a while so the same miss
 *   doesn't go back out
 *
 * It also fetches a card's rulings for the card page. Those go through the
 * same queue, spacing and 429 pause as searches, and are kept for a day.
 */

export const SCRYFALL_API = "https://api.scryfall.com";

export const SCRYFALL_HEADERS = {
  "User-Agent": "MagicVault/1.0 (+https://github.com/mathewmorris/magic-vault)",
  Accept: "application/json;q=1.0,*/*;q=0.9",
} as const;

/** Minimum gap between search requests (Scryfall allows 2/s on /cards/search). */
export const MIN_REQUEST_GAP_MS = 500;
/** How long to stop calling Scryfall after a 429 (Scryfall locks for 30 s). */
export const RATE_LIMIT_COOLDOWN_MS = 30_000;
/** How long a "no cards found" answer is remembered. */
export const NEGATIVE_CACHE_MS = 10 * 60_000;
export const DEFAULT_TIMEOUT_MS = 5_000;
/** Shorter queries never go to Scryfall, so typing doesn't spam it. */
export const MIN_QUERY_LENGTH = 3;
/** Cap on remembered misses, so the map can't grow without bound. */
export const MAX_REMEMBERED_MISSES = 1_000;
/** How long a card's rulings are kept in memory. */
export const RULINGS_CACHE_MS = 24 * 60 * 60_000;
/** Cap on cards whose rulings are kept in memory. */
export const MAX_CACHED_RULINGS = 1_000;

/** The parts of a Scryfall card object the Card table stores. */
export interface ScryfallCard {
  id: string;
  name: string;
  scryfall_uri: string;
  image_status: string;
  layout: string;
  image_uris?: Record<string, string> | null;
  card_faces?: unknown[] | null;
  all_parts?: unknown[] | null;
  oracle_id?: string | null;
  mana_cost?: string | null;
  cmc?: number | null;
  type_line?: string | null;
  oracle_text?: string | null;
  power?: string | null;
  toughness?: string | null;
  loyalty?: string | null;
  colors?: string[] | null;
  color_identity?: string[] | null;
  keywords?: string[] | null;
  set?: string | null;
  set_name?: string | null;
  collector_number?: string | null;
  rarity?: string | null;
  artist?: string | null;
  flavor_text?: string | null;
  released_at?: string | null;
  legalities?: Record<string, string> | null;
  finishes?: string[] | null;
  lang?: string | null;
  /** Decimal strings keyed by currency and finish (usd, usd_foil, usd_etched, eur, ...). */
  prices?: Record<string, string | null> | null;
  purchase_uris?: Record<string, string> | null;
}

interface ScryfallList {
  object: "list";
  data: ScryfallCard[];
  has_more?: boolean;
}

export type SearchOutcome =
  | { status: "ok"; cards: ScryfallCard[] }
  | { status: "not_found" }
  | { status: "skipped"; reason: string }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

/** One ruling from /cards/:id/rulings, trimmed to what the card page shows. */
export interface ScryfallRuling {
  source: string;
  published_at: string;
  comment: string;
}

export type RulingsOutcome =
  | { status: "ok"; rulings: ScryfallRuling[] }
  | { status: "skipped"; reason: string }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

type FetchOutcome =
  | { status: "ok"; body: unknown }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Scryfall card ids are UUIDs; nothing else goes into a request path. */
export function isScryfallId(id: string): boolean {
  return SCRYFALL_ID.test(id);
}

/** Keep the rulings that have the fields the page needs, drop anything else. */
export function readRulings(body: unknown): ScryfallRuling[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item: unknown): ScryfallRuling[] => {
    if (typeof item !== "object" || item === null) return [];
    const { source, published_at, comment } = item as Partial<Record<keyof ScryfallRuling, unknown>>;
    if (typeof source !== "string" || typeof published_at !== "string" || typeof comment !== "string") {
      return [];
    }
    return [{ source, published_at, comment }];
  });
}

/** Map.set that drops the oldest entry once the map is full. */
function setCapped<V>(map: Map<string, V>, key: string, value: V, max: number) {
  if (!map.has(key) && map.size >= max) {
    const oldest = map.keys().next().value as string | undefined;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

const FALSEY = new Set(["0", "false", "off", "no"]);
const TRUTHY = new Set(["1", "true", "on", "yes"]);

/**
 * The fallback is on by default and off in tests. Set SCRYFALL_FALLBACK to
 * "off" to turn it off anywhere (CI, local dev without network), or to "on"
 * to force it on.
 */
export function isScryfallFallbackEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = env.SCRYFALL_FALLBACK?.trim().toLowerCase();
  if (flag && FALSEY.has(flag)) return false;
  if (flag && TRUTHY.has(flag)) return true;
  return env.NODE_ENV !== "test";
}

/** Normalize the user's text the same way for single-flight and the miss cache. */
export function normalizeQuery(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Build a Scryfall query that matches names containing the text. */
export function buildNameQuery(name: string): string {
  const text = name.trim().replace(/\s+/g, " ").replace(/["\\]/g, "");
  return `name:"${text}"`;
}

type Fetch = typeof fetch;

export interface ScryfallClientOptions {
  fetchImpl?: Fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  logger?: Pick<Console, "warn">;
}

export function createScryfallClient(options: ScryfallClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<Fetch>) => fetch(...args));
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const logger = options.logger ?? console;

  // Requests go out one at a time through this chain, each at least
  // MIN_REQUEST_GAP_MS after the previous one started.
  let queue: Promise<unknown> = Promise.resolve();
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  let blockedUntil = 0;
  const inFlight = new Map<string, Promise<SearchOutcome>>();
  const misses = new Map<string, number>();
  const rulingsInFlight = new Map<string, Promise<RulingsOutcome>>();
  const rulingsCache = new Map<string, { rulings: ScryfallRuling[]; at: number }>();

  function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = lastRequestAt + MIN_REQUEST_GAP_MS - now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = now();
      return task();
    });
    queue = run.catch(() => undefined);
    return run;
  }

  function block(retryAfterHeader: string | null) {
    const retryAfterMs = Number(retryAfterHeader) * 1000;
    const cooldown = Number.isFinite(retryAfterMs)
      ? Math.max(RATE_LIMIT_COOLDOWN_MS, retryAfterMs)
      : RATE_LIMIT_COOLDOWN_MS;
    blockedUntil = now() + cooldown;
  }

  /** GET a Scryfall URL with our headers, a timeout and the 429 pause. */
  async function getJson(url: URL): Promise<FetchOutcome> {
    // Another request may have hit a 429 while this one waited its turn.
    if (now() < blockedUntil) return { status: "rate_limited" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url.toString(), {
        headers: SCRYFALL_HEADERS,
        signal: controller.signal,
      });
      if (response.status === 429) {
        block(response.headers.get("retry-after"));
        logger.warn("Scryfall returned 429, pausing Scryfall requests");
        return { status: "rate_limited" };
      }
      if (response.status === 404) return { status: "not_found" };
      if (!response.ok) {
        return { status: "error", message: `Scryfall returned ${response.status}` };
      }
      const body = (await response.json()) as unknown;
      return { status: "ok", body };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "error", message };
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(query: string): Promise<SearchOutcome> {
    const url = new URL("/cards/search", SCRYFALL_API);
    url.searchParams.set("q", query);

    const outcome = await getJson(url);
    if (outcome.status !== "ok") return outcome;
    const data = (outcome.body as Partial<ScryfallList> | null)?.data;
    const cards = Array.isArray(data) ? data : [];
    return cards.length ? { status: "ok", cards } : { status: "not_found" };
  }

  async function requestRulings(id: string): Promise<RulingsOutcome> {
    const outcome = await getJson(new URL(`/cards/${id}/rulings`, SCRYFALL_API));
    // A card Scryfall doesn't know has no rulings to show.
    if (outcome.status === "not_found") return { status: "ok", rulings: [] };
    if (outcome.status !== "ok") return outcome;
    return { status: "ok", rulings: readRulings(outcome.body) };
  }

  /** Search Scryfall for cards whose name contains `name` (first page only). */
  async function searchByName(name: string): Promise<SearchOutcome> {
    const key = normalizeQuery(name);
    if (key.length < MIN_QUERY_LENGTH) {
      return { status: "skipped", reason: "query too short" };
    }
    if (now() < blockedUntil) return { status: "rate_limited" };

    const missedAt = misses.get(key);
    if (missedAt !== undefined) {
      if (now() - missedAt < NEGATIVE_CACHE_MS) return { status: "not_found" };
      misses.delete(key);
    }

    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = schedule(() => request(buildNameQuery(name)))
      .then((outcome) => {
        if (outcome.status === "not_found") {
          setCapped(misses, key, now(), MAX_REMEMBERED_MISSES);
        }
        return outcome;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  /**
   * A card's rulings (https://scryfall.com/docs/api/rulings). Only UUIDs are
   * sent; answers are kept for RULINGS_CACHE_MS and failures aren't kept.
   */
  async function getRulings(id: string): Promise<RulingsOutcome> {
    const key = id.trim().toLowerCase();
    if (!isScryfallId(key)) return { status: "skipped", reason: "not a Scryfall card id" };

    const cached = rulingsCache.get(key);
    if (cached) {
      if (now() - cached.at < RULINGS_CACHE_MS) return { status: "ok", rulings: cached.rulings };
      rulingsCache.delete(key);
    }
    if (now() < blockedUntil) return { status: "rate_limited" };

    const pending = rulingsInFlight.get(key);
    if (pending) return pending;

    const promise = schedule(() => requestRulings(key))
      .then((outcome) => {
        if (outcome.status === "ok") {
          setCapped(rulingsCache, key, { rulings: outcome.rulings, at: now() }, MAX_CACHED_RULINGS);
        }
        return outcome;
      })
      .finally(() => rulingsInFlight.delete(key));
    rulingsInFlight.set(key, promise);
    return promise;
  }

  return { searchByName, getRulings };
}

export type ScryfallClient = ReturnType<typeof createScryfallClient>;

/** Shared client so the limiter, breaker and caches cover every request in this process. */
export const scryfall: ScryfallClient = createScryfallClient();
