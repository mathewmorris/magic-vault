import {
  MIN_REQUEST_GAP_MS,
  NEGATIVE_CACHE_MS,
  RATE_LIMIT_COOLDOWN_MS,
  SCRYFALL_HEADERS,
  buildNameQuery,
  createScryfallClient,
  isScryfallFallbackEnabled,
  type ScryfallCard,
} from "./client";

const card = (overrides: Partial<ScryfallCard> = {}): ScryfallCard => ({
  id: "c1",
  name: "Black Lotus",
  scryfall_uri: "https://scryfall.com/card/lea/232/black-lotus",
  image_status: "highres_scan",
  layout: "normal",
  image_uris: { small: "https://cards.scryfall.io/small/x.jpg" },
  ...overrides,
});

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const list = (cards: ScryfallCard[]) => jsonResponse(200, { object: "list", has_more: false, data: cards });
const notFound = () =>
  jsonResponse(404, { object: "error", code: "not_found", status: 404, details: "No cards found" });

/** A fake clock: sleep advances it instead of waiting. */
function setup(responses: Array<Response | Error | (() => Promise<Response>)>) {
  let time = 1_000_000;
  const sleeps: number[] = [];
  const requestTimes: number[] = [];
  const fetchImpl = jest.fn((_url: string, _init?: RequestInit) => {
    requestTimes.push(time);
    const next = responses.shift();
    if (next === undefined) throw new Error("unexpected fetch");
    if (next instanceof Error) return Promise.reject(next);
    if (typeof next === "function") return next();
    return Promise.resolve(next);
  });
  const client = createScryfallClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => time,
    sleep: (ms) => {
      sleeps.push(ms);
      time += ms;
      return Promise.resolve();
    },
    logger: { warn: jest.fn() },
  });
  return {
    client,
    fetchImpl,
    sleeps,
    requestTimes,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("isScryfallFallbackEnabled", () => {
  test("is off under NODE_ENV=test unless forced on", () => {
    expect(isScryfallFallbackEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(isScryfallFallbackEnabled({ NODE_ENV: "test", SCRYFALL_FALLBACK: "on" })).toBe(true);
  });

  test("is on by default and can be turned off", () => {
    expect(isScryfallFallbackEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(isScryfallFallbackEnabled({ NODE_ENV: "production", SCRYFALL_FALLBACK: "off" })).toBe(false);
    expect(isScryfallFallbackEnabled({ NODE_ENV: "development", SCRYFALL_FALLBACK: "0" })).toBe(false);
  });
});

describe("buildNameQuery", () => {
  test("quotes the name and drops characters that would break the quote", () => {
    expect(buildNameQuery('  black   "lotus\\ ')).toBe('name:"black lotus"');
  });
});

describe("scryfall client searchByName", () => {
  test("sends the search with User-Agent, Accept and a timeout signal", async () => {
    const { client, fetchImpl } = setup([list([card()])]);

    await expect(client.searchByName("Black Lotus")).resolves.toEqual({
      status: "ok",
      cards: [card()],
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://api.scryfall.com/cards/search");
    expect(parsed.searchParams.get("q")).toBe('name:"Black Lotus"');
    expect(init?.headers).toEqual(SCRYFALL_HEADERS);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("skips queries shorter than 3 characters without calling Scryfall", async () => {
    const { client, fetchImpl } = setup([]);

    await expect(client.searchByName(" ab ")).resolves.toEqual({
      status: "skipped",
      reason: "query too short",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("treats 404 as no cards found and remembers the miss for a while", async () => {
    const { client, fetchImpl, advance } = setup([notFound(), notFound()]);

    await expect(client.searchByName("zzzz")).resolves.toEqual({ status: "not_found" });
    await expect(client.searchByName("ZZZZ ")).resolves.toEqual({ status: "not_found" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    advance(NEGATIVE_CACHE_MS + 1);
    await expect(client.searchByName("zzzz")).resolves.toEqual({ status: "not_found" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("spaces requests at least 500 ms apart", async () => {
    const { client, requestTimes } = setup([notFound(), notFound(), notFound()]);

    await Promise.all([
      client.searchByName("first"),
      client.searchByName("second"),
      client.searchByName("third"),
    ]);

    expect(requestTimes).toHaveLength(3);
    expect(requestTimes[1]! - requestTimes[0]!).toBeGreaterThanOrEqual(MIN_REQUEST_GAP_MS);
    expect(requestTimes[2]! - requestTimes[1]!).toBeGreaterThanOrEqual(MIN_REQUEST_GAP_MS);
  });

  test("shares one request between identical searches in flight", async () => {
    let resolve: (r: Response) => void = () => undefined;
    const slow = () => new Promise<Response>((r) => (resolve = r));
    const { client, fetchImpl } = setup([slow]);

    const a = client.searchByName("Black Lotus");
    const b = client.searchByName("black lotus");
    await Promise.resolve();
    await Promise.resolve();
    resolve(list([card()]));

    await expect(a).resolves.toEqual({ status: "ok", cards: [card()] });
    await expect(b).resolves.toEqual({ status: "ok", cards: [card()] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("after a 429 stops calling Scryfall for at least 30 seconds", async () => {
    const { client, fetchImpl, advance } = setup([
      jsonResponse(429, { object: "error", status: 429 }),
      list([card()]),
    ]);

    await expect(client.searchByName("lotus")).resolves.toEqual({ status: "rate_limited" });
    await expect(client.searchByName("mox pearl")).resolves.toEqual({ status: "rate_limited" });
    advance(RATE_LIMIT_COOLDOWN_MS - 1_000);
    await expect(client.searchByName("mox pearl")).resolves.toEqual({ status: "rate_limited" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    advance(2_000);
    await expect(client.searchByName("lotus")).resolves.toEqual({ status: "ok", cards: [card()] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("honors a Retry-After longer than 30 seconds", async () => {
    const { client, fetchImpl, advance } = setup([
      jsonResponse(429, { object: "error", status: 429 }, { "retry-after": "90" }),
      list([card()]),
    ]);

    await client.searchByName("lotus");
    advance(60_000);
    await expect(client.searchByName("lotus")).resolves.toEqual({ status: "rate_limited" });
    advance(31_000);
    await expect(client.searchByName("lotus")).resolves.toEqual({ status: "ok", cards: [card()] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("reports network errors and other statuses without throwing", async () => {
    const { client } = setup([new Error("socket hang up"), jsonResponse(503, {})]);

    await expect(client.searchByName("lotus")).resolves.toEqual({
      status: "error",
      message: "socket hang up",
    });
    await expect(client.searchByName("lotus")).resolves.toEqual({
      status: "error",
      message: "Scryfall returned 503",
    });
  });

  test("aborts a request that takes longer than the timeout", async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      const client = createScryfallClient({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 100,
        logger: { warn: jest.fn() },
      });

      const pending = client.searchByName("lotus");
      await jest.advanceTimersByTimeAsync(150);
      await expect(pending).resolves.toEqual({ status: "error", message: "aborted" });
    } finally {
      jest.useRealTimers();
    }
  });
});
