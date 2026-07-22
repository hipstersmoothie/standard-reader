import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

import { PopupShell } from "../../components/PopupShell";
import { loadInitialPopupState } from "../../lib/popup-load-state";
import type { PopupStateResponse } from "../../lib/popup-state";

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

// Minimal Lingui instance for the popup. Shared reader components pulled in via
// the `#`/`@` aliases (e.g. SeekTrack → useLingui) require an I18nProvider or
// `useLingui()` throws. The popup is English-only; with no catalogs loaded the
// missing-message fallback returns the macro-embedded source string, which is
// English, so `t`Seek`` renders "Seek" correctly without pulling the .po files
// (those would need @lingui/vite-plugin's `lingui()` to compile).
const i18n = setupI18n({ locale: "en" });

const root = document.querySelector("#root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <PopupShell initialState={initialState} initialError={initialError} />
      </I18nProvider>
    </StrictMode>,
  );
}
