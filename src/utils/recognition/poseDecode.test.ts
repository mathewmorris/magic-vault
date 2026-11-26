import { describe, expect, it } from "@jest/globals";

import type { Point } from "./geometry";
import { decodePoseOutputs, letterboxParams, unletterbox, type RawTensor } from "./poseDecode";

const INPUT = 640;
const FRAME_W = 1280;
const FRAME_H = 720;
const letterbox = letterboxParams(FRAME_W, FRAME_H, INPUT);

// A portrait card in the frame, TL, TR, BR, BL.
const CARD: Point[] = [
  { x: 500, y: 120 },
  { x: 780, y: 130 },
  { x: 770, y: 520 },
  { x: 490, y: 510 },
];
// Something that isn't a card (a thin sliver).
const JUNK: Point[] = [
  { x: 10, y: 10 },
  { x: 20, y: 10 },
  { x: 20, y: 15 },
  { x: 10, y: 15 },
];

function toInput(points: Point[], normalized: boolean): number[][] {
  return points.map(({ x, y }) => {
    const ix = x * letterbox.scale + letterbox.padX;
    const iy = y * letterbox.scale + letterbox.padY;
    return normalized ? [ix / INPUT, iy / INPUT] : [ix, iy];
  });
}

function flat(rows: number[][]): number[] {
  return ([] as number[]).concat(...rows);
}

function tensor(dims: number[], values: number[]): RawTensor {
  return { dims, data: Float32Array.from(values) };
}

function expectCard(result: ReturnType<typeof decodePoseOutputs>) {
  expect(result).not.toBeNull();
  result!.quad.forEach((p, i) => {
    expect(p.x).toBeCloseTo(CARD[i]!.x, 2);
    expect(p.y).toBeCloseTo(CARD[i]!.y, 2);
  });
}

describe("letterboxParams", () => {
  it("fits a landscape frame and pads top and bottom", () => {
    expect(letterbox.scale).toBe(0.5);
    expect(letterbox.padX).toBe(0);
    expect(letterbox.padY).toBe(140);
  });

  it("fits a portrait frame and pads left and right", () => {
    const lb = letterboxParams(720, 1280, 640);
    expect(lb.scale).toBe(0.5);
    expect(lb.padX).toBe(140);
    expect(lb.padY).toBe(0);
    expect(unletterbox({ x: 140, y: 0 }, lb)).toEqual({ x: 0, y: 0 });
  });
});

describe("decodePoseOutputs", () => {
  it("decodes [1,Q,4,2] normalized keypoints with [1,Q] probabilities", () => {
    const kps = [...toInput(JUNK, true), ...toInput(CARD, true), ...toInput(JUNK, true), ...toInput(JUNK, true)];
    const result = decodePoseOutputs(
      {
        scores: tensor([1, 4], [0.9, 0.8, 0.1, 0.05]),
        boxes: tensor([1, 4, 4], new Array<number>(16).fill(0.5)),
        keypoints: tensor([1, 4, 4, 2], flat(kps)),
      },
      { inputSize: INPUT, letterbox },
    );
    // Query 0 scores higher but isn't a plausible card, so query 1 wins.
    expectCard(result);
    expect(result!.score).toBeCloseTo(0.8);
  });

  it("decodes flattened [1,Q,8] pixel keypoints with [1,Q,1] logits", () => {
    const kps = [...toInput(CARD, false), ...toInput(JUNK, false)];
    const result = decodePoseOutputs(
      {
        output0: tensor([1, 2, 1], [3, -4]),
        output1: tensor([1, 2, 8], flat(kps)),
      },
      { inputSize: INPUT, letterbox },
    );
    expectCard(result);
    expect(result!.score).toBeCloseTo(1 / (1 + Math.exp(-3)));
  });

  it("decodes [1,Q,4,3] keypoints with visibility and no score tensor", () => {
    const withVis = toInput(CARD, true).map(([x, y]) => [x!, y!, 0.95]);
    const result = decodePoseOutputs(
      { kpts: tensor([1, 1, 4, 3], flat(withVis)) },
      { inputSize: INPUT, letterbox },
    );
    expectCard(result);
    expect(result!.score).toBeCloseTo(0.95);
  });

  it("decodes [1,Q,12] keypoints and max-of-class logits", () => {
    const kps = [...toInput(JUNK, false), ...toInput(CARD, false)].map(([x, y]) => [x!, y!, 1]);
    const result = decodePoseOutputs(
      {
        pred_logits: tensor([1, 2, 2], [-5, -6, -2, 4]),
        pred_boxes: tensor([1, 2, 4], new Array<number>(8).fill(100)),
        pred_keypoints: tensor([1, 2, 12], flat(kps)),
      },
      { inputSize: INPUT, letterbox },
    );
    expectCard(result);
  });

  it("finds a single unnamed query and accepts it", () => {
    const result = decodePoseOutputs(
      { "1234": tensor([1, 1, 4, 2], flat(toInput(CARD, true))) },
      { inputSize: INPUT, letterbox },
    );
    expectCard(result);
    expect(result!.score).toBe(1);
  });

  it("puts shuffled keypoints into TL, TR, BR, BL order", () => {
    const shuffled = [CARD[2]!, CARD[0]!, CARD[3]!, CARD[1]!];
    const result = decodePoseOutputs(
      { scores: tensor([1, 1], [0.99]), keypoints: tensor([1, 1, 4, 2], flat(toInput(shuffled, true))) },
      { inputSize: INPUT, letterbox },
    );
    expectCard(result);
  });

  it("ignores integer labels when looking for scores", () => {
    const result = decodePoseOutputs(
      {
        labels: tensor([1, 2], [0, 0]),
        scores: tensor([1, 2], [0.2, 0.7]),
        keypoints: tensor([1, 2, 4, 2], flat([...toInput(JUNK, true), ...toInput(CARD, true)])),
      },
      { inputSize: INPUT, letterbox },
    );
    expectCard(result);
  });

  it("returns null below minScore", () => {
    const outputs = {
      scores: tensor([1, 1], [0.4]),
      keypoints: tensor([1, 1, 4, 2], flat(toInput(CARD, true))),
    };
    expect(decodePoseOutputs(outputs, { inputSize: INPUT, letterbox })).toBeNull();
    expectCard(decodePoseOutputs(outputs, { inputSize: INPUT, letterbox, minScore: 0.3 }));
  });

  it("returns null when nothing is plausible", () => {
    const result = decodePoseOutputs(
      { scores: tensor([1, 1], [0.99]), keypoints: tensor([1, 1, 4, 2], flat(toInput(JUNK, true))) },
      { inputSize: INPUT, letterbox },
    );
    expect(result).toBeNull();
  });

  it("returns null when there's no keypoints tensor or the data is short", () => {
    expect(decodePoseOutputs({ boxes: tensor([1, 4, 4], new Array<number>(16).fill(0)) }, { inputSize: INPUT, letterbox })).toBeNull();
    expect(
      decodePoseOutputs({ keypoints: { dims: [1, 4, 4, 2], data: new Float32Array(8) } }, { inputSize: INPUT, letterbox }),
    ).toBeNull();
  });

  it("returns null with several queries and no way to score them", () => {
    const kps = [...toInput(CARD, true), ...toInput(CARD, true)];
    expect(
      decodePoseOutputs({ keypoints: tensor([1, 2, 4, 2], flat(kps)) }, { inputSize: INPUT, letterbox }),
    ).toBeNull();
  });

  it("skips non-finite keypoints", () => {
    const kps = [...flat(toInput(CARD, true))];
    kps[0] = NaN;
    expect(
      decodePoseOutputs(
        { scores: tensor([1, 1], [0.9]), keypoints: tensor([1, 1, 4, 2], kps) },
        { inputSize: INPUT, letterbox },
      ),
    ).toBeNull();
  });
});
