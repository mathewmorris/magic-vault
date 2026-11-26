"use client";

/**
 * AI card scanning for /scan (behind the aiScan feature flag).
 *
 *   1. While the camera runs, a card detector looks at about 4 frames a
 *      second and the card's outline is drawn over the video.
 *   2. Once the outline holds still (or the user presses Capture), a short
 *      burst of frames is taken, the card is cut out and flattened, and an
 *      image model turns it into an embedding; OCR reads the name and the
 *      collector info off the sharpest frame at the same time.
 *   3. The server finds the closest printings by embedding (and the exact
 *      printing by set + number when OCR read them), and ~/utils/recognition
 *      /fuse ranks everything together.
 *   4. The user picks/adds the card just like the title-OCR flow.
 *
 * If the models can't load or the server has no image index yet, this calls
 * onUnavailable and the page falls back to the title-OCR scanner.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "~/components/Button";
import CameraFeed from "~/components/CameraFeed";
import ScanMatches, { type MatchOption } from "~/components/scan/ScanMatches";
import { api } from "~/utils/api";
import { faceImageUrl, printingDetail } from "~/utils/recognition/display";
import type { Quad } from "~/utils/recognition/geometry";
import { AutoCaptureTracker, scaleQuad } from "~/utils/recognition/liveTracking";
import { EMBED_MODEL } from "~/utils/recognition/model";
import { canvasToRgba, rgbaToDataUrl } from "~/utils/recognition/browser/frame";
import {
  useCardRecognizer,
  type RecognitionOutcome,
} from "~/utils/recognition/browser/useCardRecognizer";
import type { RgbaImage } from "~/utils/recognition/preprocess";
import { classifyCameraError, type CameraErrorInfo } from "~/utils/scan/cameraError";
import { cardGuideRect } from "~/utils/scan/cardGuide";
import type { ScanCollection } from "~/utils/scan/useScanCollection";

export type ScannerTiming = {
  /** Time between live detection ticks. */
  tickMs: number;
  /** How long the outline must hold still before auto capture. */
  stableMs: number;
  /** Frames per capture burst, and the gap between them. */
  burstSize: number;
  burstGapMs: number;
};

export const DEFAULT_TIMING: ScannerTiming = {
  tickMs: 250,
  stableMs: 800,
  burstSize: 3,
  burstGapMs: 120,
};

/** Longest side of frames for live detection (small is fast) and for captures. */
const LIVE_MAX_SIDE = 640;
const CAPTURE_MAX_SIDE = 1280;

type Phase = "ready" | "reading" | "done" | "error";

type Props = {
  scan: ScanCollection;
  /** Called with a short notice when AI scanning can't run here. */
  onUnavailable: (notice: string) => void;
  timing?: Partial<ScannerTiming>;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function QuadOverlay({
  frame,
  quad,
  locked,
}: {
  frame: { width: number; height: number };
  quad: Quad | null;
  locked: boolean;
}) {
  const guide = cardGuideRect(frame.width, frame.height);
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
    </svg>
  );
}

export default function AiScanner({ scan, onUnavailable, timing: timingOverrides }: Props) {
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
  const grabRef = useRef<(() => HTMLCanvasElement | null) | null>(null);
  const [hasFrames, setHasFrames] = useState(false);

  const [liveQuad, setLiveQuad] = useState<Quad | null>(null);
  const [locked, setLocked] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  const trackerRef = useRef<AutoCaptureTracker | null>(null);
  if (!trackerRef.current) trackerRef.current = new AutoCaptureTracker({ stableMs: timing.stableMs });

  const [phase, setPhase] = useState<Phase>("ready");
  const [errorMessage, setErrorMessage] = useState("");
  const [outcome, setOutcome] = useState<RecognitionOutcome | null>(null);
  const [cardPreview, setCardPreview] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const capturingRef = useRef(false);

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

  const indexReady =
    status.data !== undefined &&
    status.data.enabled &&
    status.data.indexed > 0 &&
    status.data.modelId === EMBED_MODEL.id;

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

  const handleFrameSource = useCallback((grab: (() => HTMLCanvasElement | null) | null) => {
    grabRef.current = grab;
    setHasFrames(grab !== null);
  }, []);

  const showOutcome = useCallback(
    (next: RecognitionOutcome, mode: "auto" | "manual") => {
      const nextTop = next.result?.candidates[0]?.card.id ?? null;
      const currentTop = outcome?.result?.candidates[0]?.card.id ?? null;
      // The same card auto-captured again (say it was nudged): keep what's on
      // screen, including "Added", so nothing invites adding it twice.
      if (mode === "auto" && nextTop !== null && nextTop === currentTop) {
        setPhase("done");
        return;
      }
      setOutcome(next);
      setSelectedCardId(nextTop);
      setCardPreview(next.capture ? rgbaToDataUrl(next.capture.best) : null);
      scan.clearAdded();
      setPhase("done");
    },
    [outcome, scan],
  );

  const startCapture = useCallback(
    async (mode: "auto" | "manual") => {
      if (capturingRef.current || !modelsReady) return;
      const grab = grabRef.current;
      if (!grab) return;
      capturingRef.current = true;
      trackerRef.current?.disarm();
      setPhase("reading");
      setErrorMessage("");

      try {
        const frames: RgbaImage[] = [];
        for (let i = 0; i < timing.burstSize; i++) {
          if (i > 0) await sleep(timing.burstGapMs);
          const canvas = grab();
          if (canvas) frames.push(canvasToRgba(canvas, CAPTURE_MAX_SIDE));
        }
        const next = await recognize(frames, { allowGuideFallback: mode === "manual" });
        showOutcome(next, mode);
      } catch (error) {
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
        setPhase("error");
      } finally {
        capturingRef.current = false;
      }
    },
    [modelsReady, recognize, showOutcome, timing.burstGapMs, timing.burstSize],
  );

  // The loop below runs on an interval; read the latest callback and toggle
  // through refs so it doesn't restart on every render.
  const startCaptureRef = useRef(startCapture);
  const autoCaptureRef = useRef(autoCapture);
  useEffect(() => {
    startCaptureRef.current = startCapture;
    autoCaptureRef.current = autoCapture;
  }, [startCapture, autoCapture]);

  // Live detection: about 4 times a second, skipping a tick if the last one
  // (or a capture) is still running.
  useEffect(() => {
    if (!modelsReady || !hasFrames) return;
    let busy = false;
    let stopped = false;

    const tick = async () => {
      if (busy || capturingRef.current) return;
      const grab = grabRef.current;
      if (!grab) return;
      busy = true;
      try {
        const canvas = grab();
        if (!canvas) return;
        const frame = canvasToRgba(canvas, LIVE_MAX_SIDE);
        const detection = await detect(frame);
        if (stopped) return;
        const quad =
          detection && detection.source !== "guide"
            ? scaleQuad(detection.quad, canvas.width / frame.width)
            : null;
        const update = trackerRef.current!.update(quad, canvas.width, canvas.height, Date.now());
        setLiveQuad(quad);
        setLocked(update.locked);
        if (update.fire && autoCaptureRef.current) void startCaptureRef.current("auto");
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
  }, [modelsReady, hasFrames, detect, timing.tickMs]);

  const handleCameraError = useCallback((error: unknown) => {
    console.error(error);
    setCameraError(classifyCameraError(error));
  }, []);

  const retryCamera = () => {
    setCameraError(null);
    setFrameSize(null);
    setCameraKey((key) => key + 1);
  };

  const scanNext = () => {
    setPhase("ready");
    setOutcome(null);
    setSelectedCardId(null);
    setCardPreview(null);
    scan.clearAdded();
    trackerRef.current?.arm();
  };

  const result = outcome?.result ?? null;
  const ocrName = outcome?.ocr?.name ?? null;
  const matchOptions: MatchOption[] = (result?.candidates ?? []).map((candidate) => ({
    id: candidate.card.id,
    name: candidate.card.name,
    score: Math.min(1, candidate.score),
    imageUrl: faceImageUrl(candidate.card, candidate.face),
    detail: printingDetail(candidate.card) ?? undefined,
  }));

  const busy = phase === "reading";
  const loadingProgress = loadState.status === "loading" ? loadState.progress : null;

  if (!indexReady) {
    return status.isLoading ? <p className="text-sm text-gray-400">Checking the card scanner...</p> : null;
  }

  return (
    <>
      {(loadState.status === "idle" || loadingProgress !== null) && (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <span>
            Loading the card scanner (about 12 MB, once)... {Math.round((loadingProgress ?? 0) * 100)}%
          </span>
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
            onCapture={() => void startCapture("manual")}
            onError={handleCameraError}
            onReady={setFrameSize}
            onFrameSource={handleFrameSource}
            overlay={frameSize && <QuadOverlay frame={frameSize} quad={liveQuad} locked={locked} />}
            disabled={busy || !modelsReady}
            captureLabel={busy ? "Working..." : "Capture"}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoCapture}
              onChange={(event) => setAutoCapture(event.target.checked)}
            />
            Auto capture
          </label>
        </div>
      )}

      {phase === "reading" && <p>Reading the card...</p>}
      {phase === "error" && <p className="text-red-400">Scanning failed: {errorMessage}</p>}

      {phase === "done" && outcome && !outcome.capture && (
        <p className="text-yellow-300">
          Couldn&apos;t find a card in the picture. Hold it flat inside the frame with some background
          around it, and try again.
        </p>
      )}

      {phase === "done" && outcome?.capture && matchOptions.length === 0 && (
        <p className="text-yellow-300">
          Couldn&apos;t match that card. Try again with better light or the card a little closer.
        </p>
      )}

      {matchOptions.length > 0 && (
        <>
          <p className="text-sm text-gray-400">
            {result?.confident ? "Pretty sure about this one." : "Not sure about this one, check the matches."}
          </p>
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
              if (match) scan.add(match);
            }}
            adding={scan.adding}
            addedName={scan.addedName}
            onScanNext={scanNext}
            error={scan.addError}
          />
        </>
      )}

      {outcome && (
        <details className="text-sm text-gray-400">
          <summary className="cursor-pointer">Debug: what the scanner saw</summary>
          <div className="mt-2 flex flex-col gap-2">
            {cardPreview && (
              // A data URL from our own canvas, so next/image adds nothing here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cardPreview} alt="Flattened card sent to the matcher" className="max-w-xs" />
            )}
            <p>
              Detector: <code>{outcome.capture?.detection.source ?? "no card"}</code>
              {loadState.status === "ready" && (
                <>
                  {" "}
                  (loaded: <code>{loadState.detectorKinds.join(", ") || "none"}</code>, OCR{" "}
                  {loadState.ocr ? "on" : "off"})
                </>
              )}
            </p>
            {outcome.server && (
              <ol className="list-decimal pl-5">
                {outcome.server.matches.slice(0, 5).map((match) => (
                  <li key={`${match.card.id}:${match.face}`}>
                    {match.card.name} ({printingDetail(match.card) ?? "?"}):{" "}
                    <code>{match.similarity.toFixed(3)}</code>
                  </li>
                ))}
              </ol>
            )}
            {result?.candidates[0] && (
              <p>
                Top pick: <code>{result.candidates[0].score.toFixed(3)}</code> (
                {result.candidates[0].reasons.join(", ")})
              </p>
            )}
            <p>
              Raw title OCR: <code>{JSON.stringify(outcome.ocr?.rawTitle ?? "")}</code>
            </p>
            <p>
              Raw collector OCR: <code>{JSON.stringify(outcome.ocr?.rawCollector ?? "")}</code>
            </p>
            <p>
              Collector read: <code>{JSON.stringify(outcome.ocr?.collector ?? null)}</code>
            </p>
          </div>
        </details>
      )}
    </>
  );
}
