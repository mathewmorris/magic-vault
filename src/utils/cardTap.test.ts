/**
 * @jest-environment jsdom
 */
import {
  addPendingAchievement,
  clearPendingAchievements,
  isCardTapOn,
  pendingAchievements,
  setCardTap,
} from "./cardTap";

beforeEach(() => {
  window.localStorage.clear();
});

describe("card tap setting", () => {
  test("is on by default", () => {
    expect(isCardTapOn()).toBe(true);
  });

  test("remembers being turned off", () => {
    setCardTap(false);
    expect(isCardTapOn()).toBe(false);
    expect(window.localStorage.getItem("mv.cardTap")).toBe("off");
  });

  test("earns Untap Step only when turned back on after being off", () => {
    expect(setCardTap(true)).toBe(false);
    expect(setCardTap(false)).toBe(false);
    expect(setCardTap(true)).toBe(true);
    // Once per trip off and back on.
    expect(setCardTap(true)).toBe(false);
  });

  test("tells the page when it changes", () => {
    const listener = jest.fn();
    window.addEventListener("mv:cardtap", listener);
    setCardTap(false);
    window.removeEventListener("mv:cardtap", listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("pending achievements", () => {
  test("keeps each key once until cleared", () => {
    addPendingAchievement("untap-step");
    addPendingAchievement("untap-step");
    expect(pendingAchievements()).toEqual(["untap-step"]);
    clearPendingAchievements();
    expect(pendingAchievements()).toEqual([]);
  });

  test("ignores junk in storage", () => {
    window.localStorage.setItem("mv.achievements.pending", "not json");
    expect(pendingAchievements()).toEqual([]);
  });
});
