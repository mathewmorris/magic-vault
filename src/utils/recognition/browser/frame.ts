/** Canvas <-> RgbaImage. Browser only. */

import type { RgbaImage } from "../preprocess";

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  throw new Error("No canvas available");
}

function context2d(canvas: AnyCanvas): Context2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as Context2D | null;
  if (!ctx) throw new Error("Canvas 2D context is not available");
  return ctx;
}

/** Long side / maxSide, never upscaling. Exported for tests. */
export function fitSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Read a canvas's pixels, downscaled so the long side is at most maxSide
 * (default 1280). Detection and warping don't need more than that, and
 * smaller frames keep the per-frame JS work fast.
 */
export function canvasToRgba(canvas: AnyCanvas, maxSide = 1280): RgbaImage {
  if (canvas.width === 0 || canvas.height === 0) throw new Error("Canvas is empty");
  const { width, height } = fitSize(canvas.width, canvas.height, maxSide);
  let source: AnyCanvas = canvas;
  if (width !== canvas.width || height !== canvas.height) {
    source = makeCanvas(width, height);
    const ctx = context2d(source);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, width, height);
  }
  const image = context2d(source).getImageData(0, 0, width, height);
  return { data: image.data, width, height };
}

export function rgbaToCanvas(image: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is not available");
  const pixels = new Uint8ClampedArray(image.width * image.height * 4);
  pixels.set(image.data.subarray(0, pixels.length));
  ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  return canvas;
}

export function rgbaToDataUrl(image: RgbaImage, type = "image/jpeg", quality = 0.9): string {
  return rgbaToCanvas(image).toDataURL(type, quality);
}
