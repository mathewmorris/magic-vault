"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The card tap setting: whether the cards on the home page turn sideways
 * (tap) before they open. It's on by default and saved per browser, so it
 * works signed out too.
 */
const STORAGE_KEY = "mv.cardTap";
/** Set when someone turns tapping off, so turning it back on can earn Untap Step. */
const WENT_OFF_KEY = "mv.cardTap.wentOff";
/** Achievements earned while signed out, claimed the next time Settings loads signed in. */
const PENDING_KEY = "mv.achievements.pending";
const CHANGE_EVENT = "mv:cardtap";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Used only when the browser refuses storage, so the switch still works on this page. */
let memoryValue: boolean | null = null;

export function isCardTapOn(): boolean {
  if (typeof window === "undefined") return true;
  const saved = read(STORAGE_KEY);
  if (saved === "off") return false;
  if (saved === "on") return true;
  return memoryValue ?? true;
}

/**
 * Turn card tapping on or off. Returns true when this change earns Untap
 * Step: it was turned off earlier and is now back on.
 */
export function setCardTap(on: boolean): boolean {
  memoryValue = write(STORAGE_KEY, on ? "on" : "off") ? null : on;
  let earned = false;
  if (!on) {
    write(WENT_OFF_KEY, "1");
  } else if (read(WENT_OFF_KEY) === "1") {
    write(WENT_OFF_KEY, null);
    earned = true;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return earned;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** [on, setOn] for the card tap setting, kept in step across the page and other tabs. */
export function useCardTap(): [boolean, (on: boolean) => boolean] {
  const on = useSyncExternalStore(subscribe, isCardTapOn, () => true);
  const setOn = useCallback((next: boolean) => setCardTap(next), []);
  return [on, setOn];
}

export function pendingAchievements(): string[] {
  if (typeof window === "undefined") return [];
  const saved = read(PENDING_KEY);
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function addPendingAchievement(key: string) {
  const pending = pendingAchievements();
  if (!pending.includes(key)) write(PENDING_KEY, JSON.stringify([...pending, key]));
}

export function clearPendingAchievements() {
  write(PENDING_KEY, null);
}
