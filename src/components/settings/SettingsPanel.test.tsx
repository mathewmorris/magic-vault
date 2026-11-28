/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";

import { isCardTapOn, pendingAchievements } from "~/utils/cardTap";

import SettingsPanel from "./SettingsPanel";

let sessionStatus = "unauthenticated";
jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: sessionStatus }),
}));

const success = jest.fn();
jest.mock("~/components/toast", () => ({
  useToast: () => ({ success, error: jest.fn(), info: jest.fn() }),
}));

const unlock = jest.fn();
let earned: { key: string; earnedAt: Date }[] = [];
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({ achievement: { list: { invalidate: jest.fn() } } }),
    achievement: {
      list: { useQuery: () => ({ data: earned }) },
      unlock: { useMutation: () => ({ mutate: unlock }) },
    },
  },
}));

beforeEach(() => {
  window.localStorage.clear();
  sessionStatus = "unauthenticated";
  earned = [];
});

test("the switch turns card tap off and on", () => {
  render(<SettingsPanel />);
  const toggle = screen.getByRole("switch", { name: "Card tap" });
  expect(toggle.getAttribute("aria-checked")).toBe("true");

  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(isCardTapOn()).toBe(false);
});

test("signed in, turning it off and back on unlocks Untap Step", () => {
  sessionStatus = "authenticated";
  render(<SettingsPanel />);
  const toggle = screen.getByRole("switch", { name: "Card tap" });

  fireEvent.click(toggle);
  expect(unlock).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  expect(unlock).toHaveBeenCalledWith({ key: "untap-step" });
});

test("signed out, it's kept for later and asks them to sign in", () => {
  render(<SettingsPanel />);
  const toggle = screen.getByRole("switch", { name: "Card tap" });

  fireEvent.click(toggle);
  fireEvent.click(toggle);

  expect(unlock).not.toHaveBeenCalled();
  expect(pendingAchievements()).toEqual(["untap-step"]);
  expect(success).toHaveBeenCalledWith(expect.stringContaining("Sign in to keep it"));
  expect(screen.getByText("Earned, sign in to keep it")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/api/auth/signin?callbackUrl=%2Fsettings");
});

test("claims achievements earned while signed out", () => {
  window.localStorage.setItem("mv.achievements.pending", JSON.stringify(["untap-step", "not-real"]));
  sessionStatus = "authenticated";
  render(<SettingsPanel />);

  expect(unlock).toHaveBeenCalledTimes(1);
  expect(unlock).toHaveBeenCalledWith({ key: "untap-step" });
  expect(pendingAchievements()).toEqual([]);
});

test("shows earned and locked achievements with their reward", () => {
  sessionStatus = "authenticated";
  render(<SettingsPanel />);
  expect(screen.getByText("Untap Step")).toBeTruthy();
  expect(screen.getByText("Locked")).toBeTruthy();
  expect(screen.getByText(/Reward: Free AI scan credits/)).toBeTruthy();
});
