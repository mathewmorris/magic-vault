/**
 * Image -> model input tensor, shared by the browser and the Node indexer so
 * both produce identical inputs for the same pixels. Pure TypeScript on RGBA
 * byte arrays (what canvas getImageData and jpeg-js both give), no DOM.
 */

import type { EmbedModelSpec } from "./model";

export type RgbaImage = {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
};

/** Bilinear resize of an RGBA image (half-pixel centers, like OpenCV/PIL). */
export function resizeBilinear(src: RgbaImage, width: number, height: number): RgbaImage {
  if (src.width <= 0 || src.height <= 0) throw new Error("Image is empty");
  if (src.data.length < src.width * src.height * 4) throw new Error("Image data is too short");
  const out = new Uint8ClampedArray(width * height * 4);
  const scaleX = src.width / width;
  const scaleY = src.height / height;

  for (let y = 0; y < height; y++) {
    const sy = Math.min(Math.max((y + 0.5) * scaleY - 0.5, 0), src.height - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, src.height - 1);
    const fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(Math.max((x + 0.5) * scaleX - 0.5, 0), src.width - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, src.width - 1);
      const fx = sx - x0;
      const i00 = (y0 * src.width + x0) * 4;
      const i01 = (y0 * src.width + x1) * 4;
      const i10 = (y1 * src.width + x0) * 4;
      const i11 = (y1 * src.width + x1) * 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src.data[i00 + c]! * (1 - fx) + src.data[i01 + c]! * fx;
        const bottom = src.data[i10 + c]! * (1 - fx) + src.data[i11 + c]! * fx;
        out[o + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return { data: out, width, height };
}

/**
 * Resize to the model's input size and normalize into a Float32Array in the
 * model's layout. Alpha is ignored.
 */
export function toModelInput(
  image: RgbaImage,
  spec: Pick<EmbedModelSpec, "inputWidth" | "inputHeight" | "mean" | "std" | "layout">,
): Float32Array {
  const { inputWidth: w, inputHeight: h, mean, std, layout } = spec;
  const resized =
    image.width === w && image.height === h ? image : resizeBilinear(image, w, h);
  const plane = w * h;
  const out = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      const value = (resized.data[i * 4 + c]! / 255 - mean[c]!) / std[c]!;
      if (layout === "NCHW") out[c * plane + i] = value;
      else out[i * 3 + c] = value;
    }
  }
  return out;
}
