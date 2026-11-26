/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from "@testing-library/react";

import QuickSearch from "./QuickSearch";
import SpellProvider, { SPELL_MS } from "./SpellProvider";
import TapCard, { NAVIGATE_AFTER_MS } from "./TapCard";
import TapLink from "./TapLink";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
}));

// Whether the last click was cancelled. Cancelling it here, after React has
// seen it, also keeps jsdom from trying to follow the link.
let lastClickPrevented = false;
function recordClick(event: MouseEvent) {
  lastClickPrevented = event.defaultPrevented;
  event.preventDefault();
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

function renderCard(link: React.ReactNode = <TapLink href="/about">About</TapLink>) {
  render(
    <SpellProvider>
      <TapCard colors={["U", "pink"]}>
        <div data-testid="card">{link}</div>
      </TapCard>
    </SpellProvider>,
  );
  return screen.getByTestId("card").parentElement!;
}

describe("TapLink", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setReducedMotion(false);
    lastClickPrevented = false;
    document.addEventListener("click", recordClick);
  });

  afterEach(() => {
    document.removeEventListener("click", recordClick);
    jest.useRealTimers();
  });

  test("a plain click taps the card, casts the spell, then navigates", () => {
    const card = renderCard();

    fireEvent.click(screen.getByRole("link", { name: "About" }));

    expect(lastClickPrevented).toBe(true);
    expect(card.dataset.tapped).toBe("true");
    expect(card.style.transform).toContain("rotate(90deg)");
    expect(screen.getByTestId("spell-overlay").getAttribute("aria-hidden")).toBe("true");
    expect(push).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(NAVIGATE_AFTER_MS));
    expect(push).toHaveBeenCalledWith("/about");
    expect(push).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(SPELL_MS));
    expect(screen.queryByTestId("spell-overlay")).toBeNull();
  });

  test("keeps a real link, and a double click only navigates once", () => {
    renderCard();
    const link = screen.getByRole("link", { name: "About" });
    expect(link.getAttribute("href")).toBe("/about");

    fireEvent.click(link);
    fireEvent.click(link);
    act(() => jest.advanceTimersByTime(NAVIGATE_AFTER_MS));

    expect(push).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["cmd", { metaKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["middle", { button: 1 }],
  ])("a %s click works like a normal link", (_name, init) => {
    const card = renderCard();

    fireEvent.click(screen.getByRole("link", { name: "About" }), init);
    act(() => jest.advanceTimersByTime(NAVIGATE_AFTER_MS));

    expect(lastClickPrevented).toBe(false);
    expect(card.dataset.tapped).toBeUndefined();
    expect(push).not.toHaveBeenCalled();
  });

  test("links that open a new tab don't tap", () => {
    renderCard(
      <TapLink href="/about" target="_blank">
        About
      </TapLink>,
    );

    fireEvent.click(screen.getByRole("link", { name: "About" }));

    expect(lastClickPrevented).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  test("with reduced motion it skips the tap and the spell and navigates right away", () => {
    setReducedMotion(true);
    const card = renderCard();

    fireEvent.click(screen.getByRole("link", { name: "About" }));

    expect(push).toHaveBeenCalledWith("/about");
    expect(card.dataset.tapped).toBeUndefined();
    expect(screen.queryByTestId("spell-overlay")).toBeNull();
  });

  test("untaps when the back button restores the page from the cache", () => {
    const card = renderCard();
    fireEvent.click(screen.getByRole("link", { name: "About" }));
    expect(card.dataset.tapped).toBe("true");

    act(() => {
      const event = new Event("pageshow") as PageTransitionEvent;
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    });

    expect(card.dataset.tapped).toBeUndefined();
    expect(screen.queryByTestId("spell-overlay")).toBeNull();
  });

  test("off a card it's just a link", () => {
    render(<TapLink href="/about">About</TapLink>);

    fireEvent.click(screen.getByRole("link", { name: "About" }));
    act(() => jest.advanceTimersByTime(NAVIGATE_AFTER_MS));

    expect(push).not.toHaveBeenCalled();
  });

  test("searching from a card taps it, then goes to the search page", () => {
    const card = renderCard(<QuickSearch />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "lightning bolt" },
    });
    fireEvent.submit(screen.getByRole("search"));

    expect(card.dataset.tapped).toBe("true");
    expect(push).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(NAVIGATE_AFTER_MS));
    expect(push).toHaveBeenCalledWith("/search?q=lightning+bolt");
  });
});
