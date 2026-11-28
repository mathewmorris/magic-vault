"use client";

/**
 * The AI scanner's engine: loads the card detector, the image embedder and
 * the OCR worker on first use, and turns a burst of camera frames into a
 * ranked list of printings.
 *
 * Loading downloads the models (about 12 MB, cached by the browser after the
 * first time), so it only starts when `load()` is called. The detector and
 * embedder are required; OCR is a bonus, so if Tesseract fails to start the
 * scanner carries on with the image match alone.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "~/utils/api";
import type { ScanMatchResult } from "~/server/api/routers/scan";
import type { RecognitionResult } from "../fuse";
import { EMBED_MODEL, POSE_MODEL } from "../model";
import { createCardOcr, type CardOcr, type CardOcrResult } from "../ocr";
import { recognizeOriented, type Orientation } from "../orientation";
import type { RgbaImage } from "../preprocess";
import { createCardDetector, type CardDetector, type Detection } from "./detector";
import { createEmbedder, embedBurst, type Embedder } from "./embedder";
import { captureCard, type CardCapture } from "./pipeline";

export type LoadState =
  | { status: "idle" }
  | {
      status: "loading";
      progress: number;
      /** What hasn't finished yet, in plain words, so a stall shows where it is. */
      waitingOn: string[];
    }
  | { status: "ready"; ocr: boolean; detectorKinds: ("pose" | "opencv")[] }
  | { status: "failed"; error: string };

export type RecognitionOutcome = {
  capture: CardCapture | null;
  ocr: CardOcrResult | null;
  server: ScanMatchResult | null;
  result: RecognitionResult | null;
  /**
   * Clockwise quarter turns applied to the flattened crop (capture.best) to
   * get the result, null with no capture. See ../orientation.ts.
   */
  orientation: Orientation | null;
  /** Every orientation embedded for this scan, upright first. */
  orientationsTried: Orientation[];
  /** capture.best turned to `orientation`: what OCR read. */
  orientedCard: RgbaImage | null;
};

type Engine = { detector: CardDetector; embedder: Embedder; ocr: CardOcr | null };

/** How many image matches to ask the server for. */
export const MATCH_LIMIT = 20;

export function useCardRecognizer() {
  const utils = api.useUtils();
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const engineRef = useRef<Engine | null>(null);
  const loadingRef = useRef<Promise<boolean> | null>(null);
  // Bumped on unmount (and on React's dev-mode remount), so a load that
  // finishes after it can tell its result is no longer wanted.
  const generationRef = useRef(0);

  const load = useCallback((): Promise<boolean> => {
    if (engineRef.current) return Promise.resolve(true);
    if (loadingRef.current) return loadingRef.current;
    const generation = generationRef.current;
    const stale = () => generationRef.current !== generation;

    // Three parts; OCR reports its own download progress.
    const parts = { detector: 0, embedder: 0, ocr: 0 };
    const report = () => {
      if (stale()) return;
      const waitingOn = [
        parts.detector < 1 ? "card finder" : null,
        parts.embedder < 1 ? "card matcher" : null,
        parts.ocr < 1 ? "text reader" : null,
      ].filter((part): part is string => part !== null);
      setState({ status: "loading", progress: (parts.detector + parts.embedder + parts.ocr) / 3, waitingOn });
    };
    report();

    const promise = (async () => {
      const detectorPromise = createCardDetector({ pose: POSE_MODEL, useOpenCv: true }).then((d) => {
        parts.detector = 1;
        report();
        return d;
      });
      const embedderPromise = createEmbedder(EMBED_MODEL).then((e) => {
        parts.embedder = 1;
        report();
        return e;
      });
      const ocrPromise = createCardOcr((progress) => {
        parts.ocr = progress;
        report();
      }).catch((error: unknown) => {
        console.error("OCR failed to start; scanning by image only", error);
        parts.ocr = 1;
        report();
        return null;
      });

      const [detector, embedder, ocr] = await Promise.allSettled([
        detectorPromise,
        embedderPromise,
        ocrPromise,
      ]);
      if (detector.status === "rejected" || embedder.status === "rejected") {
        if (detector.status === "fulfilled") detector.value.dispose();
        if (embedder.status === "fulfilled") embedder.value.dispose();
        if (ocr.status === "fulfilled") void ocr.value?.terminate();
        const reason: unknown =
          detector.status === "rejected"
            ? detector.reason
            : (embedder as PromiseRejectedResult).reason;
        throw reason instanceof Error ? reason : new Error("The card scanner didn't load.");
      }
      const engine: Engine = {
        detector: detector.value,
        embedder: embedder.value,
        ocr: ocr.status === "fulfilled" ? ocr.value : null,
      };
      if (stale()) {
        engine.detector.dispose();
        engine.embedder.dispose();
        void engine.ocr?.terminate();
        return false;
      }
      engineRef.current = engine;
      setState({ status: "ready", ocr: engine.ocr !== null, detectorKinds: [...engine.detector.kinds] });
      return true;
    })().catch((error: unknown) => {
      console.error("Card scanner failed to load", error);
      if (stale()) return false;
      loadingRef.current = null;
      setState({
        status: "failed",
        error: error instanceof Error ? error.message : "The card scanner didn't load.",
      });
      return false;
    });

    loadingRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    const generation = generationRef;
    return () => {
      generation.current++;
      const engine = engineRef.current;
      engineRef.current = null;
      loadingRef.current = null;
      engine?.detector.dispose();
      engine?.embedder.dispose();
      void engine?.ocr?.terminate().catch(() => undefined);
    };
  }, []);

  /** Find the card in one live frame, or null (also null until loaded). */
  const detect = useCallback(async (frame: RgbaImage): Promise<Detection | null> => {
    const engine = engineRef.current;
    if (!engine) return null;
    return engine.detector.detect(frame);
  }, []);

  /**
   * Burst of frames -> flat card -> embedding + OCR -> server match ->
   * ranking, turning the card round first when upright doesn't match well
   * (see ../orientation.ts).
   */
  const recognize = useCallback(
    async (frames: RgbaImage[], options: { allowGuideFallback: boolean }): Promise<RecognitionOutcome> => {
      const engine = engineRef.current;
      if (!engine) throw new Error("The card scanner isn't loaded yet");

      const capture = await captureCard(frames, engine.detector, {
        allowGuideFallback: options.allowGuideFallback,
      });
      if (!capture) {
        return {
          capture: null,
          ocr: null,
          server: null,
          result: null,
          orientation: null,
          orientationsTried: [],
          orientedCard: null,
        };
      }

      const ocr = engine.ocr;
      const oriented = await recognizeOriented(
        { cards: capture.cards, best: capture.best, quad: capture.detection.quad },
        {
          embedBurst: (cards) => embedBurst(engine.embedder, cards),
          embed: (card) => engine.embedder.embed(card),
          ocr: (card) =>
            ocr
              ? ocr.read(card).catch((error: unknown) => {
                  console.error("OCR failed for this card", error);
                  return null;
                })
              : Promise.resolve(null),
          match: ({ embedding, alternates, printing }) =>
            utils.scan.match.fetch({
              embedding,
              ...(alternates ? { alternates } : {}),
              modelId: EMBED_MODEL.id,
              limit: MATCH_LIMIT,
              printing,
            }),
        },
      );
      return {
        capture,
        ocr: oriented.ocr,
        server: oriented.server,
        result: oriented.result,
        orientation: oriented.orientation,
        orientationsTried: oriented.orientationsTried,
        orientedCard: oriented.card,
      };
    },
    [utils],
  );

  return { state, load, detect, recognize };
}

export type CardRecognizer = ReturnType<typeof useCardRecognizer>;
