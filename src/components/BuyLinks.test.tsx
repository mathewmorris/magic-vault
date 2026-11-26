/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import { AFFILIATE_DISCLOSURE, type BuyLink } from "~/utils/buyLinks";
import BuyLinks from "./BuyLinks";

const plain: BuyLink[] = [
  { store: "tcgplayer", label: "TCGplayer", href: "https://www.tcgplayer.com/product/1", affiliate: false },
  { store: "cardkingdom", label: "Card Kingdom", href: "https://www.cardkingdom.com/catalog/search", affiliate: false },
];

const tracked: BuyLink[] = [
  { ...plain[0]!, href: "https://partner.tcgplayer.com/c/1/2/21018?u=x", affiliate: true },
  plain[1]!,
];

describe("BuyLinks", () => {
  test("renders nothing with no links", () => {
    const { container } = render(<BuyLinks links={[]} cardName="Bolt" />);
    expect(container.firstChild).toBeNull();
  });

  test("links to each store in a new tab, with no disclosure when none are ours", () => {
    render(<BuyLinks links={plain} cardName="Lightning Bolt" />);

    const link = screen.getByRole("link", { name: /buy lightning bolt on tcgplayer/i });
    expect(link.getAttribute("href")).toBe("https://www.tcgplayer.com/product/1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByText(AFFILIATE_DISCLOSURE)).toBeNull();
  });

  test("marks affiliate links sponsored and shows the disclosure on the card page", () => {
    render(<BuyLinks links={tracked} cardName="Lightning Bolt" />);

    const link = screen.getByRole("link", { name: /on tcgplayer/i });
    expect(link.getAttribute("rel")).toBe("sponsored noopener noreferrer");
    expect(screen.getByRole("link", { name: /on card kingdom/i }).getAttribute("rel")).toBe(
      "noopener noreferrer",
    );
    expect(screen.getByText(AFFILIATE_DISCLOSURE)).toBeTruthy();
  });

  test("the compact grid version leaves the disclosure to the page", () => {
    render(<BuyLinks links={tracked} cardName="Lightning Bolt" variant="compact" />);

    expect(screen.getByRole("list", { name: "Buy Lightning Bolt" })).toBeTruthy();
    expect(screen.queryByText(AFFILIATE_DISCLOSURE)).toBeNull();
  });
});
