/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";

import ScanMatches, { type MatchOption } from "./ScanMatches";

const matches: MatchOption[] = [
  { id: "bolt", name: "Lightning Bolt", score: 0.95, imageUrl: null },
  { id: "blast", name: "Lightning Blast", score: 0.8, imageUrl: null },
];

function setup(overrides: Partial<React.ComponentProps<typeof ScanMatches>> = {}) {
  const props: React.ComponentProps<typeof ScanMatches> = {
    query: "Lightning Bolt",
    matches,
    selectedId: "bolt",
    onSelect: jest.fn(),
    auth: "signed-in",
    signInUrl: "/api/auth/signin?callbackUrl=%2Fscan",
    collectionName: "Burn",
    onAdd: jest.fn(),
    onScanNext: jest.fn(),
    ...overrides,
  };
  render(<ScanMatches {...props} />);
  return props;
}

describe("ScanMatches", () => {
  test("marks the selected match and lets another be picked", () => {
    const { onSelect } = setup();

    const bolt = screen.getByRole("button", { name: /Lightning Bolt 95% match/ });
    const blast = screen.getByRole("button", { name: /Lightning Blast 80% match/ });
    expect(bolt.getAttribute("aria-pressed")).toBe("true");
    expect(blast.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(blast);
    expect(onSelect).toHaveBeenCalledWith("blast");
  });

  test("adds the selected card to the chosen collection", () => {
    const { onAdd } = setup({ selectedId: "blast" });

    fireEvent.click(screen.getByRole("button", { name: "Add Lightning Blast to Burn" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test("disables adding while a card is being added", () => {
    setup({ adding: true });

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Adding..." }).disabled).toBe(true);
  });

  test("asks for a collection when there isn't one", () => {
    setup({ collectionName: null });

    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
    expect(screen.getByText(/Pick or create a collection/)).toBeTruthy();
  });

  test("offers the next scan or another copy once added", () => {
    const { onScanNext, onAdd } = setup({ addedName: "Lightning Bolt" });

    expect(screen.getByRole("status").textContent).toBe("Added Lightning Bolt to Burn.");
    fireEvent.click(screen.getByRole("button", { name: "Scan next card" }));
    fireEvent.click(screen.getByRole("button", { name: "Add another copy" }));
    expect(onScanNext).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test("shows an add error", () => {
    setup({ error: "Card not found" });

    expect(screen.getByRole("alert").textContent).toBe("Couldn't add the card: Card not found");
  });

  test("signed-out users get a sign-in prompt instead of add controls", () => {
    setup({ auth: "signed-out" });

    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/api/auth/signin?callbackUrl=%2Fscan");
  });

  test("shows neither while the session is loading", () => {
    setup({ auth: "loading" });

    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
