/**
 * OCR for a flattened card: the name off the title bar and the collector
 * info off the bottom left. Browser only (tesseract.js runs in a Web Worker).
 *
 * One Tesseract worker is shared for both reads and for every scan, the same
 * as the title-only flow on /scan; reads are queued so parameter changes for
 * one read can't leak into another running at the same time.
 *
 * The crop math and the text clean-up are pure and unit tested; the canvas
 * and worker calls are a thin layer on top.
 */

import type { Worker as TesseractWorker } from "tesseract.js";
import { extractCardName } from "~/utils/scan/cleanOcrText";
import { rgbaToCanvas } from "./browser/frame";
import { CARD_REGIONS, LOOSE_REGIONS, regionRect, type CardRegion } from "./cardRegions";
import { isEmptyCollectorInfo, parseCollectorInfo, type CollectorInfo } from "./collectorLine";
import type { RgbaImage } from "./preprocess";

export type CropPlan = {
  /** Source rectangle in the card image. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Size of the upscaled crop handed to Tesseract. */
  width: number;
  height: number;
  scale: number;
};

export type CropOptions = { minScale?: number; maxScale?: number; targetWidth?: number };

/**
 * Where to crop a region from a card image and how big to draw it. Small
 * text reads much better upscaled, so the crop is scaled to about
 * targetWidth pixels wide, but never less than minScale or more than
 * maxScale times.
 */
export function planCrop(
  region: CardRegion,
  cardWidth: number,
  cardHeight: number,
  { minScale = 2, maxScale = 3, targetWidth = 1200 }: CropOptions = {},
): CropPlan {
  const rect = regionRect(region, cardWidth, cardHeight);
  const wanted = rect.width > 0 ? targetWidth / rect.width : maxScale;
  const scale = Math.min(maxScale, Math.max(minScale, wanted));
  return {
    sx: rect.x,
    sy: rect.y,
    sw: rect.width,
    sh: rect.height,
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale)),
    scale,
  };
}

/**
 * Characters the collector block can contain: digits, upper case set and
 * language codes and rarity letters, the slash, the bullet (and what it's
 * often read as), and the lower case and symbol suffixes on promo numbers.
 * The artist's name shares the line but doesn't matter.
 */
export const COLLECTOR_WHITELIST =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/•*-.abcdeps★†";

export type CardOcrResult = {
  name: string | null;
  collector: CollectorInfo | null;
  rawTitle: string;
  rawCollector: string;
};

/** Turn raw Tesseract text into a name and collector info. */
export function interpretOcr(rawTitle: string, rawCollector: string): CardOcrResult {
  const name = extractCardName(rawTitle) || null;
  const info = parseCollectorInfo(rawCollector);
  return {
    name,
    collector: isEmptyCollectorInfo(info) ? null : info,
    rawTitle,
    rawCollector,
  };
}

export type CardOcr = {
  /**
   * Read the name and collector info off a flattened card. `loose` is the
   * same card warped with some margin (CardCapture.loose, turned the same
   * way); when the tight read misses the name or the collector info, the
   * wider bands of `loose` are read for whatever's missing.
   */
  read(card: RgbaImage, loose?: RgbaImage): Promise<CardOcrResult>;
  terminate(): Promise<void>;
};

function cropForOcr(source: HTMLCanvasElement, plan: CropPlan): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is not available");
  // Not every browser supports canvas filters; it's fine if this is ignored.
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.width, plan.height);
  return canvas;
}

/**
 * Start the shared Tesseract worker. onProgress gets 0..1 while the
 * language data downloads (only slow the first time; it's cached after).
 */
export async function createCardOcr(onProgress?: (progress: number) => void): Promise<CardOcr> {
  // Loaded on demand so tesseract.js stays out of the initial page bundle.
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const worker: TesseractWorker = await createWorker("eng", OEM.LSTM_ONLY, {
    logger: (message) => {
      if (message.status === "loading language traineddata") onProgress?.(message.progress);
    },
  });
  onProgress?.(1);

  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const recognize = async (
    canvas: HTMLCanvasElement,
    mode: (typeof PSM)[keyof typeof PSM],
    whitelist: string,
  ) => {
    await worker.setParameters({ tessedit_pageseg_mode: mode, tessedit_char_whitelist: whitelist });
    const { data } = await worker.recognize(canvas);
    return data.text;
  };

  return {
    read: (card, loose) =>
      enqueue(async () => {
        const source = rgbaToCanvas(card);
        const plan = (region: CardRegion) => planCrop(region, card.width, card.height);

        let rawTitle = await recognize(cropForOcr(source, plan(CARD_REGIONS.title)), PSM.SINGLE_LINE, "");
        // Nothing name-like on a modern title bar: maybe it's an old frame.
        if (!extractCardName(rawTitle)) {
          const oldFrame = await recognize(
            cropForOcr(source, plan(CARD_REGIONS.titleOldFrame)),
            PSM.SINGLE_LINE,
            "",
          );
          if (extractCardName(oldFrame)) rawTitle = oldFrame;
        }
        let rawCollector = await recognize(
          cropForOcr(source, plan(CARD_REGIONS.collector)),
          PSM.SINGLE_BLOCK,
          COLLECTOR_WHITELIST,
        );

        // A corner a little inside the real one cuts text off the tight crop.
        // Read the wider bands of the loose crop for whatever's still missing.
        if (loose) {
          const tight = interpretOcr(rawTitle, rawCollector);
          if (!tight.name || !tight.collector) {
            const looseSource = rgbaToCanvas(loose);
            const loosePlan = (region: CardRegion) => planCrop(region, loose.width, loose.height);
            if (!tight.name) {
              // Sparse text: the band holds the name and a strip of art.
              const looseTitle = await recognize(
                cropForOcr(looseSource, loosePlan(LOOSE_REGIONS.title)),
                PSM.SPARSE_TEXT,
                "",
              );
              if (extractCardName(looseTitle)) rawTitle = looseTitle;
            }
            if (!tight.collector) {
              const looseCollector = await recognize(
                cropForOcr(looseSource, loosePlan(LOOSE_REGIONS.collector)),
                PSM.SINGLE_BLOCK,
                COLLECTOR_WHITELIST,
              );
              if (!isEmptyCollectorInfo(parseCollectorInfo(looseCollector))) rawCollector = looseCollector;
            }
          }
        }
        return interpretOcr(rawTitle, rawCollector);
      }),
    terminate: async () => {
      await worker.terminate();
    },
  };
}
