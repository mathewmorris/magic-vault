"use client";

/**
 * SPIKE: scan a card with the camera and find it.
 *
 * This is a proof of concept, not a finished feature. The flow is:
 *   1. Line the card up with the on-screen guide and press Capture.
 *   2. Crop the frame to the card's title strip (where the guide says it is).
 *   3. OCR that strip with tesseract.js (runs in the browser, in a worker).
 *   4. Clean the text into a likely name and search for it with card.search.
 *      card.search is a "name contains" query, so if the full name misses we
 *      also search on its longest words.
 *   5. Rank everything we found with a fuzzy (Levenshtein) match and show the
 *      top few.
 *
 * There's no card detection: if the card isn't inside the guide, the crop
 * misses the title. The pure parts live in ~/utils/scan and are unit tested.
 */

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Worker as TesseractWorker } from "tesseract.js";
import Button from "~/components/Button";
import CameraFeed from "~/components/CameraFeed";
import { api, type RouterOutputs } from "~/utils/api";
import { smallImageUrl } from "~/utils/cardImage";
import { classifyCameraError, type CameraErrorInfo } from "~/utils/scan/cameraError";
import { cardGuideRect, titleStripRect, type Rect } from "~/utils/scan/cardGuide";
import { extractCardName } from "~/utils/scan/cleanOcrText";
import { rankCandidates, type RankedMatch } from "~/utils/scan/fuzzyMatch";
import { buildSearchTerms } from "~/utils/scan/searchTerms";

type Card = RouterOutputs["card"]["search"]["items"][number];

type Phase = "ready" | "reading" | "searching" | "done" | "error";

// If the full-name search already finds something this close, skip the
// extra word searches.
const GOOD_ENOUGH_SCORE = 0.9;
const SEARCH_LIMIT = 100;

/**
 * Copy the title strip out of the captured frame, scaled up and in grayscale,
 * which tends to help Tesseract with small text.
 */
function cropTitleStrip(frame: HTMLCanvasElement): HTMLCanvasElement {
  const strip = titleStripRect(cardGuideRect(frame.width, frame.height));
  const scale = Math.min(3, Math.max(1, 1200 / strip.width));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(strip.width * scale);
  canvas.height = Math.round(strip.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is not available");

  // Not every browser supports canvas filters; it's fine if this is ignored.
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.drawImage(
    frame,
    Math.round(strip.x),
    Math.round(strip.y),
    Math.round(strip.width),
    Math.round(strip.height),
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/** Start a Tesseract worker set up to read a single line of English. */
async function createOcrWorker(onProgress: (progress: number) => void): Promise<TesseractWorker> {
  // Loaded on demand so tesseract.js stays out of the initial page bundle.
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    logger: (message) => {
      if (message.status === "recognizing text") onProgress(message.progress);
    },
  });
  // The crop holds one line of text: the name and the mana cost.
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  return worker;
}

function percentStyle(rect: Rect, frame: { width: number; height: number }) {
  return {
    left: `${(rect.x / frame.width) * 100}%`,
    top: `${(rect.y / frame.height) * 100}%`,
    width: `${(rect.width / frame.width) * 100}%`,
    height: `${(rect.height / frame.height) * 100}%`,
  };
}

/** The card outline and title strip drawn over the live video. */
function CardGuide({ frame }: { frame: { width: number; height: number } }) {
  const card = cardGuideRect(frame.width, frame.height);
  const strip = titleStripRect(card);

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute rounded-xl border-2 border-white/70"
        style={percentStyle(card, frame)}
      />
      <div
        className="absolute rounded border-2 border-pink-500 bg-pink-500/10"
        style={percentStyle(strip, frame)}
      />
    </div>
  );
}

export default function ScanPage() {
  const utils = api.useUtils();

  const [cameraKey, setCameraKey] = useState(0);
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);

  const [phase, setPhase] = useState<Phase>("ready");
  const [progress, setProgress] = useState(0);
  const [cropPreview, setCropPreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [cardName, setCardName] = useState("");
  const [matches, setMatches] = useState<RankedMatch<Card>[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  // One Tesseract worker for the life of the page. Creating it downloads the
  // English language data the first time, so we do it lazily on first capture.
  const workerRef = useRef<{ promise: Promise<TesseractWorker> | null }>({ promise: null });

  const getWorker = useCallback(() => {
    const holder = workerRef.current;
    let promise = holder.promise;
    if (!promise) {
      promise = createOcrWorker(setProgress);
      holder.promise = promise;
      // If setup fails (say the language data didn't download), let the next
      // capture try again instead of reusing the failed promise.
      void promise.catch(() => {
        if (holder.promise === promise) holder.promise = null;
      });
    }
    return promise;
  }, []);

  useEffect(() => {
    const holder = workerRef.current;
    return () => {
      void holder.promise
        ?.then((worker) => worker.terminate())
        .catch(() => undefined);
    };
  }, []);

  const findMatches = useCallback(
    async (name: string) => {
      const [fullName, ...words] = buildSearchTerms(name);
      if (!fullName) return [];

      const found = new Map<string, Card>();
      const search = async (term: string) => {
        const { items } = await utils.card.search.fetch({ name: term, limit: SEARCH_LIMIT });
        items.forEach((card) => found.set(card.id, card));
      };
      const rank = () => rankCandidates(name, [...found.values()], (card) => card.name);

      await search(fullName);
      const firstPass = rank();
      if ((firstPass[0]?.score ?? 0) >= GOOD_ENOUGH_SCORE || words.length === 0) {
        return firstPass;
      }

      await Promise.all(words.map(search));
      return rank();
    },
    [utils],
  );

  const handleCapture = useCallback(
    async (frame: HTMLCanvasElement) => {
      setPhase("reading");
      setProgress(0);
      setMatches([]);
      setRawText("");
      setCardName("");
      setErrorMessage("");

      try {
        const strip = cropTitleStrip(frame);
        setCropPreview(strip.toDataURL("image/png"));

        const worker = await getWorker();
        const { data } = await worker.recognize(strip);
        const name = extractCardName(data.text);
        setRawText(data.text);
        setCardName(name);

        if (!name) {
          setPhase("done");
          return;
        }

        setPhase("searching");
        setMatches(await findMatches(name));
        setPhase("done");
      } catch (error) {
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
        setPhase("error");
      }
    },
    [getWorker, findMatches],
  );

  const handleCameraError = useCallback((error: unknown) => {
    console.error(error);
    setCameraError(classifyCameraError(error));
  }, []);

  const retryCamera = () => {
    setCameraError(null);
    setFrameSize(null);
    setCameraKey((key) => key + 1);
  };

  const busy = phase === "reading" || phase === "searching";

  return (
    <div className="flex flex-col gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Scan a card</h1>
        <p className="text-sm text-gray-400">
          Experimental. Fit the card inside the outline with its name in the pink box, then capture.
        </p>
      </div>

      {cameraError ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-red-500 p-4">
          <p className="text-red-400">{cameraError.message}</p>
          <Button type="button" onClick={retryCamera}>
            Try again
          </Button>
        </div>
      ) : (
        <CameraFeed
          key={cameraKey}
          onCapture={(frame) => void handleCapture(frame)}
          onError={handleCameraError}
          onReady={setFrameSize}
          overlay={frameSize && <CardGuide frame={frameSize} />}
          disabled={busy}
          captureLabel={busy ? "Working..." : "Capture"}
        />
      )}

      {phase === "reading" && <p>Reading the card name... {Math.round(progress * 100)}%</p>}
      {phase === "searching" && <p>Looking up &quot;{cardName}&quot;...</p>}
      {phase === "error" && <p className="text-red-400">Scanning failed: {errorMessage}</p>}

      {phase === "done" && !cardName && (
        <p className="text-yellow-300">
          Couldn&apos;t read a name. Make sure the name is inside the pink box, the card is well lit
          and in focus, and try again.
        </p>
      )}

      {phase === "done" && cardName && matches.length === 0 && (
        <p className="text-yellow-300">
          Read &quot;{cardName}&quot; but couldn&apos;t find a matching card. Try again with the card
          closer or steadier.
        </p>
      )}

      {matches.length > 0 && (
        <section>
          <h2 className="mb-2 text-xl font-semibold">Best matches for &quot;{cardName}&quot;</h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {matches.map(({ candidate, name, score }) => {
              const image = smallImageUrl(candidate);
              return (
                <li key={candidate.id} className="flex flex-col items-center gap-1 text-center">
                  {image ? (
                    <Image src={image} width={146} height={204} alt={name} className="rounded-lg" />
                  ) : (
                    <div className="flex h-[204px] w-[146px] items-center justify-center rounded-lg bg-gray-800 text-sm">
                      No image
                    </div>
                  )}
                  <span className="font-semibold">{name}</span>
                  <span className="text-xs text-gray-400">{Math.round(score * 100)}% match</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(cropPreview ?? rawText) && (
        <details className="text-sm text-gray-400">
          <summary className="cursor-pointer">Debug: what the scanner saw</summary>
          <div className="mt-2 flex flex-col gap-2">
            {cropPreview && (
              // A data URL from our own canvas, so next/image adds nothing here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cropPreview} alt="Cropped title strip sent to OCR" className="max-w-full" />
            )}
            <p>
              Raw OCR: <code>{JSON.stringify(rawText)}</code>
            </p>
            <p>
              Cleaned name: <code>{JSON.stringify(cardName)}</code>
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
