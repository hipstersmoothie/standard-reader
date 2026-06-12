import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { PopupStateResponse } from "../../lib/popup-state";

import { PopupShell } from "../../components/PopupShell";
import { loadInitialPopupState } from "../../lib/popup-load-state";

const initialStatePromise = loadInitialPopupState();

if (!import.meta.env.DEV) {
  // Production popup.html already links the compiled StyleX stylesheet.
  void import("../../load-stylex-styles");
}

let initialState: PopupStateResponse | null = null;
let initialError: string | null = null;

try {
  initialState = await initialStatePromise;
} catch (error) {
  initialError = error instanceof Error ? error.message : "Failed to load";
}

const root = document.querySelector("#root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PopupShell initialState={initialState} initialError={initialError} />
    </StrictMode>,
  );
}
