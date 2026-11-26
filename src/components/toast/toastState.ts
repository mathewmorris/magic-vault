export type ToastType = "success" | "error" | "info";

export type Toast = {
  id: string;
  type: ToastType;
  message: string;
  /** How long the toast stays up, in milliseconds. */
  duration: number;
};

export type ToastAction =
  | { type: "add"; toast: Toast }
  | { type: "dismiss"; id: string }
  | { type: "clear" };

/** The most toasts on screen at once. The oldest drop off first. */
export const MAX_TOASTS = 4;

/** Errors stay up a little longer so there's time to read them. */
export const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  error: 7000,
};

export function toastReducer(state: Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case "add": {
      // Same message showing already? Swap it for the new one instead of
      // stacking duplicates (e.g. a double-clicked button).
      const withoutDuplicate = state.filter(
        (t) =>
          !(t.type === action.toast.type && t.message === action.toast.message),
      );
      return [...withoutDuplicate, action.toast].slice(-MAX_TOASTS);
    }
    case "dismiss":
      return state.filter((t) => t.id !== action.id);
    case "clear":
      return [];
  }
}

let counter = 0;

export function createToast(
  type: ToastType,
  message: string,
  duration: number = DEFAULT_DURATIONS[type],
): Toast {
  counter += 1;
  return { id: `toast-${counter}`, type, message, duration };
}
