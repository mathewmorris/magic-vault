/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import Dashboard from "./Dashboard";

type Query = { data?: unknown; isLoading: boolean; isError: boolean };

const queries: { collections: Query; values: Query; decks: Query } = {
  collections: { isLoading: true, isError: false },
  values: { isLoading: true, isError: false },
  decks: { isLoading: true, isError: false },
};

const prefetchCards = jest.fn();

jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      collection: {
        byId: { getData: () => undefined, setData: jest.fn() },
        cards: { prefetch: prefetchCards },
      },
    }),
    collection: {
      getAll: { useQuery: () => queries.collections },
      values: { useQuery: () => queries.values },
    },
    deck: {
      getAll: { useQuery: () => queries.decks },
    },
  },
}));

const loaded = (data: unknown): Query => ({ data, isLoading: false, isError: false });

describe("Dashboard", () => {
  beforeEach(() => {
    queries.collections = loaded([]);
    queries.values = loaded({});
    queries.decks = loaded([]);
  });

  test("greets the user by first name", () => {
    render(<Dashboard name="Mat Morris" />);

    expect(screen.getByRole("heading", { name: "Welcome back, Mat" })).toBeTruthy();
  });

  test("shows empty states that link to making a collection and a deck", () => {
    render(<Dashboard />);

    expect(screen.getByRole("link", { name: "Make your first collection" }).getAttribute("href")).toBe(
      "/collection/create",
    );
    expect(screen.getByRole("link", { name: "Build your first deck" }).getAttribute("href")).toBe("/decks");
  });

  test("lists collections newest first with their value, and totals them", () => {
    queries.collections = loaded([
      { id: "old", name: "Old box", updatedAt: new Date("2026-01-01") },
      { id: "new", name: "Binder", updatedAt: new Date("2026-11-01") },
    ]);
    queries.values = loaded({ old: { totalCents: 1000, unpriced: 0 }, new: { totalCents: 2550, unpriced: 1 } });

    render(<Dashboard />);

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
      .filter((href) => href?.startsWith("/collection/") && href !== "/collection/create");
    expect(hrefs).toEqual(["/collection/new", "/collection/old"]);
    expect(screen.getByText("$25.50")).toBeTruthy();
    expect(screen.getByText("$35.50")).toBeTruthy();
  });

  test("loads the listed collections' cards before they're clicked", () => {
    queries.collections = loaded([
      { id: "old", name: "Old box", updatedAt: new Date("2026-01-01") },
      { id: "new", name: "Binder", updatedAt: new Date("2026-11-01") },
    ]);

    render(<Dashboard />);

    expect(prefetchCards).toHaveBeenCalledWith({ collectionId: "new" }, expect.anything());
    expect(prefetchCards).toHaveBeenCalledWith({ collectionId: "old" }, expect.anything());
  });

  test("lists decks with their format and card count", () => {
    queries.decks = loaded([{ id: "d1", name: "Goblins", format: "commander", cardCount: 1, updatedAt: new Date() }]);

    render(<Dashboard />);

    expect(screen.getByRole("link", { name: /Goblins/ }).getAttribute("href")).toBe("/deck/d1");
    expect(screen.getByText("Commander · 1 card")).toBeTruthy();
  });

  test("shows an error when collections fail to load", () => {
    queries.collections = { isLoading: false, isError: true };

    render(<Dashboard />);

    expect(screen.getByText(/Couldn.t load your collections/)).toBeTruthy();
  });
});
