/**
 * createCardDetector with a stand-in for OpenCV.js whose module object has
 * an Emscripten-style `then`, like the real one.
 */
import { describe, expect, it, jest } from "@jest/globals";

let thenCalls = 0;
const runtime = {
  Mat: function Mat() {
    return undefined;
  },
  // Emscripten's Module.then calls back right away once the runtime is up,
  // with the module itself, so a promise resolved with it never settles.
  then(callback: (module: unknown) => void) {
    thenCalls++;
    if (thenCalls > 50) throw new Error("re-resolved with the OpenCV module over and over");
    callback(runtime);
    return runtime;
  },
};

jest.mock("./opencv", () => ({
  loadOpenCv: () => Promise.resolve({ cv: runtime }),
}));

import { createCardDetector } from "./detector";

describe("createCardDetector", () => {
  it("loads OpenCV without resolving a promise with the module (that freezes the tab)", async () => {
    thenCalls = 0;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const detector = await createCardDetector({ pose: null, useOpenCv: true });

    expect(detector.kinds).toEqual(["opencv"]);
    expect(thenCalls).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
