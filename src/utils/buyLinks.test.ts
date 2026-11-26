import {
  AFFILIATE_OFF,
  anyAffiliate,
  buyLinks,
  cardKingdomPage,
  cardmarketPage,
  tcgplayerPage,
  type AffiliateConfig,
} from "./buyLinks";

// Shaped like a real Scryfall card's purchase_uris.
const SCRYFALL_TCGPLAYER =
  "https://partner.tcgplayer.com/c/4931599/1830156/21018?subId1=api&u=https%3A%2F%2Fwww.tcgplayer.com%2Fproduct%2F286354%3Fpage%3D1";
const SCRYFALL_CARDMARKET =
  "https://www.cardmarket.com/en/Magic/Products/Search?referrer=scryfall&searchString=Lightning+Bolt&utm_campaign=card_prices&utm_medium=text&utm_source=scryfall";

const bolt = {
  name: "Lightning Bolt",
  purchase_uris: {
    tcgplayer: SCRYFALL_TCGPLAYER,
    cardmarket: SCRYFALL_CARDMARKET,
    cardhoarder: "https://www.cardhoarder.com/cards/12345?affiliate_id=scryfall",
  },
};

const noUris = { name: "Fire // Ice", purchase_uris: null };

const ON: AffiliateConfig = {
  enabled: true,
  tcgplayerUrl: "https://partner.tcgplayer.com/c/1111111/2222222/21018",
  cardKingdomPartner: "magicvault",
};

function byStore(links: ReturnType<typeof buyLinks>) {
  return Object.fromEntries(links.map((link) => [link.store, link]));
}

describe("store pages", () => {
  test("pulls the plain TCGplayer product page out of Scryfall's redirect", () => {
    expect(tcgplayerPage(bolt)).toBe("https://www.tcgplayer.com/product/286354?page=1");
  });

  test("keeps a direct TCGplayer link but drops its tracking", () => {
    expect(
      tcgplayerPage({
        name: "x",
        purchase_uris: { tcgplayer: "https://www.tcgplayer.com/product/1?utm_source=scryfall&page=1" },
      }),
    ).toBe("https://www.tcgplayer.com/product/1?page=1");
  });

  test("searches TCGplayer by name when Scryfall has no link", () => {
    const url = new URL(tcgplayerPage(noUris));
    expect(url.hostname).toBe("www.tcgplayer.com");
    expect(url.searchParams.get("q")).toBe("Fire // Ice");
  });

  test("ignores links to other hosts or over http", () => {
    for (const tcgplayer of [
      "https://evil.example/product/1",
      "http://www.tcgplayer.com/product/1",
      "https://partner.tcgplayer.com/c/1/2/3?u=https%3A%2F%2Fevil.example%2F",
      "not a url",
    ]) {
      expect(new URL(tcgplayerPage({ name: "Bolt", purchase_uris: { tcgplayer } })).pathname).toBe(
        "/search/magic/product",
      );
    }
  });

  test("Card Kingdom is always a search by name", () => {
    const url = new URL(cardKingdomPage(bolt));
    expect(url.hostname).toBe("www.cardkingdom.com");
    expect(url.searchParams.get("filter[name]")).toBe("Lightning Bolt");
  });

  test("Cardmarket uses Scryfall's link, or a search when there is none", () => {
    expect(cardmarketPage(bolt)).toBe(new URL(SCRYFALL_CARDMARKET).toString());
    expect(new URL(cardmarketPage(noUris)).searchParams.get("searchString")).toBe("Fire // Ice");
  });
});

describe("buyLinks", () => {
  test("with the switch off, passes Scryfall's links through and marks nothing as ours", () => {
    const links = buyLinks(bolt, AFFILIATE_OFF);
    expect(links.map((link) => link.store)).toEqual(["tcgplayer", "cardkingdom", "cardmarket"]);
    const stores = byStore(links);
    expect(stores.tcgplayer?.href).toBe(new URL(SCRYFALL_TCGPLAYER).toString());
    expect(stores.cardmarket?.href).toBe(new URL(SCRYFALL_CARDMARKET).toString());
    expect(stores.cardkingdom?.href).not.toContain("partner=");
    expect(anyAffiliate(links)).toBe(false);
  });

  test("defaults to off", () => {
    expect(anyAffiliate(buyLinks(bolt))).toBe(false);
  });

  test("IDs do nothing while the switch is off", () => {
    const links = buyLinks(bolt, { ...ON, enabled: false });
    expect(anyAffiliate(links)).toBe(false);
    expect(byStore(links).tcgplayer?.href).not.toContain("1111111");
  });

  test("with the switch on, TCGplayer goes through our Impact link to the plain product page", () => {
    const tcg = byStore(buyLinks(bolt, ON)).tcgplayer;
    expect(tcg?.affiliate).toBe(true);
    const url = new URL(tcg!.href);
    expect(`${url.origin}${url.pathname}`).toBe("https://partner.tcgplayer.com/c/1111111/2222222/21018");
    expect(url.searchParams.get("u")).toBe("https://www.tcgplayer.com/product/286354?page=1");
    expect(url.searchParams.get("subId1")).toBeNull();
  });

  test("with the switch on, Card Kingdom gets our partner ID", () => {
    const ck = byStore(buyLinks(bolt, ON)).cardkingdom;
    expect(ck?.affiliate).toBe(true);
    const url = new URL(ck!.href);
    expect(url.searchParams.get("partner")).toBe("magicvault");
    expect(url.searchParams.get("utm_medium")).toBe("affiliate");
    expect(url.searchParams.get("filter[name]")).toBe("Lightning Bolt");
  });

  test("Cardmarket never gets our tracking", () => {
    const cm = byStore(buyLinks(bolt, ON)).cardmarket;
    expect(cm?.affiliate).toBe(false);
    expect(cm?.href).toBe(new URL(SCRYFALL_CARDMARKET).toString());
  });

  test("a store with no ID keeps Scryfall's link while the switch is on", () => {
    const links = byStore(buyLinks(bolt, { enabled: true, cardKingdomPartner: "magicvault" }));
    expect(links.tcgplayer?.affiliate).toBe(false);
    expect(links.tcgplayer?.href).toBe(new URL(SCRYFALL_TCGPLAYER).toString());
    expect(links.cardkingdom?.affiliate).toBe(true);
  });

  test("a bad TCGplayer tracking link falls back to the untracked link", () => {
    const tcg = byStore(buyLinks(bolt, { enabled: true, tcgplayerUrl: "http://insecure.example/c/1" })).tcgplayer;
    expect(tcg?.affiliate).toBe(false);
    expect(tcg?.href).toBe(new URL(SCRYFALL_TCGPLAYER).toString());
  });

  test("cards with no purchase_uris still get search links", () => {
    const links = buyLinks(noUris, ON);
    expect(links).toHaveLength(3);
    const tcg = new URL(byStore(links).tcgplayer!.href);
    expect(new URL(tcg.searchParams.get("u")!).searchParams.get("q")).toBe("Fire // Ice");
  });
});
