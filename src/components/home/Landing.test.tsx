/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from "@testing-library/react";

import { FEATURES } from "./features";
import { GEM_PIPS } from "./pips";
import Landing from "./Landing";
import { NAVIGATE_AFTER_MS } from "./TapCard";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
}));

const bolt = { id: "bolt", name: "Lightning Bolt", imageUrl: "https://cards.scryfall.io/normal/bolt.jpg" };

describe("Landing", () => {
  test("names the app in the hero card and says it's a collection tracker", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.getByRole("heading", { level: 1, name: "Magic Vault" })).toBeTruthy();
    expect(screen.getByText(/Legendary Artifact . Collection Tracker/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Costs 0. It's free." })).toBeTruthy();
  });

  test("links both sign-in buttons back to the home page", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    const signIn = "/api/auth/signin?callbackUrl=%2F";
    expect(screen.getByRole("link", { name: "Start your vault" }).getAttribute("href")).toBe(signIn);
    expect(screen.getByRole("link", { name: /^Keep/ }).getAttribute("href")).toBe(signIn);
    expect(screen.getByRole("link", { name: /^Mulligan/ }).getAttribute("href")).toBe("/search");
  });

  test("has a search form that goes to /search", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    const box = screen.getByRole("searchbox", { name: "Search cards" });
    expect(box.getAttribute("name")).toBe("q");
    expect(box.closest("form")?.getAttribute("action")).toBe("/search");
  });

  test("deals every feature as a card, sending signed-in ones through sign-in", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(
      expect.arrayContaining(["Search Every Card", "Build Decks", "Scan With Your Camera"]),
    );
    expect(screen.getByRole("link", { name: /Search Every Card/ }).getAttribute("href")).toBe("/search");
    expect(screen.getByRole("link", { name: /Build Decks/ }).getAttribute("href")).toBe(
      "/api/auth/signin?callbackUrl=%2Fdecks",
    );
  });

  test("shows featured card images, and a framed name for missing ones", () => {
    render(<Landing featuredCards={[bolt]} cardCount={null} />);

    expect(screen.getByRole("img", { name: "Lightning Bolt" })).toBeTruthy();
    expect(screen.getByText("Black Lotus")).toBeTruthy();
  });

  test("shows the card count only when there is one", () => {
    const { rerender } = render(<Landing featuredCards={[]} cardCount={null} />);
    expect(screen.queryByText(/cards to search/)).toBeNull();

    rerender(<Landing featuredCards={[]} cardCount={120276} />);
    expect(screen.getByText("120,276 cards to search, prices updated daily.")).toBeTruthy();
  });

  test("answers the usual questions as rulings", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.getByRole("heading", { name: "Call a judge" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Is it actually free?" })).toBeTruthy();
  });

  test("doesn't mention flagged-off features", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.queryByText(/\bAI\b/)).toBeNull();
    expect(screen.queryByText(/affiliate/i)).toBeNull();
  });

  test("shows the Scryfall credit and the Fan Content Policy notice", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.getByRole("link", { name: "Scryfall" }).getAttribute("href")).toBe("https://scryfall.com");
    expect(screen.getByText(/unofficial Fan Content/i)).toBeTruthy();
  });

  test("clicking a feature card taps that card, then goes to its page", () => {
    jest.useFakeTimers();
    try {
      render(<Landing featuredCards={[]} cardCount={null} />);
      const link = screen.getByRole("link", { name: /Search Every Card/ });

      fireEvent.click(link);

      expect(link.closest("[data-tapped]")).toBe(link.parentElement);
      expect(push).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(NAVIGATE_AFTER_MS));
      expect(push).toHaveBeenCalledWith("/search");
    } finally {
      jest.useRealTimers();
    }
  });

  test("the hero card's buttons tap the hero card", () => {
    jest.useFakeTimers();
    try {
      render(<Landing featuredCards={[]} cardCount={null} />);

      fireEvent.click(screen.getByRole("link", { name: "What is this?" }));

      const hero = screen.getByRole("region", { name: "Magic Vault" });
      expect(hero.parentElement?.dataset.tapped).toBe("true");
      act(() => jest.advanceTimersByTime(NAVIGATE_AFTER_MS));
      expect(push).toHaveBeenCalledWith("/about");
    } finally {
      jest.useRealTimers();
    }
  });

  test("every feature's spell includes the pips of its cost", () => {
    for (const feature of FEATURES) {
      for (const tone of feature.cost) {
        expect(feature.colors).toContain(GEM_PIPS[tone]);
      }
    }
  });
});
