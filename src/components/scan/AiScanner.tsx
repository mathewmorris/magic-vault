"use client";

/**
 * AI card scanning for /scan (behind the aiScan feature flag). Hands free:
 *
 *   1. While the camera runs, a card detector looks at about 4 frames a
 *      second and the card's outline is drawn over the video.
 *   2. Once the outline holds still, a short burst of frames is taken, the
 *      card is cut out and flattened, and an image model turns it into an
 *      embedding; OCR reads the name and the collector info off the sharpest
 *      frame at the same time.
 *   3. The server finds the closest printings by embedding (and the exact
 *      printing by set + number when OCR read them), and ~/utils/recognition
 *      /fuse ranks everything together.
 *   4. Sure (see sureMatch in ~/utils/recognition/scanLoop): it locks onto
 *      the top match, buzzes, chimes and flashes green, and adds it to the
 *      current collection (when "Auto add when sure" is on and there's a
 *      signed-in user with a collection; otherwise it selects it and waits
 *      for Add). Then it waits for the card to leave the frame, or for a
 *      different card to be put down, before scanning again, so a card
 *      sitting there is never added twice. Undo takes that copy back out;
 *      Rescan does that too and looks at the card again.
 *      Not sure: it looks again, up to MAX_SCAN_ATTEMPTS bursts on the same
 *      card, then shows the matches for a manual pick.
 *
 * Nothing captured is kept: frames and crops live only for the scan, and the
 * result shows Scryfall's image of the match. Only the embedding and the OCR
 * reads go to the server (scan.match). The debug view alone keeps the last
 * flattened card, to show it.
 *
 * If the models can't load or the server has no image index yet, this calls
 * onUnavailable and the page falls back to the title-OCR scanner.
 */

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "~/components/Button";
import CameraFeed, { type FrameGrabber } from "~/components/CameraFeed";
import ScanMatches, { type MatchOption } from "~/components/scan/ScanMatches";
import { api } from "~/utils/api";
import { isFeatureEnabled } from "~/utils/featureFlags";
import { faceImageUrl, printingDetail } from "~/utils/recognition/display";
import type { RecognitionCandidate } from "~/utils/recognition/fuse";
import type { Quad } from "~/utils/recognition/geometry";
import { AutoCaptureTracker, scaleQuad, type RearmReason } from "~/utils/recognition/liveTracking";
import { EMBED_MODEL } from "~/utils/recognition/model";
import {
  MAX_SCAN_ATTEMPTS,
  bestOf,
  captureMaxSide,
  sureMatch,
} from "~/utils/recognition/scanLoop";
import type { Detection } from "~/utils/recognition/browser/detector";
import { canvasToRgba, rgbaToDataUrl } from "~/utils/recognition/browser/frame";
import {
  useCardRecognizer,
  type RecognitionOutcome,
} from "~/utils/recognition/browser/useCardRecognizer";
import type { RgbaImage } from "~/utils/recognition/preprocess";
import { classifyCameraError, type CameraErrorInfo } from "~/utils/scan/cameraError";
import { cardGuideRect } from "~/utils/scan/cardGuide";
import {
  AUTO_ADD_KEY,
  SOUND_KEY,
  createLockSignal,
  readToggle,
  saveToggle,
} from "~/utils/scan/lockSignal";
import type { ScanCollection } from "~/utils/scan/useScanCollection";

export type ScannerTiming = {
  /** Time between live detection ticks. */
  tickMs: number;
  /** How long the outline must hold still before a scan. */
  stableMs: number;
  /** Frames per capture burst, and the gap between them. */
  burstSize: number;
  burstGapMs: number;
  /**
   * Ticks in a row without a card that mean it was taken away. A little
   * longer than a detector blip, so a card sitting there isn't scanned (and
   * added) again because the outline flickered.
   */
  missesToLeave: number;
  /** How long with no card outline before offering "Scan now". */
  noCardMs: number;
  /** How long the green flash shows. */
  flashMs: number;
};

export const DEFAULT_TIMING: ScannerTiming = {
  tickMs: 250,
  stableMs: 800,
  burstSize: 3,
  burstGapMs: 120,
  missesToLeave: 4,
  noCardMs: 3000,
  flashMs: 700,
};

/** Longest side of frames for live detection (small is fast). Captures size themselves, see captureMaxSide. */
const LIVE_MAX_SIDE = 640;

type Props = {
  scan: ScanCollection;
  /** Called with a short notice when AI scanning can't run here. */
  onUnavailable: (notice: string) => void;
  timing?: Partial<ScannerTiming>;
  /** Show the debug view. Defaults to the aiScanDebug flag. */
  debug?: boolean;
};

/** One live detection as the detector reported it, in frame pixels. */
type RawDetection = { quad: Quad; source: Detection["source"]; score: number };

/**
 * What's kept of a scan: the reads and the ranking, no pixels (the debug
 * view alone keeps the flattened card, as a data URL).
 */
type KeptScan = Omit<RecognitionOutcome, "capture" | "orientedCard"> & {
  id: number;
  /** A card was found in the burst. */
  found: boolean;
  detection: Detection | null;
  /** Debug only: the flat card, the loose crop OCR falls back to, the camera frame. */
  flatCard: string | null;
  looseCard: string | null;
  frame: string | null;
};

type Lock = {
  /** The scan it came from. */
  scanId: number;
  option: MatchOption;
  /** This lock added a copy to the collection by itself. */
  autoAdded: boolean;
  /** ...and Undo took it back out. */
  undone: boolean;
};

const CORNER_LABELS = ["TL", "TR", "BR", "BL"] as const;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const NO_CARD_NOTICE =
  "Couldn't find a card in the picture. Hold it flat inside the frame with some background around it, and try again.";
const NO_LOOK_NOTICE = "Couldn't get a good look at that card. Move it a little, or press Rescan.";

function keepScan(outcome: RecognitionOutcome, id: number, debug: boolean): KeptScan {
  const { capture } = outcome;
  return {
    ocr: outcome.ocr,
    server: outcome.server,
    result: outcome.result,
    orientation: outcome.orientation,
    orientationsTried: outcome.orientationsTried,
    id,
    found: capture !== null,
    detection: capture?.detection ?? null,
    flatCard: debug && capture ? rgbaToDataUrl(capture.best) : null,
    looseCard: debug && capture ? rgbaToDataUrl(capture.loose) : null,
    frame: debug && capture ? rgbaToDataUrl(capture.frame, "image/jpeg", 0.85) : null,
  };
}

function toOption(candidate: RecognitionCandidate): MatchOption {
  return {
    id: candidate.card.id,
    name: candidate.card.name,
    score: Math.min(1, candidate.score),
    imageUrl: faceImageUrl(candidate.card, candidate.face),
    detail: printingDetail(candidate.card) ?? undefined,
  };
}

function canAdd(scan: ScanCollection): boolean {
  return scan.auth === "signed-in" && scan.collectionName !== null;
}

/** How many candidates the debug panel breaks down signal by signal. */
const DEBUG_SIGNAL_CANDIDATES = 3;

/** Debug only: each cue the fuser weighed for the top candidates. */
function SignalBreakdown({ candidates }: { candidates: RecognitionCandidate[] }) {
  return (
    <div data-testid="debug-signals" className="flex flex-col gap-2">
      {candidates.map((candidate) => (
        <div key={`${candidate.card.id}:${candidate.face}`} data-testid="debug-candidate">
          <p>
            {candidate.card.name} ({printingDetail(candidate.card) ?? "?"}):{" "}
            <code>{candidate.score.toFixed(3)}</code>, finish{" "}
            <code>
              {candidate.suggestedFinish.finish} {candidate.suggestedFinish.confidence.toFixed(2)}
            </code>{" "}
            ({candidate.suggestedFinish.reason})
          </p>
          <table className="text-left">
            <thead>
              <tr>
                <th className="pr-3 font-normal">signal</th>
                <th className="pr-3 font-normal">agree</th>
                <th className="pr-3 font-normal">quality</th>
                <th className="font-normal">detail</th>
              </tr>
            </thead>
            <tbody>
              {candidate.signals.map((signal, index) => (
                <tr key={`${signal.signal}:${index}`}>
                  <td className="pr-3">{signal.signal}</td>
                  <td className="pr-3">
                    <code>{signal.agreement.toFixed(2)}</code>
                  </td>
                  <td className="pr-3">
                    <code>{signal.quality.toFixed(2)}</code>
                  </td>
                  <td>{signal.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function QuadOverlay({
  frame,
  quad,
  locked,
  raw,
}: {
  frame: { width: number; height: number };
  quad: Quad | null;
  locked: boolean;
  /** Debug only: the detector's raw output, guide fallback included. */
  raw?: RawDetection | null;
}) {
  const guide = cardGuideRect(frame.width, frame.height);
  const dot = Math.max(4, frame.width / 120);
  const font = Math.max(12, frame.width / 40);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {quad ? (
        <polygon
          data-testid="card-outline"
          data-locked={locked}
          points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={locked ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)"}
          stroke={locked ? "rgb(34,197,94)" : "rgba(255,255,255,0.85)"}
          strokeWidth={Math.max(2, frame.width / 200)}
          strokeLinejoin="round"
        />
      ) : (
        <rect
          x={guide.x}
          y={guide.y}
          width={guide.width}
          height={guide.height}
          rx={guide.width * 0.05}
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={Math.max(2, frame.width / 300)}
          strokeDasharray={`${frame.width / 40} ${frame.width / 60}`}
        />
      )}
      {raw !== undefined && (
        <g data-testid="debug-overlay">
          {raw?.quad.map((p, i) => (
            <g key={CORNER_LABELS[i]}>
              <circle cx={p.x} cy={p.y} r={dot} fill="rgb(236,72,153)" />
              <text
                x={p.x + dot * 1.5}
                y={p.y - dot * 1.5}
                fontSize={font}
                fill="rgb(236,72,153)"
                stroke="black"
                strokeWidth={font / 10}
                paintOrder="stroke"
              >
                {CORNER_LABELS[i]}
              </text>
            </g>
          ))}
          <text
            data-testid="debug-detector"
            x={font / 2}
            y={font * 1.2}
            fontSize={font}
            fill="white"
            stroke="black"
            strokeWidth={font / 10}
            paintOrder="stroke"
          >
            {raw ? `${raw.source} ${raw.score.toFixed(2)}${locked ? " locked" : ""}` : "no card"}
          </text>
        </g>
      )}
    </svg>
  );
}

/** The locked card over the bottom of the video: big name, what happened, Undo and Rescan. */
function LockBanner({
  lock,
  scan,
  onUndo,
  onRescan,
}: {
  lock: Lock;
  scan: ScanCollection;
  onUndo: () => void;
  onRescan: () => void;
}) {
  const { option } = lock;
  let line: React.ReactNode;
  if (lock.undone) {
    line = scan.undoing
      ? "Taking it back out..."
      : scan.undoError
        ? `Couldn't take it back out: ${scan.undoError}`
        : "Took it back out. Pick the right card below, or rescan.";
  } else if (lock.autoAdded) {
    line = scan.adding ? (
      `Adding to ${scan.collectionName ?? "your collection"}...`
    ) : scan.addError ? (
      `Couldn't add it: ${scan.addError}`
    ) : scan.addedName ? (
      <span role="status">
        Added {scan.addedName}
        {scan.collectionName ? ` to ${scan.collectionName}` : ""}.
      </span>
    ) : null;
  } else {
    // Not added by itself (auto add off, or nobody signed in): the matches
    // below have the Add button, or the sign-in prompt, and say when it's added.
    line = scan.addedName ? null : "Got it. Check it below.";
  }

  const showUndo = lock.autoAdded && !lock.undone && !scan.addError;
  return (
    <div
      data-testid="lock-banner"
      className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-black/75 p-3 text-white"
    >
      {option.imageUrl && (
        <Image
          src={option.imageUrl}
          width={56}
          height={78}
          // Scryfall already serves small sizes; skip the optimizer round trip.
          unoptimized
          alt=""
          className="hidden shrink-0 rounded sm:block"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p data-testid="locked-name" className="truncate text-2xl font-bold leading-tight sm:text-3xl">
          {option.name}
        </p>
        {option.detail && <p className="text-xs text-gray-300">{option.detail}</p>}
        {line && <p className="text-sm text-green-300">{line}</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        {showUndo && (
          <Button type="button" onClick={onUndo} disabled={scan.adding || scan.undoing}>
            Undo
          </Button>
        )}
        {lock.autoAdded && !lock.undone && scan.addError && (
          <Button type="button" onClick={() => scan.add(option)} disabled={scan.adding}>
            Try again
          </Button>
        )}
        <Button type="button" onClick={onRescan} disabled={scan.adding || scan.undoing}>
          Rescan
        </Button>
      </div>
    </div>
  );
}

export default function AiScanner({
  scan,
  onUnavailable,
  timing: timingOverrides,
  debug = isFeatureEnabled("aiScanDebug"),
}: Props) {
  const timing = useMemo(() => ({ ...DEFAULT_TIMING, ...timingOverrides }), [timingOverrides]);
  const status = api.scan.status.useQuery(undefined, {
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const recognizer = useCardRecognizer();
  const { load, detect, recognize } = recognizer;
  const loadState = recognizer.state;

  const [cameraKey, setCameraKey] = useState(0);
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const frameSizeRef = useRef<{ width: number; height: number } | null>(null);
  const grabRef = useRef<FrameGrabber | null>(null);
  const [hasFrames, setHasFrames] = useState(false);

  const [liveQuad, setLiveQuad] = useState<Quad | null>(null);
  const [liveRaw, setLiveRaw] = useState<RawDetection | null>(null);
  const [outlineStill, setOutlineStill] = useState(false);
  /** The live outline in video pixels, for sizing the next capture. */
  const lastQuadRef = useRef<Quad | null>(null);
  const trackerRef = useRef<AutoCaptureTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new AutoCaptureTracker({
      stableMs: timing.stableMs,
      missesToRearm: timing.missesToLeave,
    });
  }

  const [autoAdd, setAutoAdd] = useState(() => readToggle(AUTO_ADD_KEY, true));
  const [soundOn, setSoundOn] = useState(() => readToggle(SOUND_KEY, true));
  const signalRef = useRef<ReturnType<typeof createLockSignal> | null>(null);
  if (!signalRef.current) signalRef.current = createLockSignal();
  const [flashId, setFlashId] = useState<number | null>(null);

  const [reading, setReading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Unsure looks so far at the card in view (0 when not retrying). */
  const [attempt, setAttempt] = useState(0);
  const [noCardLong, setNoCardLong] = useState(false);
  /** The scan on screen: a lock, or the matches of an unsure one. */
  const [view, setView] = useState<KeptScan | null>(null);
  /** The latest scan, for the debug panel. */
  const [lastScan, setLastScan] = useState<KeptScan | null>(null);
  const [lock, setLock] = useState<Lock | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const capturingRef = useRef(false);
  const scanIdRef = useRef(0);
  const attemptsRef = useRef(0);
  const bestRef = useRef<KeptScan | null>(null);
  /** Why the tracker was armed when this card's first look started. */
  const seriesReasonRef = useRef<RearmReason | "manual">("start");
  /** The card that was last locked or added, while it may still be in view. */
  const currentCardRef = useRef<string | null>(null);
  const lockRef = useRef<Lock | null>(null);

  // Callbacks from the detection loop read these, so they never go stale.
  const scanRef = useRef(scan);
  const autoAddRef = useRef(autoAdd);
  const soundRef = useRef(soundOn);
  useEffect(() => {
    scanRef.current = scan;
    autoAddRef.current = autoAdd;
    soundRef.current = soundOn;
  });

  const updateLock = useCallback((next: Lock | null) => {
    lockRef.current = next;
    setLock(next);
  }, []);

  // The server has to have an image index for this model, or there's nothing
  // to match against.
  const unavailableRef = useRef(false);
  const giveUp = useCallback(
    (notice: string) => {
      if (unavailableRef.current) return;
      unavailableRef.current = true;
      onUnavailable(notice);
    },
    [onUnavailable],
  );

  // An empty image index still scans: the card is found, squared up and read,
  // and the set and number at the bottom find the printing (see fuse.ts path b).
  const indexReady =
    status.data !== undefined && status.data.enabled && status.data.modelId === EMBED_MODEL.id;
  const textOnly = indexReady && status.data.indexed === 0;

  useEffect(() => {
    if (status.isError) {
      giveUp("Couldn't reach the card scanner, so this reads card names instead.");
    } else if (status.data && !indexReady) {
      giveUp("The card scanner isn't set up yet, so this reads card names instead.");
    }
  }, [status.isError, status.data, indexReady, giveUp]);

  // Load the models only once we know there's something to match against.
  useEffect(() => {
    if (indexReady) void load();
  }, [indexReady, load]);

  useEffect(() => {
    if (loadState.status === "failed") {
      giveUp("The card scanner didn't load on this device, so this reads card names instead.");
    }
  }, [loadState.status, giveUp]);

  const modelsReady = loadState.status === "ready";

  const handleFrameSource = useCallback((grab: FrameGrabber | null) => {
    grabRef.current = grab;
    setHasFrames(grab !== null);
  }, []);

  const handleReady = useCallback((size: { width: number; height: number }) => {
    frameSizeRef.current = size;
    setFrameSize(size);
  }, []);

  // The flash shows for flashMs after each lock.
  useEffect(() => {
    if (flashId === null) return;
    const id = setTimeout(() => setFlashId(null), timing.flashMs);
    return () => clearTimeout(id);
  }, [flashId, timing.flashMs]);

  /** Sure about it: lock on, signal, and add it if allowed. */
  const lockOnto = useCallback(
    (kept: KeptScan, candidate: RecognitionCandidate, reason: RearmReason | "manual") => {
      const option = toOption(candidate);
      // The same card nudged in place (the outline jumped but never left):
      // nothing new to add or announce.
      if (reason === "swap" && currentCardRef.current === option.id) return;

      const current = scanRef.current;
      const autoAdded = autoAddRef.current && canAdd(current);
      currentCardRef.current = option.id;
      updateLock({ scanId: kept.id, option, autoAdded, undone: false });
      setView(kept);
      setSelectedCardId(option.id);
      setListOpen(!autoAdded);
      setNotice(null);
      setFlashId(kept.id);
      signalRef.current?.play({ sound: soundRef.current });
      current.clearAdded();
      if (autoAdded) current.add(option);
    },
    [updateLock],
  );

  /** Not sure (or no card in this burst): look again, or show what it found. */
  const notSure = useCallback(
    (kept: KeptScan, mode: "auto" | "manual") => {
      attemptsRef.current += 1;
      bestRef.current = bestOf(bestRef.current, kept);
      if (mode === "auto" && attemptsRef.current < MAX_SCAN_ATTEMPTS) {
        setAttempt(attemptsRef.current);
        trackerRef.current?.arm("retry");
        return;
      }

      const shown = bestRef.current;
      attemptsRef.current = 0;
      bestRef.current = null;
      setAttempt(0);
      if (!shown.found) {
        setNotice(mode === "manual" ? NO_CARD_NOTICE : NO_LOOK_NOTICE);
        return;
      }
      updateLock(null);
      currentCardRef.current = null;
      setNotice(null);
      setView(shown);
      setListOpen(true);
      setSelectedCardId(shown.result?.candidates[0]?.card.id ?? null);
      scanRef.current.clearAdded();
    },
    [updateLock],
  );

  const startCapture = useCallback(
    async (mode: "auto" | "manual") => {
      if (capturingRef.current || !modelsReady) return;
      const grab = grabRef.current;
      if (!grab) return;
      const tracker = trackerRef.current!;
      const reason = mode === "manual" ? "manual" : tracker.rearmedBy;
      if (reason !== "retry") {
        // A new card (or a fresh start): forget the looks at the last one.
        attemptsRef.current = 0;
        bestRef.current = null;
        seriesReasonRef.current = reason;
        setAttempt(0);
      }
      capturingRef.current = true;
      tracker.disarm();
      setReading(true);
      setErrorMessage(null);

      try {
        const video = frameSizeRef.current;
        const maxSide = video
          ? captureMaxSide(lastQuadRef.current, video.width, video.height)
          : captureMaxSide(null, 0, 0);
        const frames: RgbaImage[] = [];
        for (let i = 0; i < timing.burstSize; i++) {
          if (i > 0) await sleep(timing.burstGapMs);
          const canvas = grab(maxSide);
          if (canvas) frames.push(canvasToRgba(canvas, maxSide));
        }
        const outcome = await recognize(frames, { allowGuideFallback: mode === "manual" });
        const kept = keepScan(outcome, ++scanIdRef.current, debug);
        setLastScan(kept);
        const sure = sureMatch(outcome.result);
        if (sure) {
          attemptsRef.current = 0;
          bestRef.current = null;
          setAttempt(0);
          lockOnto(kept, sure, seriesReasonRef.current);
        } else {
          notSure(kept, mode);
        }
      } catch (error) {
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      } finally {
        capturingRef.current = false;
        setReading(false);
      }
    },
    [modelsReady, recognize, timing.burstGapMs, timing.burstSize, debug, lockOnto, notSure],
  );

  // The loop below runs on an interval; read the latest callback through a
  // ref so it doesn't restart on every render.
  const startCaptureRef = useRef(startCapture);
  useEffect(() => {
    startCaptureRef.current = startCapture;
  }, [startCapture]);

  // Live detection: about 4 times a second, skipping a tick if the last one
  // (or a capture) is still running. A still outline starts a scan.
  useEffect(() => {
    if (!modelsReady || !hasFrames) return;
    let busy = false;
    let stopped = false;
    let lastSeen = Date.now();
    let longGone = false;

    const tick = async () => {
      if (busy || capturingRef.current) return;
      const grab = grabRef.current;
      if (!grab) return;
      busy = true;
      try {
        const canvas = grab(LIVE_MAX_SIDE);
        if (!canvas) return;
        const frame = canvasToRgba(canvas, LIVE_MAX_SIDE);
        const detection = await detect(frame);
        if (stopped) return;
        const video = frameSizeRef.current ?? { width: canvas.width, height: canvas.height };
        const toVideo = video.width / frame.width;
        const quad =
          detection && detection.source !== "guide" ? scaleQuad(detection.quad, toVideo) : null;
        const now = Date.now();
        const update = trackerRef.current!.update(quad, video.width, video.height, now);
        lastQuadRef.current = quad;
        setLiveQuad(quad);
        setLiveRaw(
          detection && {
            quad: scaleQuad(detection.quad, toVideo),
            source: detection.source,
            score: detection.score,
          },
        );
        setOutlineStill(update.locked);

        if (quad) lastSeen = now;
        const gone = !quad && now - lastSeen >= timing.noCardMs;
        if (gone !== longGone) {
          longGone = gone;
          setNoCardLong(gone);
        }
        if (update.fire) void startCaptureRef.current("auto");
      } catch (error) {
        console.error("Live card detection failed", error);
      } finally {
        busy = false;
      }
    };

    const id = setInterval(() => void tick(), timing.tickMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [modelsReady, hasFrames, detect, timing.tickMs, timing.noCardMs]);

  const handleCameraError = useCallback((error: unknown) => {
    console.error(error);
    setCameraError(classifyCameraError(error));
  }, []);

  const retryCamera = () => {
    setCameraError(null);
    setFrameSize(null);
    frameSizeRef.current = null;
    setCameraKey((key) => key + 1);
  };

  /** The last copy added is this lock's own, so Undo takes back the right one. */
  const lockOwnsLastAdd = (current: Lock) => {
    const last = scan.added[scan.added.length - 1];
    return current.autoAdded && !current.undone && last?.cardId === current.option.id;
  };

  const undo = () => {
    const current = lockRef.current;
    if (!current || !lockOwnsLastAdd(current)) return;
    scan.undo();
    currentCardRef.current = null;
    updateLock({ ...current, undone: true });
    setListOpen(true);
  };

  /** Clear the lock (taking its copy back out) and look at the card in view again. */
  const rescan = () => {
    const current = lockRef.current;
    if (current && lockOwnsLastAdd(current)) scan.undo();
    updateLock(null);
    currentCardRef.current = null;
    attemptsRef.current = 0;
    bestRef.current = null;
    setAttempt(0);
    setView(null);
    setListOpen(false);
    setSelectedCardId(null);
    setNotice(null);
    setErrorMessage(null);
    scan.clearAdded();
    trackerRef.current?.arm();
    // No outline to wait for: scan what's in front of the camera now.
    if (!lastQuadRef.current) void startCapture("manual");
  };

  /** After a manual add, "Scan next card": clear the result and wait for the next card. */
  const scanNext = () => {
    updateLock(null);
    setView(null);
    setListOpen(false);
    setSelectedCardId(null);
    scan.clearAdded();
  };

  const toggleAutoAdd = (on: boolean) => {
    setAutoAdd(on);
    saveToggle(AUTO_ADD_KEY, on);
  };

  const toggleSound = (on: boolean) => {
    setSoundOn(on);
    saveToggle(SOUND_KEY, on);
    if (on) signalRef.current?.unlock();
  };

  const result = view?.result ?? null;
  const ocrName = view?.ocr?.name ?? null;
  const matchOptions: MatchOption[] = (result?.candidates ?? []).map(toOption);

  const loadingProgress = loadState.status === "loading" ? loadState.progress : null;

  if (!indexReady) {
    return status.isLoading ? <p className="text-sm text-gray-400">Checking the card scanner...</p> : null;
  }

  return (
    // Browsers only allow sound after a tap, so any tap here unlocks the chime.
    <div className="flex flex-col gap-4" onPointerDown={() => soundOn && signalRef.current?.unlock()}>
      {textOnly && (
        <p className="text-sm text-gray-400">
          No card pictures are indexed yet, so this matches by the name and the set and number at the bottom.
          Cards without a set code there, mostly from before 2015, won&apos;t match yet.
        </p>
      )}
      {(loadState.status === "idle" || loadingProgress !== null) && (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <span>
            Loading the card scanner (about 12 MB, once)... {Math.round((loadingProgress ?? 0) * 100)}%
          </span>
          {loadState.status === "loading" && loadState.waitingOn.length > 0 && (
            <span className="text-xs text-gray-400">Still loading: {loadState.waitingOn.join(", ")}</span>
          )}
          <progress className="w-full max-w-xl" max={1} value={loadingProgress ?? 0} />
        </div>
      )}

      {cameraError ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-red-500 p-4">
          <p className="text-red-400">{cameraError.message}</p>
          <Button type="button" onClick={retryCamera}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <CameraFeed
            key={cameraKey}
            showCaptureButton={false}
            onError={handleCameraError}
            onReady={handleReady}
            onFrameSource={handleFrameSource}
            overlay={
              frameSize && (
                <>
                  <QuadOverlay
                    frame={frameSize}
                    quad={liveQuad}
                    locked={outlineStill}
                    raw={debug ? liveRaw : undefined}
                  />
                  {flashId !== null && (
                    <div
                      key={flashId}
                      data-testid="lock-flash"
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-lg border-8 border-green-500 bg-green-500/20 motion-safe:animate-scan-lock"
                    />
                  )}
                  {lock && <LockBanner lock={lock} scan={scan} onUndo={undo} onRescan={rescan} />}
                </>
              )
            }
          />
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoAdd}
                onChange={(event) => toggleAutoAdd(event.target.checked)}
              />
              Auto add when sure
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(event) => toggleSound(event.target.checked)}
              />
              Sound
            </label>
          </div>
        </div>
      )}

      {reading && <p>Reading the card...</p>}
      {!reading && attempt > 0 && (
        <p className="text-sm text-gray-400">
          Not sure yet, taking another look ({attempt + 1} of {MAX_SCAN_ATTEMPTS}). Hold it still.
        </p>
      )}
      {errorMessage && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-red-400">Scanning failed: {errorMessage}</p>
          <Button type="button" onClick={rescan}>
            Rescan
          </Button>
        </div>
      )}
      {notice && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-yellow-300">{notice}</p>
          <Button type="button" onClick={rescan}>
            Rescan
          </Button>
        </div>
      )}

      {modelsReady && noCardLong && !reading && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
          <span>Can&apos;t see a card outline. Hold it flat with some background around it, or</span>
          <Button type="button" onClick={() => void startCapture("manual")}>
            Scan now
          </Button>
        </div>
      )}

      {listOpen && view && !lock && matchOptions.length === 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-yellow-300">
            Couldn&apos;t match that card. Try again with better light or the card a little closer.
          </p>
          <Button type="button" onClick={rescan}>
            Rescan
          </Button>
        </div>
      )}

      {listOpen && matchOptions.length > 0 && (
        <>
          {!lock && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-gray-400">Not sure about this one. Pick the right card, or rescan.</p>
              <Button type="button" onClick={rescan}>
                Rescan
              </Button>
            </div>
          )}
          <ScanMatches
            query={ocrName ?? ""}
            heading={ocrName ? undefined : "Best matches"}
            matches={matchOptions}
            selectedId={selectedCardId}
            onSelect={(id) => {
              setSelectedCardId(id);
              scan.clearAdded();
            }}
            auth={scan.auth}
            signInUrl={scan.signInUrl}
            collectionName={scan.collectionName}
            onAdd={() => {
              const match = matchOptions.find((option) => option.id === selectedCardId);
              if (!match) return;
              currentCardRef.current = match.id;
              // After an Undo, the banner follows the card picked instead.
              if (lockRef.current) {
                updateLock({ ...lockRef.current, option: match, autoAdded: false, undone: false });
              }
              scan.add(match);
            }}
            adding={scan.adding}
            addedName={lock?.autoAdded && !lock.undone ? null : scan.addedName}
            onScanNext={scanNext}
            error={scan.addError}
          />
        </>
      )}

      {debug && lastScan && (
        <details className="text-sm text-gray-400">
          <summary className="cursor-pointer">Debug: what the scanner saw</summary>
          <div className="mt-2 flex flex-col gap-2">
            {lastScan.flatCard && (
              // A data URL from our own canvas, so next/image adds nothing here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lastScan.flatCard} alt="Flattened card sent to the matcher" className="max-w-xs" />
            )}
            {lastScan.looseCard && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lastScan.looseCard} alt="Wider crop the text reader falls back to" className="max-w-xs" />
            )}
            {lastScan.frame && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lastScan.frame} alt="Camera frame the card came from" className="max-w-md" />
            )}
            {lastScan.detection && (
              <p>
                Corners:{" "}
                <code>
                  {lastScan.detection.quad.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ")}
                </code>
              </p>
            )}
            <p>
              Detector: <code>{lastScan.detection?.source ?? "no card"}</code>
              {loadState.status === "ready" && (
                <>
                  {" "}
                  (loaded: <code>{loadState.detectorKinds.join(", ") || "none"}</code>, OCR{" "}
                  {loadState.ocr ? "on" : "off"})
                </>
              )}
            </p>
            <p>
              Ranking: <code>{lastScan.result?.confident ? "confident" : "not sure"}</code>
            </p>
            {lastScan.server && (
              <ol className="list-decimal pl-5">
                {lastScan.server.matches.slice(0, 5).map((match) => (
                  <li key={`${match.card.id}:${match.face}`}>
                    {match.card.name} ({printingDetail(match.card) ?? "?"}):{" "}
                    <code>{match.similarity.toFixed(3)}</code>
                  </li>
                ))}
              </ol>
            )}
            {lastScan.result?.candidates[0] && (
              <p>
                Top pick: <code>{lastScan.result.candidates[0].score.toFixed(3)}</code> (
                {lastScan.result.candidates[0].reasons.join(", ")})
              </p>
            )}
            {lastScan.result && lastScan.result.candidates.length > 0 && (
              <SignalBreakdown candidates={lastScan.result.candidates.slice(0, DEBUG_SIGNAL_CANDIDATES)} />
            )}
            <p>
              Raw title OCR: <code>{JSON.stringify(lastScan.ocr?.rawTitle ?? "")}</code>
            </p>
            <p>
              Raw collector OCR: <code>{JSON.stringify(lastScan.ocr?.rawCollector ?? "")}</code>
            </p>
            <p>
              Collector read: <code>{JSON.stringify(lastScan.ocr?.collector ?? null)}</code>
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
