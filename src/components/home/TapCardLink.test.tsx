/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from "@testing-library/react";

import { setCardTap } from "~/utils/cardTap";

import TapCardLink, { NAVIGATE_AFTER_MS } from "./TapCardLink";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
}));

function renderCard() {
  render(
    <TapCardLink href="/card/abc">
      <span>Lightning Bolt</span>
    </TapCardLink>,
  );
  return screen.getByRole("link", { name: "Lightning Bolt" });
}

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
  window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  jest.useRealTimers();
});

test("taps the card, then opens it", () => {
  const link = renderCard();
  fireEvent.click(link);

  expect(link.getAttribute("data-tapped")).toBe("true");
  expect(push).not.toHaveBeenCalled();

  act(() => {
    jest.advanceTimersByTime(NAVIGATE_AFTER_MS);
  });
  expect(push).toHaveBeenCalledWith("/card/abc");
});

test("opens once even if clicked twice", () => {
  const link = renderCard();
  fireEvent.click(link);
  fireEvent.click(link);
  act(() => {
    jest.advanceTimersByTime(NAVIGATE_AFTER_MS);
  });
  expect(push).toHaveBeenCalledTimes(1);
});

test("doesn't tap when the setting is off", () => {
  act(() => {
    setCardTap(false);
  });
  const link = renderCard();
  fireEvent.click(link);
  expect(link.getAttribute("data-tapped")).toBeNull();
});

test("doesn't tap for less motion or a new-tab click", () => {
  const link = renderCard();
  fireEvent.click(link, { metaKey: true });
  expect(link.getAttribute("data-tapped")).toBeNull();

  window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  fireEvent.click(link);
  expect(link.getAttribute("data-tapped")).toBeNull();
});
