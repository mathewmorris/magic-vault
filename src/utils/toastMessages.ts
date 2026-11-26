/**
 * How a collection is named in a toast: its name in quotes, or a fallback
 * when it was saved without one.
 */
export function collectionLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? `"${trimmed}"` : "your collection";
}

/**
 * Turns a failed mutation into a short message for an error toast. Raw server
 * errors aren't shown to the user; only the tRPC error code is used to pick a
 * hint.
 *
 * `action` finishes the sentence "Couldn't ...", e.g. "create your collection".
 */
export function mutationErrorMessage(action: string, error: unknown): string {
  const lead = `Couldn't ${action}.`;

  switch (getErrorCode(error)) {
    case "UNAUTHORIZED":
      return `${lead} Your session may have expired, so try signing in again.`;
    case "FORBIDDEN":
    case "NOT_FOUND":
      return `${lead} It may have been removed, or it isn't yours.`;
    default:
      return `${lead} Please try again.`;
  }
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return undefined;
  }
  const data = (error as { data: unknown }).data;
  if (typeof data !== "object" || data === null || !("code" in data)) {
    return undefined;
  }
  const code = (data as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
