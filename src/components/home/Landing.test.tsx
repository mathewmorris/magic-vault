/**
 * @jest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";

import Landing from "./Landing";

const bolt = { id: "bolt", name: "Lightning Bolt", imageUrl: "https://cards.scryfall.io/normal/bolt.jpg" };

describe("Landing", () => {
  test("leads with the headline and sends sign-in back to the home page", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.getByRole("heading", { level: 1, name: "Your binder has a search bar now" })).toBeTruthy();
    for (const link of screen.getAllByRole("link", { name: "Start your vault" })) {
      expect(link.getAttribute("href")).toBe("/api/auth/signin?callbackUrl=%2F");
    }
  });

  test("has a search form that goes to /search", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    const box = screen.getByRole("searchbox", { name: "Search cards" });
    expect(box.getAttribute("name")).toBe("q");
    expect(box.closest("form")?.getAttribute("action")).toBe("/search");
  });

  test("the search demo runs its query for real", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.getByRole("link", { name: /Run this search/ }).getAttribute("href")).toBe(
      "/search?q=t%3Adragon%20c%3Ar%20mv%3C%3D4",
    );
  });

  test("sends signed-in features through sign-in, and search straight to search", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.getByRole("link", { name: /Open search/ }).getAttribute("href")).toBe("/search");
    expect(screen.getByRole("link", { name: /Build a deck/ }).getAttribute("href")).toBe(
      "/api/auth/signin?callbackUrl=%2Fdecks",
    );
    expect(screen.getByRole("link", { name: /Start a collection/ }).getAttribute("href")).toBe(
      "/api/auth/signin?callbackUrl=%2Fcollections",
    );
  });

  test("shows featured card art linking to the card, and a framed name for missing ones", () => {
    render(<Landing featuredCards={[bolt]} cardCount={null} />);

    const collection = screen.getByRole("region", { name: "Every copy, counted." });
    const image = within(collection).getByRole("img", { name: "Lightning Bolt" });
    expect(image.closest("a")?.getAttribute("href")).toBe("/card/bolt");
    expect(within(collection).getByText("Black Lotus")).toBeTruthy();
  });

  test("shows the card count only when there is one", () => {
    const { rerender } = render(<Landing featuredCards={[]} cardCount={null} />);
    expect(screen.queryByText(/cards to search/)).toBeNull();

    rerender(<Landing featuredCards={[]} cardCount={120276} />);
    expect(screen.getByText("120,276 cards to search")).toBeTruthy();
  });

  test("doesn't mention flagged-off features", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.queryByText(/\bAI\b/)).toBeNull();
    expect(screen.queryByText(/affiliate/i)).toBeNull();
  });

  test("shows the Fan Content Policy notice", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.getByText(/unofficial Fan Content/i)).toBeTruthy();
  });
});
