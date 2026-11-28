/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import Landing from "./Landing";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/",
}));

const bolt = { id: "bolt", name: "Lightning Bolt", imageUrl: "https://cards.scryfall.io/normal/bolt.jpg" };

describe("Landing", () => {
  test("links sign-in back to the home page", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    const link = screen.getByRole("link", { name: "Start your vault" });
    expect(link.getAttribute("href")).toBe("/api/auth/signin?callbackUrl=%2F");
  });

  test("has a search form that goes to /search", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    const box = screen.getByRole("searchbox", { name: "Search cards" });
    expect(box.getAttribute("name")).toBe("q");
    expect(box.closest("form")?.getAttribute("action")).toBe("/search");
  });

  test("sends signed-in features through sign-in, and search straight to search", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.getByRole("link", { name: /Search every card/ }).getAttribute("href")).toBe("/search");
    expect(screen.getByRole("link", { name: /Build decks/ }).getAttribute("href")).toBe(
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
    expect(screen.getByText("120,276 cards to search, updated every day.")).toBeTruthy();
  });

  test("shows the Fan Content Policy notice", () => {
    render(<Landing featuredCards={[]} cardCount={null} />);

    expect(screen.getByText(/unofficial Fan Content/i)).toBeTruthy();
  });
});
