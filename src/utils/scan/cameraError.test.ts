import { classifyCameraError } from "./cameraError";

const namedError = (name: string) => {
  const error = new Error("camera failed");
  error.name = name;
  return error;
};

describe("classifyCameraError", () => {
  test.each([
    ["NotAllowedError", "denied"],
    ["PermissionDeniedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "not-found"],
    ["DevicesNotFoundError", "not-found"],
    ["OverconstrainedError", "not-found"],
    ["NotReadableError", "in-use"],
    ["TrackStartError", "in-use"],
    ["AbortError", "in-use"],
    ["NotSupportedError", "unsupported"],
    ["TypeError", "unsupported"],
  ])("maps %s to %s", (name, kind) => {
    expect(classifyCameraError(namedError(name)).kind).toBe(kind);
  });

  test("works with plain objects shaped like a DOMException", () => {
    expect(classifyCameraError({ name: "NotAllowedError", message: "Permission denied" }).kind).toBe(
      "denied",
    );
  });

  test("tells the user how to fix a denied permission", () => {
    expect(classifyCameraError(namedError("NotAllowedError")).message).toMatch(/allow camera access/i);
  });

  test.each([[null], [undefined], ["oops"], [42], [{}], [{ name: 7 }], [namedError("toString")]])(
    "falls back to unknown for %j",
    (error) => {
      const info = classifyCameraError(error);
      expect(info.kind).toBe("unknown");
      expect(info.message).not.toBe("");
    },
  );
});
