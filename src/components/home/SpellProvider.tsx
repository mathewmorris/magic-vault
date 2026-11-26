"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { prefersReducedMotion } from "./motion";
import { PIP_STYLES, type PipColor } from "./pips";

/** How long the spell overlay stays up, start to finish. */
export const SPELL_MS = 700;

const PIP_COUNT = 18;

export type SpellCast = {
  /** Where the spell starts, in viewport pixels. */
  x: number;
  y: number;
  colors: PipColor[];
};

type Pip = { angle: number; distance: number; size: number; delay: number; color: PipColor };
type Spell = SpellCast & { id: number; radius: number; pips: Pip[] };

const SpellContext = createContext<((cast: SpellCast) => void) | null>(null);

/** Casts a spell over the page. Null outside a SpellProvider. */
export function useCastSpell() {
  return useContext(SpellContext);
}

function makeSpell(cast: SpellCast, id: number): Spell {
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Far enough to reach the farthest corner, so the wash covers the screen.
  const radius = Math.hypot(Math.max(cast.x, width - cast.x), Math.max(cast.y, height - cast.y));
  const colors = cast.colors.length > 0 ? cast.colors : (["pink"] as PipColor[]);
  const pips = Array.from({ length: PIP_COUNT }, (_, index) => ({
    angle: (index * 360) / PIP_COUNT + Math.random() * 14,
    distance: radius * (0.3 + Math.random() * 0.45),
    size: 10 + Math.round(Math.random() * 12),
    delay: Math.round(Math.random() * 70),
    color: colors[index % colors.length]!,
  }));
  return { ...cast, colors, id, radius, pips };
}

/** A radial wash made of every color in the spell, strongest in the middle. */
function washGradient(colors: PipColor[]) {
  const stops = colors.map((color, index) => {
    const alpha = Math.round(230 - (index / colors.length) * 110)
      .toString(16)
      .padStart(2, "0");
    return `${PIP_STYLES[color].fill}${alpha} ${Math.round((index / colors.length) * 58)}%`;
  });
  return `radial-gradient(circle, ${stops.join(", ")}, transparent 72%)`;
}

function SpellOverlay({ spell }: { spell: Spell }) {
  const { x, y, radius } = spell;
  return (
    <div
      aria-hidden="true"
      data-testid="spell-overlay"
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden motion-reduce:hidden"
    >
      <div
        className="absolute animate-spell-wash rounded-full"
        style={{
          left: x - radius,
          top: y - radius,
          width: radius * 2,
          height: radius * 2,
          background: washGradient(spell.colors),
        }}
      />
      <div className="absolute h-0 w-0 animate-spell-swirl" style={{ left: x, top: y }}>
        {spell.pips.map((pip, index) => {
          const { fill, glow } = PIP_STYLES[pip.color];
          return (
            <span key={index} className="absolute left-0 top-0" style={{ transform: `rotate(${pip.angle}deg)` }}>
              <span
                className="absolute left-0 top-0 block animate-spell-pip rounded-full"
                style={
                  {
                    width: pip.size,
                    height: pip.size,
                    animationDelay: `${pip.delay}ms`,
                    background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85) 0 18%, ${fill} 48%)`,
                    boxShadow: `0 0 0 1.5px rgba(255,255,255,0.45), 0 0 14px 2px ${glow}`,
                    "--pip-distance": `${Math.round(pip.distance)}px`,
                  } as React.CSSProperties
                }
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Holds the full-screen "spell" a tapped card casts. It sits above the
 * pages, so the spell keeps fading while the next page loads.
 */
export default function SpellProvider({ children }: { children: React.ReactNode }) {
  const [spell, setSpell] = useState<Spell | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const nextId = useRef(0);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setSpell(null);
  }, []);

  const cast = useCallback(
    (next: SpellCast) => {
      if (prefersReducedMotion()) return;
      clearTimeout(timer.current);
      nextId.current += 1;
      setSpell(makeSpell(next, nextId.current));
      timer.current = setTimeout(clear, SPELL_MS);
    },
    [clear],
  );

  useEffect(() => {
    // Coming back with the back button can restore the page as it was left,
    // spell and all. Clear it.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) clear();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      clearTimeout(timer.current);
    };
  }, [clear]);

  return (
    <SpellContext.Provider value={cast}>
      {children}
      {spell ? createPortal(<SpellOverlay key={spell.id} spell={spell} />, document.body) : null}
    </SpellContext.Provider>
  );
}
