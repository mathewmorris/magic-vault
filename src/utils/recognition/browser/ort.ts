/**
 * ONNX Runtime Web, loaded lazily so it stays out of the initial bundle.
 *
 * The runtime's .wasm files come from jsDelivr instead of being emitted by
 * webpack (they're ~10-25 MB each). Model bytes are kept in the Cache Storage
 * API so the 4-8 MB models download once per browser.
 */

import type * as OrtModule from "onnxruntime-web";

export type Ort = typeof OrtModule;
export type OrtSession = OrtModule.InferenceSession;

/**
 * Keep in sync with "onnxruntime-web" in package.json: the JS we bundle and
 * the .wasm we fetch from the CDN must be the same build. ort.test.ts checks
 * this against the installed package.
 */
export const ORT_VERSION = "1.31.1";
export const ORT_WASM_PATHS = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export const MODEL_CACHE_NAME = "magic-vault-models-v1";

let ortPromise: Promise<Ort> | null = null;

export function wasmThreadCount(): number {
  if (typeof globalThis.crossOriginIsolated === "boolean" && globalThis.crossOriginIsolated) {
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 0;
    return Math.max(1, Math.min(4, cores || 1));
  }
  // Threads need SharedArrayBuffer, which needs cross-origin isolation.
  return 1;
}

export function loadOrt(): Promise<Ort> {
  ortPromise ??= import("onnxruntime-web")
    .then((mod) => {
      // Some bundlers put the namespace on .default.
      const ort = (mod as { default?: Ort }).default ?? mod;
      ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
      ort.env.wasm.numThreads = wasmThreadCount();
      return ort;
    })
    .catch((error: unknown) => {
      ortPromise = null; // let a later call try again
      throw error;
    });
  return ortPromise;
}

type CacheStorageLike = {
  open(name: string): Promise<{
    match(request: string): Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> } | undefined>;
    put(request: string, response: Response): Promise<void>;
  }>;
};

/**
 * Fetch a model's bytes, from Cache Storage when we have them. Any cache
 * failure (private mode, quota, no `caches` on plain http) falls back to a
 * plain fetch.
 */
export async function fetchModelBytes(
  url: string,
  deps: { fetch?: typeof fetch; caches?: CacheStorageLike | null } = {},
): Promise<Uint8Array> {
  const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const cacheStorage =
    deps.caches !== undefined
      ? deps.caches
      : typeof caches !== "undefined"
        ? (caches as unknown as CacheStorageLike)
        : null;

  let cache: Awaited<ReturnType<CacheStorageLike["open"]>> | null = null;
  if (cacheStorage) {
    try {
      cache = await cacheStorage.open(MODEL_CACHE_NAME);
      const hit = await cache.match(url);
      if (hit?.ok) return new Uint8Array(await hit.arrayBuffer());
    } catch {
      cache = null;
    }
  }

  const response = await doFetch(url, { mode: "cors", credentials: "omit" });
  if (!response.ok) throw new Error(`Model download failed (${response.status}): ${url}`);
  if (cache) {
    try {
      await cache.put(url, response.clone());
    } catch {
      // Quota or opaque response: still use the bytes we have.
    }
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function executionProviders(preferWebGpu = true): ("webgpu" | "wasm")[] {
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator && !!(navigator as { gpu?: unknown }).gpu;
  return preferWebGpu && hasGpu ? ["webgpu", "wasm"] : ["wasm"];
}

/** Set once WebGPU has failed on this page, so later sessions go straight to WASM. */
let webGpuFailed = false;

/** For tests. */
export function resetWebGpuFailure(): void {
  webGpuFailed = false;
}

type FallbackSession = {
  run(...args: never[]): Promise<unknown>;
  release?(): Promise<void> | void;
};

/**
 * Wrap a WebGPU session so a failed `run` rebuilds the model on WASM and runs
 * the same inputs again. WebGPU kernels can fail on the first real run even
 * when the session built fine (quantized models hit "scale and zero-point
 * inputs must have the same rank" on some GPUs), so checking at create time
 * isn't enough. After the switch every call goes to WASM.
 */
export function withWasmFallback<S extends FallbackSession>(gpu: S, makeWasm: () => Promise<S>): S {
  let current: S = gpu;
  let onGpu = true;
  let switching: Promise<S> | null = null;

  const switchToWasm = (error: unknown): Promise<S> => {
    switching ??= (async () => {
      webGpuFailed = true;
      console.warn("WebGPU failed while running a model, using WASM instead:", error);
      const wasm = await makeWasm();
      const old = current;
      current = wasm;
      onGpu = false;
      try {
        await old.release?.();
      } catch {
        // Already gone; nothing to free.
      }
      return wasm;
    })();
    return switching;
  };

  const run = async (...args: never[]): Promise<unknown> => {
    if (!onGpu) return current.run(...args);
    try {
      return await current.run(...args);
    } catch (error) {
      const wasm = await switchToWasm(error);
      return wasm.run(...args);
    }
  };

  return new Proxy(gpu, {
    get(_target, prop) {
      if (prop === "run") return run;
      if (prop === "release") return () => current.release?.();
      const value = Reflect.get(current, prop, current) as unknown;
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(current) : value;
    },
  });
}

/**
 * Create a session for the model at `url`, on WebGPU when the browser has it
 * (falling back to WASM per operator), and on plain WASM if WebGPU fails,
 * whether at setup or on a later run.
 */
export async function createSession(url: string, opts: { preferWebGpu?: boolean } = {}): Promise<OrtSession> {
  const ort = await loadOrt();
  const bytes = await fetchModelBytes(url);
  const providers = executionProviders((opts.preferWebGpu ?? true) && !webGpuFailed);
  const createWasm = () =>
    ort.InferenceSession.create(bytes.slice(), {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  if (!providers.includes("webgpu")) return createWasm();

  let gpu: OrtSession;
  try {
    // A copy, in case a failed attempt detaches or holds on to the buffer.
    gpu = await ort.InferenceSession.create(bytes.slice(), {
      executionProviders: providers,
      graphOptimizationLevel: "all",
    });
  } catch (error) {
    webGpuFailed = true;
    console.warn("WebGPU session failed, using WASM instead:", error);
    return createWasm();
  }
  return withWasmFallback(gpu, createWasm);
}
