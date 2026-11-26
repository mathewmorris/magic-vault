"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { prefersReducedMotion } from "./motion";
import { type PipColor, VAULT_COLORS } from "./pips";
import { useCastSpell } from "./SpellProvider";

/** How long the tap takes. Matches duration-300 on the card. */
export const TAP_MS = 300;
/** When the page changes: just after the tap lands. */
export const NAVIGATE_AFTER_MS = 320;
/** If the page somehow never changes, untap after this long. */
const UNTAP_AFTER_MS = 4000;
/** Keep a tapped card this far from the sides of the screen. */
const EDGE_GAP = 8;

type TapCardValue = {
  /** Tap the card, cast its spell, then go to href. */
  tap: (href: string) => void;
};

const TapCardContext = createContext<TapCardValue | null>(null);

/** The card a link or form sits on, or null if it isn't on one. */
export function useTapCard() {
  return useContext(TapCardContext);
}

/**
 * How much to shrink a card while it's turned sideways so it stays on
 * screen. A tall card turned 90 degrees gets as wide as it was tall.
 */
function tapScale(rect: DOMRect) {
  const width = document.documentElement.clientWidth || window.innerWidth;
  const center = rect.left + rect.width / 2;
  const room = 2 * Math.min(center - EDGE_GAP, width - EDGE_GAP - center);
  if (rect.height <= 0 || room <= 0) return 1;
  return Math.min(1, room / rect.height);
}

/** The middle of the part of the card you can see, so the spell starts on screen. */
function visibleCenter(rect: DOMRect) {
  const left = Math.max(rect.left, 0);
  const right = Math.min(rect.right, window.innerWidth);
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  return {
    x: right > left ? (left + right) / 2 : rect.left + rect.width / 2,
    y: bottom > top ? (top + bottom) / 2 : rect.top + rect.height / 2,
  };
}

/**
 * Something drawn as a card. Links and search boxes on it (TapLink,
 * QuickSearch) tap it before they navigate: it turns 90 degrees like a
 * tapped permanent and casts a spell in its colors over the page.
 */
export default function TapCard({
  colors = VAULT_COLORS,
  className = "",
  children,
}: {
  /** The spell's colors. Defaults to Magic Vault's pink and purple. */
  colors?: PipColor[];
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const castSpell = useCastSpell();
  const ref = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [scale, setScale] = useState<number | null>(null);

  const untap = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setScale(null);
  }, []);

  // Untap when the page changes, and when the back button brings this page
  // back from the browser's cache still tapped.
  useEffect(() => {
    untap();
  }, [pathname, untap]);
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) untap();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      timers.current.forEach(clearTimeout);
    };
  }, [untap]);

  const navigate = useCallback(
    (href: string) => {
      // Sign-in lives in an API route, which needs a full page load.
      if (href.startsWith("/api/")) window.location.assign(href);
      else router.push(href);
    },
    [router],
  );

  const value = useMemo<TapCardValue>(
    () => ({
      tap(href) {
        if (prefersReducedMotion()) {
          navigate(href);
          return;
        }
        // Already tapped and on its way. Don't navigate twice.
        if (timers.current.length > 0) return;

        const rect = ref.current?.getBoundingClientRect();
        setScale(rect ? tapScale(rect) : 1);
        if (rect) castSpell?.({ ...visibleCenter(rect), colors });
        timers.current.push(
          setTimeout(() => navigate(href), NAVIGATE_AFTER_MS),
          setTimeout(untap, UNTAP_AFTER_MS),
        );
      },
    }),
    [castSpell, colors, navigate, untap],
  );

  const tapped = scale !== null;
  return (
    <TapCardContext.Provider value={value}>
      <div
        ref={ref}
        data-tapped={tapped ? "true" : undefined}
        className={`relative transition-transform duration-300 ease-out motion-reduce:transition-none ${tapped ? "z-30" : ""} ${className}`}
        style={tapped ? { transform: `rotate(90deg) scale(${scale})` } : undefined}
      >
        {children}
      </div>
    </TapCardContext.Provider>
  );
}
