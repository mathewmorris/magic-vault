import { type GemTone } from "./features";

/**
 * Colors for the "spell" a card casts when it taps: the five Magic colors,
 * colorless, and Magic Vault's own pink and purple. These are plain colored
 * circles, not mana symbols.
 */
export type PipColor = "W" | "U" | "B" | "R" | "G" | "C" | "pink" | "purple";

/** Fill and glow for each pip. Black gets a purple glow so it still shows on dark pages. */
export const PIP_STYLES: Record<PipColor, { fill: string; glow: string }> = {
  W: { fill: "#f8efd2", glow: "#fff7dc" },
  U: { fill: "#2f80d6", glow: "#6fb4ff" },
  B: { fill: "#2a2230", glow: "#a094c8" },
  R: { fill: "#e0452f", glow: "#ff8a6b" },
  G: { fill: "#2e9a57", glow: "#6fe39a" },
  C: { fill: "#b9b4ae", glow: "#e6e1db" },
  pink: { fill: "#fa0aa9", glow: "#fc7eb4" },
  purple: { fill: "#685aa2", glow: "#a094c8" },
};

/** Magic Vault's own colors, for the hero card and anything without a cost. */
export const VAULT_COLORS: PipColor[] = ["pink", "purple"];

/** The pip each decorative cost gem stands for. */
export const GEM_PIPS: Record<GemTone, PipColor> = {
  pink: "pink",
  purple: "purple",
  plain: "C",
};
