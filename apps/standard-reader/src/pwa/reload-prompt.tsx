"use client";

import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { Button } from "@standard-reader/design-system/button";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { ui } from "@standard-reader/design-system/theme/semantic-color.stylex";
import { shadow } from "@standard-reader/design-system/theme/shadow.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import type { UpdateServiceWorker } from "./register";
import { registerServiceWorker } from "./register";

const styles = stylex.create({
  toast: {
    position: "fixed",
    insetBlockEnd: `max(${spacing["4"]}, env(safe-area-inset-bottom))`,
    insetInlineStart: "50%",
    transform: "translateX(-50%)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    gap: spacing["4"],
    maxInlineSize: "calc(100vw - 2rem)",
    paddingBlock: spacing["3"],
    paddingInline: spacing["4"],
    borderRadius: radius["lg"],
    boxShadow: shadow["lg"],
  },
  message: {
    fontSize: "0.9375rem",
    lineHeight: 1.35,
  },
});

/**
 * Registers the service worker on mount and renders a small toast when a new
 * version is waiting. Renders nothing until then, so it is SSR-safe. Mounted
 * once from the root document.
 */
export function ReloadPrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<UpdateServiceWorker | null>(null);

  useEffect(() => {
    updateRef.current = registerServiceWorker({
      onNeedRefresh: () => setNeedRefresh(true),
    });
  }, []);

  if (!needRefresh) return null;

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
