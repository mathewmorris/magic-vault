/**
 * OpenCV.js, wrapped so it can be loaded with a dynamic import.
 *
 * The OpenCV module object has its own `then` method (an Emscripten
 * leftover). A bundler's namespace for it copies that `then`, so awaiting
 * `import("@techstark/opencv-js")` directly, or any promise that resolves to
 * the module, never settles and spins the tab. This file imports it
 * statically and only hands it out inside a plain object, and the loader
 * waits for the runtime with a callback instead of awaiting the module.
 *
 * Import this file with `await import("./opencv")` so the ~10 MB library
 * lands in its own chunk.
 */

import * as opencvNamespace from "@techstark/opencv-js";

/** The handful of OpenCV.js calls the detector uses. */
export type CvMat = {
  rows: number;
  cols: number;
  data32S: Int32Array;
  delete(): void;
};
export type CvMatVector = { size(): number; get(i: number): CvMat; delete(): void };
export type CvSize = { width: number; height: number };
export type CvRotatedRect = {
  center: { x: number; y: number };
  size: { width: number; height: number };
  angle: number;
};
export type Cv = {
  Mat: new () => CvMat;
  MatVector: new () => CvMatVector;
  Size: new (width: number, height: number) => CvSize;
  matFromImageData(image: { data: ArrayLike<number>; width: number; height: number }): CvMat;
  resize(src: CvMat, dst: CvMat, size: CvSize, fx: number, fy: number, interpolation: number): void;
  cvtColor(src: CvMat, dst: CvMat, code: number): void;
  GaussianBlur(src: CvMat, dst: CvMat, size: CvSize, sigmaX: number): void;
  Canny(src: CvMat, dst: CvMat, low: number, high: number): void;
  threshold(src: CvMat, dst: CvMat, thresh: number, maxval: number, type: number): number;
  getStructuringElement(shape: number, size: CvSize): CvMat;
  dilate(src: CvMat, dst: CvMat, kernel: CvMat): void;
  findContours(image: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number): void;
  contourArea(contour: CvMat): number;
  arcLength(curve: CvMat, closed: boolean): number;
  approxPolyDP(curve: CvMat, approx: CvMat, epsilon: number, closed: boolean): void;
  minAreaRect(points: CvMat): CvRotatedRect;
  INTER_AREA: number;
  COLOR_RGBA2GRAY: number;
  MORPH_RECT: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  THRESH_BINARY: number;
  THRESH_OTSU: number;
};

type Runtime = {
  Mat?: unknown;
  then?: (callback: () => void) => void;
  onRuntimeInitialized?: () => void;
};

const READY_TIMEOUT_MS = 60_000;

let ready: Promise<{ cv: Cv }> | null = null;

/** Resolves (with a wrapper, never the module itself) once OpenCV can run. */
export function loadOpenCv(): Promise<{ cv: Cv }> {
  ready ??= new Promise<{ cv: Cv }>((resolve, reject) => {
    const runtime = ((opencvNamespace as unknown as { default?: unknown }).default ??
      opencvNamespace) as Runtime;
    const done = () => {
      clearTimeout(timer);
      resolve({ cv: runtime as unknown as Cv });
    };
    const timer = setTimeout(() => reject(new Error("OpenCV took too long to start")), READY_TIMEOUT_MS);
    if (typeof runtime.Mat === "function") {
      done();
    } else if (typeof runtime.then === "function") {
      runtime.then(() => done());
    } else {
      const previous = runtime.onRuntimeInitialized;
      runtime.onRuntimeInitialized = () => {
        previous?.();
        done();
      };
    }
  }).catch((error: unknown) => {
    ready = null;
    throw error;
  });
  return ready;
}
