import { describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "fs";
import path from "path";

import { MODEL_CACHE_NAME, ORT_VERSION, ORT_WASM_PATHS, fetchModelBytes, resetWebGpuFailure, webGpuCanRunModels, withWasmFallback } from "./ort";
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

describe("withWasmFallback", () => {
  type Fake = {
    inputNames: string[];
    run: (feeds: Record<string, number>) => Promise<string>;
    release: () => Promise<void>;
  };
  function fake(name: string, fail = false) {
    const released = { done: false };
    const session: Fake = {
      inputNames: [`${name}-in`],
      run: jest.fn((feeds: Record<string, number>) =>
        fail
          ? Promise.reject(new Error("[WebGPU] Kernel failed: scale and zero-point inputs must have the same rank"))
          : Promise.resolve(`${name}:${feeds.x}`),
      ),
      release: jest.fn(() => {
        released.done = true;
        return Promise.resolve();
      }),
    };
    return { session, released };
  }

  it("runs on WebGPU while it works", async () => {
    const gpu = fake("gpu");
    const makeWasm = jest.fn(() => Promise.resolve(fake("wasm").session));
    const wrapped = withWasmFallback(gpu.session, makeWasm);
    await expect(wrapped.run({ x: 1 })).resolves.toBe("gpu:1");
    expect(makeWasm).not.toHaveBeenCalled();
    expect(wrapped.inputNames).toEqual(["gpu-in"]);
  });

  it("rebuilds on WASM and reruns the same inputs when a WebGPU run fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const gpu = fake("gpu", true);
    const wasm = fake("wasm");
    const makeWasm = jest.fn(() => Promise.resolve(wasm.session));
    const wrapped = withWasmFallback(gpu.session, makeWasm);

    await expect(wrapped.run({ x: 2 })).resolves.toBe("wasm:2");
    await expect(wrapped.run({ x: 3 })).resolves.toBe("wasm:3");

    expect(makeWasm).toHaveBeenCalledTimes(1);
    expect(gpu.session.run).toHaveBeenCalledTimes(1);
    expect(gpu.released.done).toBe(true);
    expect(wrapped.inputNames).toEqual(["wasm-in"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("builds WASM once when two runs fail together", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const makeWasm = jest.fn(() => Promise.resolve(fake("wasm").session));
    const wrapped = withWasmFallback(fake("gpu", true).session, makeWasm);
    const results = await Promise.all([wrapped.run({ x: 1 }), wrapped.run({ x: 2 })]);
    expect(results).toEqual(["wasm:1", "wasm:2"]);
    expect(makeWasm).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("surfaces a WASM failure instead of looping", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const wrapped = withWasmFallback(fake("gpu", true).session, () => Promise.resolve(fake("wasm", true).session));
    await expect(wrapped.run({ x: 1 })).rejects.toThrow("same rank");
    warn.mockRestore();
  });

  it("releases whichever session is current", async () => {
    const gpu = fake("gpu");
    const wrapped = withWasmFallback(gpu.session, () => Promise.resolve(fake("wasm").session));
    await wrapped.release();
    expect(gpu.released.done).toBe(true);
  });
});

describe("webGpuCanRunModels", () => {
  const gpu = (features: string[] | null) => ({
    requestAdapter: () => Promise.resolve(features ? { features: new Set(features) } : null),
  });

  it("needs an adapter with shader-f16, since the models are float16", async () => {
    resetWebGpuFailure();
    await expect(webGpuCanRunModels(gpu(["shader-f16"]))).resolves.toBe(true);
    resetWebGpuFailure();
    await expect(webGpuCanRunModels(gpu([]))).resolves.toBe(false);
    resetWebGpuFailure();
    await expect(webGpuCanRunModels(gpu(null))).resolves.toBe(false);
    resetWebGpuFailure();
    await expect(webGpuCanRunModels(undefined)).resolves.toBe(false);
  });

  it("treats a failed adapter request as no WebGPU", async () => {
    resetWebGpuFailure();
    await expect(webGpuCanRunModels({ requestAdapter: () => Promise.reject(new Error("blocked")) })).resolves.toBe(
      false,
    );
  });
});
