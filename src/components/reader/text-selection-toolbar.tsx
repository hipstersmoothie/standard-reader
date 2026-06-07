"use client";

import * as stylex from "@stylexjs/stylex";
import { IconButton } from "#/design-system/icon-button";
import { animationDuration } from "#/design-system/theme/animations.stylex";
import { uiColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { shadow } from "#/design-system/theme/shadow.stylex";
import { Toolbar, ToolbarGroup } from "#/design-system/toolbar";
import { quoteShareApi } from "#/integrations/tanstack-query/api-quote-share.functions";
import {
  buildBlueskyComposeUrl,
  buildQuoteShareUrl,
  normalizeQuoteText,
} from "#/lib/quote-share";
import { Quote } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MIN_SELECTION_LENGTH = 3;
const SYNC_SELECTION_DELAY_MS = 0;

const styles = stylex.create({
  anchor: {
    position: "fixed",
    transform: "translate(-50%, calc(-100% - 12px))",
    zIndex: 1000,
    left: 0,
    top: 0,
  },
  shell: {
    borderColor: uiColor.border2,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.bg,
    boxShadow: shadow.lg,
    transitionDuration: animationDuration.fast,
    transitionProperty: "opacity, transform",
    transitionTimingFunction: "ease-out",
    paddingBottom: verticalSpace.xs,
    paddingLeft: horizontalSpace.xs,
    paddingRight: horizontalSpace.xs,
    paddingTop: verticalSpace.xs,
  },
  shellVisible: {
    opacity: 1,
    transform: "scale(1)",
  },
});

interface ToolbarState {
  text: string;
  x: number;
  y: number;
}

function selectionWithinRoot(
  selection: Selection,
  root: HTMLElement,
): Range | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const text = normalizeQuoteText(selection.toString());
  if (text.length < MIN_SELECTION_LENGTH) return null;
  return range;
}

function toolbarPosition(range: Range): { x: number; y: number } {
  const rect = range.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top,
  };
}

function eventTargetsToolbar(
  event: Event,
  anchor: HTMLElement | null,
): boolean {
  if (!anchor) return false;
  const path = event.composedPath();
  return path.includes(anchor);
}

export function TextSelectionToolbar({
  rootRef,
  documentUri,
  did,
  rkey,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  documentUri: string;
  did: string;
  rkey: string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null,
  );
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [composeHref, setComposeHref] = useState<string | null>(null);

  const hideToolbar = useCallback(() => {
    pinnedRef.current = false;
    setToolbar(null);
  }, []);

  const openToolbar = useCallback((range: Range, text: string) => {
    const { x, y } = toolbarPosition(range);
    pinnedRef.current = true;
    setToolbar({ text, x, y });
  }, []);

  const syncToolbarToSelection = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const selection = globalThis.getSelection();
    if (!selection) {
      hideToolbar();
      return;
    }

    const range = selectionWithinRoot(selection, root);
    if (!range) {
      hideToolbar();
      return;
    }

    const text = normalizeQuoteText(range.toString());
    if (!text) {
      hideToolbar();
      return;
    }

    openToolbar(range, text);
  }, [hideToolbar, openToolbar, rootRef]);

  const scheduleSyncToolbarToSelection = useCallback(() => {
    if (syncTimerRef.current !== null) {
      globalThis.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = globalThis.setTimeout(() => {
      syncTimerRef.current = null;
      syncToolbarToSelection();
    }, SYNC_SELECTION_DELAY_MS);
  }, [syncToolbarToSelection]);

  useEffect(() => {
    if (!toolbar) {
      setComposeHref(null);
      return;
    }

    let cancelled = false;
    void quoteShareApi
      .createQuoteShare({ data: { documentUri, quote: toolbar.text } })
      .then(({ id }) => {
        if (cancelled) return;
        const shareUrl = buildQuoteShareUrl(did, rkey, id);
        // Prefill only the app link so Bluesky picks up our OG card; no quote in the body.
        setComposeHref(buildBlueskyComposeUrl(shareUrl));
      })
      .catch(() => {
        if (!cancelled) setComposeHref(null);
      });

    return () => {
      cancelled = true;
    };
  }, [did, documentUri, rkey, toolbar]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onPointerUp = (event: Event) => {
      if (eventTargetsToolbar(event, anchorRef.current)) return;
      scheduleSyncToolbarToSelection();
    };

    const onSelectionChange = () => {
      scheduleSyncToolbarToSelection();
    };

    const onScroll = () => {
      const selection = globalThis.getSelection();
      if (selection && selectionWithinRoot(selection, root)) return;
      hideToolbar();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hideToolbar();
    };

    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("mouseup", onPointerUp);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    document.addEventListener("keydown", onKeyDown);

    return () => {
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("mouseup", onPointerUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("keydown", onKeyDown);
      if (syncTimerRef.current !== null) {
        globalThis.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [hideToolbar, rootRef, scheduleSyncToolbarToSelection]);

  useEffect(() => {
    if (!toolbar) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!pinnedRef.current) return;
      if (eventTargetsToolbar(event, anchorRef.current)) return;
      hideToolbar();
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [hideToolbar, toolbar]);

  const onSharePress = useCallback(() => {
    if (!composeHref) return;
    globalThis.open(composeHref, "_blank", "noopener,noreferrer");
    hideToolbar();
    globalThis.getSelection()?.removeAllRanges();
  }, [composeHref, hideToolbar]);

  if (!toolbar || globalThis.document === undefined) return null;

  return createPortal(
    <div
      ref={anchorRef}
      {...stylex.props(styles.anchor)}
      style={{ left: toolbar.x, top: toolbar.y }}
    >
      <Toolbar
        aria-label="Text selection actions"
        style={[styles.shell, styles.shellVisible]}
      >
        <ToolbarGroup aria-label="Share">
          <IconButton
            variant="tertiary"
            size="lg"
            aria-label="Share on Bluesky"
            isDisabled={!composeHref}
            onPress={onSharePress}
          >
            <Quote size={18} />
          </IconButton>
        </ToolbarGroup>
      </Toolbar>
    </div>,
    document.body,
  );
}
