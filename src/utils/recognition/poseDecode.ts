/**
 * Decode the corner model's raw outputs into one card quad in frame pixels.
 *
 * The model (dhvazquez/mtg_card_pose_estimation, DETRPose-S with 4 queries)
 * is documented to take a 640x640 RGB image in [0, 1] and return scores,
 * boxes and 4 corner keypoints (TL, TR, BR, BL) per query. Its exact tensor
 * names, shapes and whether keypoints are normalized are NOT documented, so
 * this decoder finds the tensors by shape and checks the value ranges rather
 * than trusting any one export. Pure, no ORT types, so it's unit testable.
 */

import { isPlausibleCardQuad, orderCorners, type Point, type Quad } from "./geometry";

export type Letterbox = {
  /** Frame pixels -> model input pixels. */
  scale: number;
  /** Padding added on the left / top, in model input pixels. */
  padX: number;
  padY: number;
  frameWidth: number;
  frameHeight: number;
};

export type RawTensor = { dims: readonly number[]; data: ArrayLike<number> };

/**
 * Fit a frame into an inputSize x inputSize square, keeping its aspect ratio
 * and centering it (padding the short side).
 */
export function letterboxParams(frameWidth: number, frameHeight: number, inputSize: number): Letterbox {
  if (frameWidth <= 0 || frameHeight <= 0) throw new Error("Frame is empty");
  const scale = inputSize / Math.max(frameWidth, frameHeight);
  return {
    scale,
    padX: (inputSize - frameWidth * scale) / 2,
    padY: (inputSize - frameHeight * scale) / 2,
    frameWidth,
    frameHeight,
  };
}

/** Model input pixels -> frame pixels. */
export function unletterbox(point: Point, letterbox: Letterbox): Point {
  return {
    x: (point.x - letterbox.padX) / letterbox.scale,
    y: (point.y - letterbox.padY) / letterbox.scale,
  };
}

type KeypointLayout = { name: string; tensor: RawTensor; queries: number; stride: number };

/** Find the keypoints tensor: [..., Q, 4, 2|3] or [..., Q, 8|12]. */
function findKeypoints(outputs: Record<string, RawTensor>): KeypointLayout | null {
  const candidates: KeypointLayout[] = [];
  for (const [name, tensor] of Object.entries(outputs)) {
    const dims = tensor.dims;
    const n = dims.length;
    if (n >= 3 && dims[n - 2] === 4 && (dims[n - 1] === 2 || dims[n - 1] === 3)) {
      const queries = n >= 4 ? dims[n - 3]! : 1;
      candidates.push({ name, tensor, queries, stride: dims[n - 1]! });
    } else if (n >= 2 && (dims[n - 1] === 8 || dims[n - 1] === 12)) {
      const queries = dims[n - 2]!;
      candidates.push({ name, tensor, queries, stride: dims[n - 1]! / 4 });
    }
  }
  if (candidates.length === 0) return null;
  // Prefer a tensor whose name says keypoints if several match.
  return (
    candidates.find((c) => /k(ey)?p(oin)?t|corner|landmark/i.test(c.name)) ?? candidates[0]!
  );
}

function sigmoid(v: number): number {
  return 1 / (1 + Math.exp(-v));
}

/** Find per-query scores: [1, Q], [Q], [1, Q, 1], or class logits [1, Q, C]. */
function findScores(
  outputs: Record<string, RawTensor>,
  keypointsName: string,
  queries: number,
): number[] | null {
  type Candidate = { name: string; tensor: RawTensor; classes: number };
  const candidates: Candidate[] = [];
  for (const [name, tensor] of Object.entries(outputs)) {
    if (name === keypointsName) continue;
    // Integer class ids, not confidences.
    if (/label|class_?id/i.test(name) && !/logit|score|prob|conf/i.test(name)) continue;
    const dims = tensor.dims.filter((d, i) => !(i === 0 && d === 1 && tensor.dims.length > 1));
    if (dims.length === 1 && dims[0] === queries) candidates.push({ name, tensor, classes: 1 });
    else if (dims.length === 2 && dims[0] === queries && dims[1] === 1) {
      candidates.push({ name, tensor, classes: 1 });
    } else if (
      dims.length === 2 &&
      dims[0] === queries &&
      /logit|score|prob|conf/i.test(name) &&
      !/box|bbox/i.test(name)
    ) {
      candidates.push({ name, tensor, classes: dims[1]! });
    }
  }
  if (candidates.length === 0) return null;
  const pick =
    candidates.find((c) => c.classes === 1 && /score|conf|prob/i.test(c.name)) ??
    candidates.find((c) => c.classes === 1) ??
    candidates[0]!;

  const raw: number[] = [];
  for (let q = 0; q < queries; q++) {
    let best = -Infinity;
    for (let c = 0; c < pick.classes; c++) best = Math.max(best, Number(pick.tensor.data[q * pick.classes + c]));
    raw.push(best);
  }
  if (raw.some((v) => !Number.isFinite(v))) return null;
  const isLogit = raw.some((v) => v < 0 || v > 1);
  return isLogit ? raw.map(sigmoid) : raw;
}

/**
 * Pick the most confident query with a plausible card and return its corners
 * in frame pixels (ordered TL, TR, BR, BL, portrait). Returns null when no
 * query scores at least minScore (default 0.5) with a plausible quad, or the
 * outputs don't look like keypoints at all.
 */
export function decodePoseOutputs(
  outputs: Record<string, RawTensor>,
  opts: { inputSize: number; letterbox: Letterbox; minScore?: number },
): { quad: Quad; score: number } | null {
  const minScore = opts.minScore ?? 0.5;
  const kp = findKeypoints(outputs);
  if (!kp || kp.queries < 1) return null;
  const perQuery = 4 * kp.stride;
  if (kp.tensor.data.length < kp.queries * perQuery) return null;

  let scores = findScores(outputs, kp.name, kp.queries);
  if (!scores) {
    // No score tensor. With one query there's nothing to choose between; with
    // (x, y, visibility) keypoints, use mean visibility as a stand-in.
    if (kp.stride === 3) {
      scores = [];
      for (let q = 0; q < kp.queries; q++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += Number(kp.tensor.data[q * perQuery + k * 3 + 2]);
        const mean = sum / 4;
        scores.push(mean < 0 || mean > 1 ? sigmoid(mean) : mean);
      }
    } else if (kp.queries === 1) {
      scores = [1];
    } else {
      return null;
    }
  }

  // Normalized coordinates if every x, y is within [-1.5, 1.5].
  let normalized = true;
  for (let q = 0; q < kp.queries && normalized; q++) {
    for (let k = 0; k < 4; k++) {
      const x = Number(kp.tensor.data[q * perQuery + k * kp.stride]);
      const y = Number(kp.tensor.data[q * perQuery + k * kp.stride + 1]);
      if (Math.abs(x) > 1.5 || Math.abs(y) > 1.5) {
        normalized = false;
        break;
      }
    }
  }
  const toInput = normalized ? opts.inputSize : 1;

  const order = scores
    .map((score, q) => ({ score, q }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score);

  const { frameWidth, frameHeight } = opts.letterbox;
  for (const { score, q } of order) {
    const points: Point[] = [];
    for (let k = 0; k < 4; k++) {
      const x = Number(kp.tensor.data[q * perQuery + k * kp.stride]) * toInput;
      const y = Number(kp.tensor.data[q * perQuery + k * kp.stride + 1]) * toInput;
      points.push(unletterbox({ x, y }, opts.letterbox));
    }
    if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    let quad: Quad;
    try {
      quad = orderCorners(points);
    } catch {
      continue;
    }
    if (isPlausibleCardQuad(quad, frameWidth, frameHeight)) return { quad, score };
  }
  return null;
}
