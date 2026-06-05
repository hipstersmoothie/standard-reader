import { flushSync } from "react-dom";
import { ToastQueue } from "react-stately";

import type { ButtonVariant, ToastVariant } from "../theme/types";

export interface ToastContentType {
  variant?: ToastVariant;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    variant?: ButtonVariant;
    onPress: () => void;
  };
}

export const toasts = new ToastQueue<ToastContentType>({
  // Run toast updates synchronously. Do NOT use startViewTransition here: it
  // captures the entire page and animates elements with view-transition-name
  // (e.g. recipe card images when hovered), causing a "loses shape" glitch when
  // favoriting recipes. Toasts use their own React Stately animations.
  wrapUpdate(fn) {
    flushSync(fn);
  },
});
