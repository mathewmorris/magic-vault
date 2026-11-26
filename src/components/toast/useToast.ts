"use client";

import { useContext } from "react";

import { ToastContext, type ToastApi } from "./ToastContext";

/**
 * Show a toast from any client component under ToastProvider:
 *
 *   const toast = useToast();
 *   toast.success("Collection created");
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return api;
}
