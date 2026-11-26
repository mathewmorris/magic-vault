import { describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "fs";
import path from "path";

import { MODEL_CACHE_NAME, ORT_VERSION, ORT_WASM_PATHS, fetchModelBytes } from "./ort";
import { fitSize } from "./frame";

describe("ORT_VERSION", () => {
  it("matches the installed onnxruntime-web, so the CDN .wasm matches the bundled JS", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(process.cwd(), "node_modules/onnxruntime-web/package.json"), "utf8"),
    ) as { version: string };
    expect(ORT_VERSION).toBe(pkg.version);
    expect(ORT_WASM_PATHS).toContain(`onnxruntime-web@${pkg.version}/dist/`);
  });
});

function response(bytes: number[], ok = true) {
  const body = new Uint8Array(bytes).buffer;
  const make = (): Response =>
    ({
      ok,
      status: ok ? 200 : 404,
      arrayBuffer: () => Promise.resolve(body.slice(0)),
      clone: () => make(),
    }) as unknown as Response;
  return make();
}

function fakeCaches(store = new Map<string, Response>()) {
  const opened: string[] = [];
  return {
    store,
    opened,
    caches: {
      open: (name: string) => {
        opened.push(name);
        return Promise.resolve({
          match: (url: string) => Promise.resolve(store.get(url)),
          put: (url: string, res: Response) => {
            store.set(url, res);
            return Promise.resolve();
          },
        });
      },
    },
  };
}

describe("fetchModelBytes", () => {
  const url = "https://example.invalid/model.onnx";

  it("downloads once and serves later calls from the cache", async () => {
    const fetchFn = jest.fn(() => Promise.resolve(response([1, 2, 3])));
    const cache = fakeCaches();
    const first = await fetchModelBytes(url, { fetch: fetchFn as unknown as typeof fetch, caches: cache.caches });
    const second = await fetchModelBytes(url, { fetch: fetchFn as unknown as typeof fetch, caches: cache.caches });
    expect(Array.from(first)).toEqual([1, 2, 3]);
    expect(Array.from(second)).toEqual([1, 2, 3]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(cache.opened[0]).toBe(MODEL_CACHE_NAME);
  });

  it("falls back to a plain fetch when the cache fails", async () => {
    const fetchFn = jest.fn(() => Promise.resolve(response([9])));
    const broken = { open: () => Promise.reject(new Error("SecurityError")) };
    const bytes = await fetchModelBytes(url, { fetch: fetchFn as unknown as typeof fetch, caches: broken });
    expect(Array.from(bytes)).toEqual([9]);
  });

  it("works with no Cache Storage at all", async () => {
    const fetchFn = jest.fn(() => Promise.resolve(response([7])));
    const bytes = await fetchModelBytes(url, { fetch: fetchFn as unknown as typeof fetch, caches: null });
    expect(Array.from(bytes)).toEqual([7]);
  });

  it("throws on a failed download and caches nothing", async () => {
    const cache = fakeCaches();
    const fetchFn = jest.fn(() => Promise.resolve(response([], false)));
    await expect(
      fetchModelBytes(url, { fetch: fetchFn as unknown as typeof fetch, caches: cache.caches }),
    ).rejects.toThrow(/404/);
    expect(cache.store.size).toBe(0);
  });
});

describe("fitSize", () => {
  it("downscales the long side and never upscales", () => {
    expect(fitSize(1920, 1080, 1280)).toEqual({ width: 1280, height: 720 });
    expect(fitSize(1080, 1920, 1280)).toEqual({ width: 720, height: 1280 });
    expect(fitSize(640, 480, 1280)).toEqual({ width: 640, height: 480 });
  });
});
