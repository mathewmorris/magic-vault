/**
 * Find the card's 4 corners in a camera frame.
 *
 * Tries, in order: the corner model (DETRPose, ONNX) if it's configured and
 * loads; then OpenCV edge/contour search. Each one that fails to load is
 * logged once and skipped, so the detector always works with whatever's
 * left. When nothing finds a card, callers fall back to `guideDetection`,
 * the on-screen guide rectangle.
 */

import { POSE_MODEL, type PoseModelSpec } from "../model";
import type { RgbaImage } from "../preprocess";
import { rectToQuad, type Point, type Quad } from "../geometry";
import { decodePoseOutputs } from "../poseDecode";
import { pickCardQuad, rotatedRectPoints, type ContourCandidate } from "../contourPick";
import { cardGuideRect } from "../../scan/cardGuide";
import { createSession, loadOrt, type Ort, type OrtSession } from "./ort";
import {
  float32ToFloat16Bits,
  letterboxTensor,
  numericShape,
  tensorToNumbers,
  type TensorLike,
  type ValueMetadataLike,
} from "./tensorData";
import type { Cv, CvMat } from "./opencv";

export type Detection = { quad: Quad; score: number; source: "pose" | "opencv" | "guide" };

export type CardDetector = {
  readonly kinds: ("pose" | "opencv")[];
  detect(frame: RgbaImage): Promise<Detection | null>;
  dispose(): void;
};

/** The on-screen guide as a detection, so callers always have something to warp. */
export function guideDetection(frameWidth: number, frameHeight: number): Detection {
  return { quad: rectToQuad(cardGuideRect(frameWidth, frameHeight)), score: 0, source: "guide" };
}

const warned = new Set<string>();
function warnOnce(key: string, message: string, error?: unknown) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message, error ?? "");
}

// ---------------------------------------------------------------------------
// Pose model

type PoseRunner = (frame: RgbaImage) => Promise<Detection | null>;

async function createPoseRunner(spec: PoseModelSpec): Promise<{ run: PoseRunner; release: () => void }> {
  const [ort, session] = await Promise.all([loadOrt(), createSession(spec.url)]);
  return { run: poseRunnerFor(ort, session, spec), release: () => void session.release() };
}

function poseRunnerFor(ort: Ort, session: OrtSession, spec: PoseModelSpec): PoseRunner {
  const inputName = session.inputNames[0];
  if (!inputName) throw new Error("Pose model has no inputs");
  const meta = (session.inputMetadata as readonly ValueMetadataLike[] | undefined)?.find(
    (m) => m.name === inputName,
  );
  const shape = numericShape(meta?.shape);
  const size = shape.length === 4 && shape[2] && shape[2] === shape[3] ? shape[2] : spec.inputSize;
  if (size !== spec.inputSize) {
    console.warn(`Pose model wants ${size}px input, not ${spec.inputSize}px; using ${size}.`);
  }
  const half = meta?.type === "float16";

  return async (frame) => {
    const { data, letterbox } = letterboxTensor(frame, size);
    const input = half
      ? new ort.Tensor("float16", float32ToFloat16Bits(data), [1, 3, size, size])
      : new ort.Tensor("float32", data, [1, 3, size, size]);
    const results = await session.run({ [inputName]: input });
    const outputs: Record<string, { dims: readonly number[]; data: ArrayLike<number> }> = {};
    try {
      for (const [name, value] of Object.entries(results)) {
        const tensor = value as unknown as TensorLike;
        try {
          outputs[name] = { dims: tensor.dims, data: tensorToNumbers(tensor) };
        } catch {
          // A non-numeric output (strings, bools); not one we need.
        }
      }
    } finally {
      input.dispose();
      for (const value of Object.values(results)) value.dispose();
    }
    const decoded = decodePoseOutputs(outputs, { inputSize: size, letterbox });
    return decoded && { quad: decoded.quad, score: decoded.score, source: "pose" };
  };
}

// ---------------------------------------------------------------------------
// OpenCV

/** Work on frames no larger than this; edges don't need more. */
const OPENCV_MAX_SIDE = 640;
/** Look at this many of the largest contours per pass. */
const OPENCV_TOP_CONTOURS = 6;

function contourPoints(mat: CvMat): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < mat.rows; i++) points.push({ x: mat.data32S[i * 2]!, y: mat.data32S[i * 2 + 1]! });
  return points;
}

/** 4-corner polygons and bounding boxes of the biggest contours in a binary image. */
function contourCandidates(cv: Cv, binary: CvMat, scale: number): ContourCandidate[] {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const out: ContourCandidate[] = [];
  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const sized: { index: number; area: number }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      sized.push({ index: i, area: cv.contourArea(contour) });
      contour.delete();
    }
    sized.sort((a, b) => b.area - a.area);
    for (const { index, area } of sized.slice(0, OPENCV_TOP_CONTOURS)) {
      const contour = contours.get(index);
      const approx = new cv.Mat();
      try {
        cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
        if (approx.rows === 4) {
          out.push({ kind: "poly", points: contourPoints(approx).map((p) => ({ x: p.x / scale, y: p.y / scale })) });
        }
        const rect = cv.minAreaRect(contour);
        out.push({
          kind: "minAreaRect",
          points: rotatedRectPoints(rect).map((p) => ({ x: p.x / scale, y: p.y / scale })),
          contourArea: area / (scale * scale),
        });
      } finally {
        approx.delete();
        contour.delete();
      }
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }
  return out;
}

/** One OpenCV pass over a frame. Exported for tests that load OpenCV in Node. */
export function opencvDetect(cv: Cv, frame: RgbaImage): Detection | null {
  const scale = Math.min(1, OPENCV_MAX_SIDE / Math.max(frame.width, frame.height));
  const mats: CvMat[] = [];
  const track = <T extends CvMat>(mat: T): T => {
    mats.push(mat);
    return mat;
  };
  try {
    const src = track(cv.matFromImageData(frame));
    let small = src;
    if (scale < 1) {
      small = track(new cv.Mat());
      const w = Math.max(1, Math.round(frame.width * scale));
      const h = Math.max(1, Math.round(frame.height * scale));
      cv.resize(src, small, new cv.Size(w, h), 0, 0, cv.INTER_AREA);
    }
    const gray = track(new cv.Mat());
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Pass 1: edges. Dilating closes small gaps in the card's outline.
    const edges = track(new cv.Mat());
    cv.Canny(blurred, edges, 50, 150);
    const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    const dilated = track(new cv.Mat());
    cv.dilate(edges, dilated, kernel);
    const candidates = contourCandidates(cv, dilated, scale);

    let pick = pickCardQuad(candidates, frame.width, frame.height);
    if (!pick || pick.kind !== "poly") {
      // Pass 2: Otsu threshold, for low-contrast edges (e.g. a card on a pale table).
      const binary = track(new cv.Mat());
      cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      pick = pickCardQuad([...candidates, ...contourCandidates(cv, binary, scale)], frame.width, frame.height);
    }
    return pick && { quad: pick.quad, score: pick.score, source: "opencv" };
  } finally {
    for (const mat of mats) mat.delete();
  }
}

// ---------------------------------------------------------------------------

export async function createCardDetector(
  options: { pose?: PoseModelSpec | null; useOpenCv?: boolean } = {},
): Promise<CardDetector> {
  const poseSpec = options.pose === undefined ? POSE_MODEL : options.pose;
  const useOpenCv = options.useOpenCv ?? true;

  const [pose, cv] = await Promise.all([
    poseSpec
      ? createPoseRunner(poseSpec).catch((error: unknown) => {
          warnOnce("pose-load", "Card corner model didn't load; using OpenCV only.", error);
          return null;
        })
      : Promise.resolve(null),
    useOpenCv
      ? import("./opencv")
          .then((mod) => mod.loadOpenCv())
          .then((wrapped) => wrapped.cv)
          .catch((error: unknown) => {
            warnOnce("opencv-load", "OpenCV didn't load; card edge detection is off.", error);
            return null;
          })
      : Promise.resolve(null),
  ]);

  const kinds: ("pose" | "opencv")[] = [];
  if (pose) kinds.push("pose");
  if (cv) kinds.push("opencv");
  let disposed = false;

  return {
    kinds,
    async detect(frame) {
      if (disposed) throw new Error("Detector was disposed");
      if (pose) {
        try {
          const found = await pose.run(frame);
          if (found) return found;
        } catch (error) {
          warnOnce("pose-run", "Card corner model failed on a frame.", error);
        }
      }
      if (cv) {
        try {
          return opencvDetect(cv, frame);
        } catch (error) {
          warnOnce("opencv-run", "OpenCV card detection failed on a frame.", error);
        }
      }
      return null;
    },
    dispose() {
      disposed = true;
      pose?.release();
    },
  };
}
