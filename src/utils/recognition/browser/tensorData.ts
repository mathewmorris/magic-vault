/**
 * Pure helpers for moving pixels in and out of ONNX tensors. No ORT import,
 * so they're unit testable; ./ort.ts and the detector/embedder use them.
 */

import type { RgbaImage } from "../preprocess";
import { letterboxParams, type Letterbox } from "../poseDecode";

/** A tensor as ORT hands it back, narrowed to what we read. */
export type TensorLike = { type: string; dims: readonly number[]; data: unknown };

/** Value metadata as ORT reports it (shape entries can be symbolic names). */
export type ValueMetadataLike = {
  name: string;
  isTensor: boolean;
  type?: string;
  shape?: ReadonlyArray<number | string>;
};

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** IEEE 754 half-precision bits for a float, rounding to nearest even. */
export function toFloat16Bits(value: number): number {
  f32[0] = value;
  const x = u32[0]!;
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  let mant = x & 0x7fffff;

  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0); // Inf / NaN
  let e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00; // overflow -> Inf
  if (e <= 0) {
    // Subnormal half (or zero).
    if (e < -10) return sign;
    mant |= 0x800000;
    const shift = 14 - e;
    let half = mant >>> shift;
    const rem = mant & ((1 << shift) - 1);
    const mid = 1 << (shift - 1);
    if (rem > mid || (rem === mid && half & 1)) half++;
    return sign | half;
  }
  let half = (e << 10) | (mant >>> 13);
  const rem = mant & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && half & 1)) half++; // may carry into exponent, which is correct
  e = half >>> 10;
  if (e >= 0x1f) return sign | 0x7c00;
  return sign | half;
}

export function fromFloat16Bits(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exp = (bits >>> 10) & 0x1f;
  const mant = bits & 0x3ff;
  if (exp === 0) return sign * mant * 2 ** -24;
  if (exp === 0x1f) return mant ? NaN : sign * Infinity;
  return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}

export function float32ToFloat16Bits(values: ArrayLike<number>): Uint16Array {
  const out = new Uint16Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = toFloat16Bits(values[i]!);
  return out;
}

/**
 * A tensor's values as plain numbers. float16 arrives as raw Uint16 bits
 * (unless the browser has Float16Array); int64 as BigInt64Array.
 */
export function tensorToNumbers(tensor: TensorLike): ArrayLike<number> {
  const { type, data } = tensor;
  if (type === "float16" && data instanceof Uint16Array) {
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = fromFloat16Bits(data[i]!);
    return out;
  }
  if (data instanceof BigInt64Array || data instanceof BigUint64Array) {
    return Array.from(data, (v) => Number(v));
  }
  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    return data as unknown as ArrayLike<number>;
  }
  if (Array.isArray(data)) return data as number[];
  throw new Error(`Tensor of type ${type} has no numeric data`);
}

/** Numeric dims from a metadata shape, or null where a dim is symbolic. */
export function numericShape(shape: ReadonlyArray<number | string> | undefined): (number | null)[] {
  return (shape ?? []).map((d) => (typeof d === "number" && d > 0 ? d : null));
}

/** Pad value for letterboxing, the usual gray (114/255). Unverified for this model. */
export const LETTERBOX_FILL = 114 / 255;

/**
 * Letterbox an RGBA frame into an inputSize x inputSize NCHW float tensor of
 * RGB in [0, 1] (bilinear, half-pixel centers), plus the letterbox needed to
 * map the model's coordinates back to the frame.
 */
export function letterboxTensor(
  frame: RgbaImage,
  inputSize: number,
): { data: Float32Array; letterbox: Letterbox } {
  const letterbox = letterboxParams(frame.width, frame.height, inputSize);
  const { scale, padX, padY } = letterbox;
  const plane = inputSize * inputSize;
  const out = new Float32Array(plane * 3).fill(LETTERBOX_FILL);
  const { width: sw, height: sh, data: src } = frame;
  const x0Out = Math.max(0, Math.floor(padX));
  const x1Out = Math.min(inputSize, Math.ceil(padX + sw * scale));
  const y0Out = Math.max(0, Math.floor(padY));
  const y1Out = Math.min(inputSize, Math.ceil(padY + sh * scale));

  for (let y = y0Out; y < y1Out; y++) {
    const sy = Math.min(Math.max((y + 0.5 - padY) / scale - 0.5, 0), sh - 1);
    const ya = Math.floor(sy);
    const yb = Math.min(ya + 1, sh - 1);
    const fy = sy - ya;
    for (let x = x0Out; x < x1Out; x++) {
      const sx = Math.min(Math.max((x + 0.5 - padX) / scale - 0.5, 0), sw - 1);
      const xa = Math.floor(sx);
      const xb = Math.min(xa + 1, sw - 1);
      const fx = sx - xa;
      const i00 = (ya * sw + xa) * 4;
      const i01 = (ya * sw + xb) * 4;
      const i10 = (yb * sw + xa) * 4;
      const i11 = (yb * sw + xb) * 4;
      const o = y * inputSize + x;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c]! * (1 - fx) + src[i01 + c]! * fx;
        const bottom = src[i10 + c]! * (1 - fx) + src[i11 + c]! * fx;
        out[c * plane + o] = (top * (1 - fy) + bottom * fy) / 255;
      }
    }
  }
  return { data: out, letterbox };
}
