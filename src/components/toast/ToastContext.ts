import { createContext } from "react";

import { type ToastType } from "./toastState";

export type ShowToastOptions = {
  /** Override how long the toast stays up, in milliseconds. */
  duration?: number;
};

export type ToastApi = {
  show: (type: ToastType, message: string, options?: ShowToastOptions) => string;
  success: (message: string, options?: ShowToastOptions) => string;
  error: (message: string, options?: ShowToastOptions) => string;
  info: (message: string, options?: ShowToastOptions) => string;
  dismiss: (id: string) => void;
};

export const ToastContext = createContext<ToastApi | null>(null);
