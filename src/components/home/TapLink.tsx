"use client";

import Link from "next/link";

import { useTapCard } from "./TapCard";

type TapLinkProps = Omit<React.ComponentProps<typeof Link>, "href"> & { href: string };

/**
 * Should this click tap the card? Only a plain left click on a link to
 * another page here. Clicks that open a new tab or window, downloads and
 * links off the site work like any other link.
 */
export function shouldTap(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = event.currentTarget;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  return href.startsWith("/") && !href.startsWith("//");
}

/**
 * A next/link for links that live on a card (inside a TapCard). Clicking
 * it taps the card, casts the card's spell and then goes to the page. It's
 * still a real link, so it works without JavaScript, and Enter on it gets
 * the same effect.
 */
export default function TapLink({ href, onClick, ...props }: TapLinkProps) {
  const card = useTapCard();
  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!card || !shouldTap(event, href)) return;
        event.preventDefault();
        card.tap(href);
      }}
    />
  );
}
