/**
 * Deciding when to capture automatically from the live detection loop.
 *
 * The detector runs a few times a second. Once the card's outline has held
 * still for `stableMs`, it's safe to capture: the user has stopped moving it
 * and the photo will be sharp. After a capture the tracker disarms so the
 * same card isn't captured over and over while it sits there. It re-arms when
 * the card leaves (the detector loses it for a couple of ticks in a row), or
 * when the outline jumps far enough that it must be a different card put down
 * in the same spot. `rearmedBy` says which of those it was, so the scanner
 * can tell a card nudged in place (a jump, same card) from the next copy of
 * the same card put down after the first was taken away.
 */

import type { Point, Quad } from "./geometry";

export type TrackerOptions = {
  /** How long the outline must hold still before auto capture. */
  stableMs: number;
  /** Largest corner movement between ticks, as a fraction of the frame diagonal, that counts as still. */
  stillTolerance: number;
  /** Ticks in a row without a card that count as the card having left. */
  missesToRearm: number;
  /** A jump this big (fraction of the diagonal) means a different card; re-arm. */
  swapDistance: number;
};

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  stableMs: 800,
  stillTolerance: 0.02,
  missesToRearm: 2,
  swapDistance: 0.15,
};

export type TrackerUpdate = {
  /** The outline has been still long enough to trust. */
  locked: boolean;
  /** Capture now (only when armed and locked; the tracker disarms itself). */
  fire: boolean;
};

/**
 * Why the tracker is armed: "start" (never fired yet), "left" (the card was
 * gone for missesToRearm ticks), "swap" (the outline jumped by swapDistance),
 * "manual" (arm() was called, e.g. Rescan) or "retry" (arm("retry"), another
 * look at the same card).
 */
export type RearmReason = "start" | "left" | "swap" | "manual" | "retry";

export function scaleQuad(quad: Quad, scale: number): Quad {
  return quad.map((point) => ({ x: point.x * scale, y: point.y * scale })) as Quad;
}

/** Largest distance any corner moved, as a fraction of the frame's diagonal. */
export function quadMovement(a: Quad, b: Quad, frameWidth: number, frameHeight: number): number {
  const diagonal = Math.hypot(frameWidth, frameHeight) || 1;
  let worst = 0;
  for (let i = 0; i < 4; i++) {
    const p: Point = a[i]!;
    const q: Point = b[i]!;
    worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return worst / diagonal;
}

export class AutoCaptureTracker {
  private readonly options: TrackerOptions;
  private armed = true;
  private misses = 0;
  private last: Quad | null = null;
  private stableSince: number | null = null;
  /** Where the outline was when we last captured, to spot a card swap. */
  private capturedAt: Quad | null = null;
  private reason: RearmReason = "start";

  constructor(options: Partial<TrackerOptions> = {}) {
    this.options = { ...DEFAULT_TRACKER_OPTIONS, ...options };
  }

  get isArmed(): boolean {
    return this.armed;
  }

  /** Why the tracker was last armed; read it when it fires. */
  get rearmedBy(): RearmReason {
    return this.reason;
  }

  /** Feed one tick of the detection loop. */
  update(quad: Quad | null, frameWidth: number, frameHeight: number, now: number): TrackerUpdate {
    const { stableMs, stillTolerance, missesToRearm, swapDistance } = this.options;

    if (!quad) {
      this.misses++;
      this.last = null;
      this.stableSince = null;
      if (this.misses >= missesToRearm) {
        this.armed = true;
        this.capturedAt = null;
        this.reason = "left";
      }
      return { locked: false, fire: false };
    }

    this.misses = 0;
    const moved = this.last ? quadMovement(this.last, quad, frameWidth, frameHeight) : Infinity;
    if (moved > stillTolerance || this.stableSince === null) this.stableSince = now;
    this.last = quad;

    if (
      !this.armed &&
      this.capturedAt &&
      quadMovement(this.capturedAt, quad, frameWidth, frameHeight) >= swapDistance
    ) {
      this.armed = true;
      this.capturedAt = null;
      this.reason = "swap";
    }

    const locked = now - this.stableSince >= stableMs;
    const fire = locked && this.armed;
    if (fire) this.disarm();
    return { locked, fire };
  }

  /** Call on every capture, manual or automatic. */
  disarm(): void {
    this.armed = false;
    this.capturedAt = this.last;
  }

  /**
   * Allow the next auto capture: "manual" when the user asks for it (Rescan),
   * "retry" for another look at the card still in view.
   */
  arm(reason: "manual" | "retry" = "manual"): void {
    this.armed = true;
    this.capturedAt = null;
    this.reason = reason;
  }
}
