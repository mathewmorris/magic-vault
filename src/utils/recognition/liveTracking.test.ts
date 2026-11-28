import type { Quad } from "./geometry";
import { AutoCaptureTracker, quadMovement, scaleQuad } from "./liveTracking";

function quadAt(x: number, y: number, w = 200, h = 280): Quad {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

const W = 640;
const H = 480; // diagonal 800

describe("quadMovement", () => {
  test("is the largest corner move over the frame diagonal", () => {
    expect(quadMovement(quadAt(0, 0), quadAt(0, 0), W, H)).toBe(0);
    expect(quadMovement(quadAt(0, 0), quadAt(8, 0), W, H)).toBeCloseTo(0.01);
  });
});

describe("scaleQuad", () => {
  test("scales every corner", () => {
    expect(scaleQuad(quadAt(10, 20, 1, 1), 2)[2]).toEqual({ x: 22, y: 42 });
  });
});

describe("AutoCaptureTracker", () => {
  test("fires once the outline has held still long enough, then disarms", () => {
    const tracker = new AutoCaptureTracker({ stableMs: 800 });

    expect(tracker.update(quadAt(100, 100), W, H, 0)).toEqual({ locked: false, fire: false });
    expect(tracker.update(quadAt(101, 100), W, H, 400)).toEqual({ locked: false, fire: false });
    expect(tracker.update(quadAt(102, 101), W, H, 800)).toEqual({ locked: true, fire: true });
    // Still there and still locked, but it already captured this card.
    expect(tracker.update(quadAt(102, 101), W, H, 1200)).toEqual({ locked: true, fire: false });
    expect(tracker.isArmed).toBe(false);
  });

  test("movement restarts the clock", () => {
    const tracker = new AutoCaptureTracker({ stableMs: 800 });

    tracker.update(quadAt(100, 100), W, H, 0);
    tracker.update(quadAt(160, 100), W, H, 600); // moved 60px = 7.5% of the diagonal
    expect(tracker.update(quadAt(160, 100), W, H, 1000).fire).toBe(false);
    expect(tracker.update(quadAt(160, 100), W, H, 1400).fire).toBe(true);
  });

  test("re-arms once the card leaves, then fires for the next one", () => {
    const tracker = new AutoCaptureTracker({ stableMs: 100, missesToRearm: 2 });

    tracker.update(quadAt(100, 100), W, H, 0);
    expect(tracker.update(quadAt(100, 100), W, H, 100).fire).toBe(true);

    tracker.update(null, W, H, 200);
    expect(tracker.isArmed).toBe(false); // one miss can be a detector blip
    tracker.update(null, W, H, 300);
    expect(tracker.isArmed).toBe(true);

    tracker.update(quadAt(100, 100), W, H, 400);
    expect(tracker.update(quadAt(100, 100), W, H, 500).fire).toBe(true);
  });

  test("a single missed tick doesn't re-arm", () => {
    const tracker = new AutoCaptureTracker({ stableMs: 100, missesToRearm: 2 });

    tracker.update(quadAt(100, 100), W, H, 0);
    tracker.update(quadAt(100, 100), W, H, 100);
    tracker.update(null, W, H, 200);
    tracker.update(quadAt(100, 100), W, H, 300);
    expect(tracker.update(quadAt(100, 100), W, H, 500).fire).toBe(false);
  });

  test("a card swapped into a different spot re-arms without leaving the frame", () => {
    const tracker = new AutoCaptureTracker({ stableMs: 100, swapDistance: 0.15 });

    tracker.update(quadAt(100, 100), W, H, 0);
    expect(tracker.update(quadAt(100, 100), W, H, 100).fire).toBe(true);

    tracker.update(quadAt(300, 120), W, H, 200); // 200px = 25% of the diagonal
    expect(tracker.update(quadAt(300, 120), W, H, 300).fire).toBe(true);
  });

  test("manual captures disarm too, and arm() allows the next one", () => {
    const tracker = new AutoCaptureTracker({ stableMs: 100 });

    tracker.update(quadAt(100, 100), W, H, 0);
    tracker.disarm();
    expect(tracker.update(quadAt(100, 100), W, H, 200).fire).toBe(false);
    tracker.arm();
    expect(tracker.update(quadAt(100, 100), W, H, 300).fire).toBe(true);
  });

  test("says why it re-armed: the card left, the outline jumped, or arm() was called", () => {
    const tracker = new AutoCaptureTracker({ stableMs: 100, missesToRearm: 2, swapDistance: 0.15 });
    expect(tracker.rearmedBy).toBe("start");

    tracker.update(quadAt(100, 100), W, H, 0);
    tracker.update(quadAt(100, 100), W, H, 100); // fires
    tracker.update(quadAt(300, 120), W, H, 200);
    expect(tracker.rearmedBy).toBe("swap");

    tracker.update(quadAt(300, 120), W, H, 300); // fires
    tracker.update(null, W, H, 400);
    tracker.update(null, W, H, 500);
    expect(tracker.rearmedBy).toBe("left");

    tracker.disarm();
    tracker.arm("retry");
    expect(tracker.rearmedBy).toBe("retry");
    tracker.arm();
    expect(tracker.rearmedBy).toBe("manual");
  });
});
