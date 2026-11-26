"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { ToastContext, type ShowToastOptions, type ToastApi } from "./ToastContext";
import {
  createToast,
  toastReducer,
  type Toast,
  type ToastType,
} from "./toastState";

const accentByType: Record<ToastType, string> = {
  success: "border-l-green-500",
  error: "border-l-red-500",
  info: "border-l-purple-400",
};

const iconByType: Record<ToastType, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

const iconColorByType: Record<ToastType, string> = {
  success: "bg-green-500",
  error: "bg-red-500",
  info: "bg-purple-400",
};

/** Words a screen reader hears before the message, since the icon is hidden. */
const srLabelByType: Record<ToastType, string> = {
  success: "Success:",
  error: "Error:",
  info: "Note:",
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  // The countdown pauses while the pointer is over the toast or focus is in
  // it, so it doesn't vanish mid-read or out from under the close button.
  const remaining = useRef(toast.duration);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pause = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current -= Date.now() - startedAt.current;
  }, []);

  const resume = useCallback(() => {
    if (timer.current !== null) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(
      () => onDismiss(toast.id),
      Math.max(remaining.current, 0),
    );
  }, [onDismiss, toast.id]);

  useEffect(() => {
    resume();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [resume]);

  const isError = toast.type === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border border-l-4 border-gray-200 bg-white p-4 text-gray-900 shadow-lg motion-safe:animate-toast-in dark:border-gray-800 dark:bg-gray-950 dark:text-white ${accentByType[toast.type]}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${iconColorByType[toast.type]}`}
      >
        {iconByType[toast.type]}
      </span>
      <p className="flex-1 text-sm">
        <span className="sr-only">{srLabelByType[toast.type]} </span>
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="-m-1 rounded-full p-1 leading-none text-gray-500 transition hover:text-pink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 motion-reduce:transition-none dark:text-gray-400 dark:hover:text-pink-400 dark:hover:drop-shadow-glow"
      >
        <span aria-hidden="true" className="text-lg">
          ×
        </span>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);

  const dismiss = useCallback((id: string) => {
    dispatch({ type: "dismiss", id });
  }, []);

  const show = useCallback(
    (type: ToastType, message: string, options?: ShowToastOptions) => {
      const toast = createToast(type, message, options?.duration);
      dispatch({ type: "add", toast });
      return toast.id;
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (message, options) => show("success", message, options),
      error: (message, options) => show("error", message, options),
      info: (message, options) => show("info", message, options),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm"
      >
        <div className="flex flex-col gap-2">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      </section>
    </ToastContext.Provider>
  );
}
