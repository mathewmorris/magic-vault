"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCardTap } from "~/utils/cardTap";

/** When the page changes: just after the 300ms tap lands. */
export const NAVIGATE_AFTER_MS = 320;
/** If the page somehow never changes, untap after this long. */
const UNTAP_AFTER_MS = 4000;
/** Keep a tapped card this far from the sides of the screen. */
const EDGE_GAP = 8;

function prefersReducedMotion() {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

/**
 * A link on a real card image. Clicking it taps the card (turns it 90
 * degrees like a tapped permanent), then opens the card. Tapping can be
 * turned off in Settings, and it's skipped for people who ask their system
 * for less motion and for clicks that open a new tab.
 */
export default function TapCardLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tapOn] = useCardTap();
  const ref = useRef<HTMLAnchorElement>(null);
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

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    if (!tapOn || newTab || prefersReducedMotion()) return;
    event.preventDefault();
    // Already tapped and on its way. Don't navigate twice.
    if (timers.current.length > 0) return;

    const rect = ref.current?.getBoundingClientRect();
    setScale(rect ? tapScale(rect) : 1);
    timers.current.push(
      setTimeout(() => router.push(href), NAVIGATE_AFTER_MS),
      setTimeout(untap, UNTAP_AFTER_MS),
    );
  };

  const tapped = scale !== null;
  return (
    <Link
      ref={ref}
      href={href}
      onClick={onClick}
      data-tapped={tapped ? "true" : undefined}
      className={`relative block transition-transform duration-300 ease-out motion-reduce:transition-none ${tapped ? "z-30" : ""} ${className}`}
      style={tapped ? { transform: `rotate(90deg) scale(${scale})` } : undefined}
    >
      {children}
    </Link>
  );
}
