"use client";

import { flushSync } from "react-dom";

export const LIGHTBOX_IMAGE_TRANSITION_NAME = "lightbox-active-image";

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function startLightboxViewTransition(update: () => void) {
  const documentWithTransition = document as Document & {
    startViewTransition?: Document["startViewTransition"];
  };
  if (
    prefersReducedMotion() ||
    typeof documentWithTransition.startViewTransition !== "function"
  ) {
    flushSync(update);
    return;
  }

  const root = document.documentElement;
  root.dataset.lightboxViewTransition = "opening";

  const transition = documentWithTransition.startViewTransition(() => {
    flushSync(update);
  });

  void transition.finished.finally(() => {
    delete root.dataset.lightboxViewTransition;
  });
}
