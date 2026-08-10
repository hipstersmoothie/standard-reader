"use client";

import { Button } from "@standard-reader/design-system/button";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { ui } from "@standard-reader/design-system/theme/semantic-color.stylex";
import { shadow } from "@standard-reader/design-system/theme/shadow.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontSize,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { syncPushDevice } from "./push";
import type { UpdateServiceWorker } from "./register";
import { registerServiceWorker } from "./register";
import { isStandalone } from "./standalone";

const styles = stylex.create({
  toast: {
    borderRadius: radius["lg"],
    gap: spacing["4"],
    paddingBlock: spacing["3"],
    paddingInline: spacing["4"],
    alignItems: "center",
    boxShadow: shadow["lg"],
    display: "flex",
    insetBlockEnd: `max(${spacing["4"]}, env(safe-area-inset-bottom))`,
    insetInlineStart: "50%",
    maxInlineSize: "calc(100vw - 2rem)",
    position: "fixed",
    transform: "translateX(-50%)",
    zIndex: 1000,
  },
  message: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
  },
});

/**
 * Registers the service worker on mount and — **only in the installed app** —
 * renders a small toast when a new version is waiting. Renders nothing until
 * then, so it is SSR-safe. Mounted once from the root document.
 *
 * The toast is deliberately not shown on the website. A browser tab already has
 * a reload button and gets the new version on the next visit anyway once the
 * waiting worker takes over; interrupting someone mid-article to tell them so is
 * noise. An installed app has no address bar, so there it is the only way to say
 * an update is ready.
 *
 * Registration still happens either way — the worker is what provides offline
 * support and receives pushes, on the website as much as in the app.
 */
export function ReloadPrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [installed, setInstalled] = useState(false);
  const updateRef = useRef<UpdateServiceWorker | null>(null);

  useEffect(() => {
    // Client-only: reading display mode during SSR would be a hydration
    // mismatch, and it can change between visits (the reader installs the app).
    setInstalled(isStandalone());
    updateRef.current = registerServiceWorker({
      onNeedRefresh: () => setNeedRefresh(true),
    });
    // Repair a rotated push endpoint. Chrome announces rotation via
    // `pushsubscriptionchange` (handled in `public/push-sw.js`), but Safari
    // never fires that event, so without a check on load a rotated subscription
    // silently stops receiving anything. No-ops when the reader hasn't enabled
    // notifications.
    void syncPushDevice();
  }, []);

  if (!needRefresh || !installed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      {...stylex.props(ui.bg, ui.border, ui.text, styles.toast)}
    >
      <span {...stylex.props(styles.message)}>A new version is available.</span>
      <Button
        size="sm"
        variant="primary"
        onPress={() => updateRef.current?.(true)}
      >
        Reload
      </Button>
    </div>
  );
}
