export type CameraErrorKind = "denied" | "not-found" | "in-use" | "unsupported" | "unknown";

export interface CameraErrorInfo {
  kind: CameraErrorKind;
  message: string;
}

const MESSAGES: Record<CameraErrorKind, string> = {
  denied:
    "Camera access was blocked. Allow camera access for this site in your browser settings, then try again.",
  "not-found": "We couldn't find a camera on this device.",
  "in-use": "The camera is being used by another app. Close it and try again.",
  unsupported:
    "This browser can't use the camera here. Camera access needs HTTPS (or localhost) and a modern browser.",
  unknown: "Something went wrong starting the camera.",
};

// getUserMedia rejects with a DOMException; its `name` tells us why.
// The older names in each list are from earlier Chrome and Firefox versions.
const KIND_BY_ERROR_NAME = new Map<string, CameraErrorKind>([
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
]);

/** Turn whatever getUserMedia threw into something we can show the user. */
export function classifyCameraError(error: unknown): CameraErrorInfo {
  const name =
    typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
      ? error.name
      : "";
  const kind = KIND_BY_ERROR_NAME.get(name) ?? "unknown";
  return { kind, message: MESSAGES[kind] };
}
