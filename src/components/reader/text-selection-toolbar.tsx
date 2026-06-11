"use client";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

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
import { toasts } from "#/design-system/toast";
import { Toolbar, ToolbarGroup } from "#/design-system/toolbar";
import { quoteShareApi } from "#/integrations/tanstack-query/api-quote-share.functions";
import { usePageReader } from "#/lib/page-reader/page-reader-context";
import { buildQuoteShareUrl, normalizeQuoteText } from "#/lib/quote-share";
import { Link as LinkIcon, Play, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { LinkShareMenu } from "./link-share-menu";

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
    borderRadius: radius.sm,
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
  article,
  documentUri,
  did,
  rkey,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  article: ArticleDetail;
  documentUri: string;
  did: string;
  rkey: string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(false);
  const isSelectingRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null,
  );
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const { playFromSelection } = usePageReader();

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
      setShareUrl(null);
      setShareMenuOpen(false);
      return;
    }

    let cancelled = false;
    void quoteShareApi
      .createQuoteShare({ data: { documentUri, quote: toolbar.text } })
      .then(({ id }) => {
        if (cancelled) return;
        setShareUrl(buildQuoteShareUrl(did, rkey, id));
      })
      .catch(() => {
        if (!cancelled) setShareUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [did, documentUri, rkey, toolbar]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onPointerDown = (event: Event) => {
      if (eventTargetsToolbar(event, anchorRef.current)) return;
      isSelectingRef.current = true;
      hideToolbar();
    };

    const onPointerUp = (event: Event) => {
      if (!isSelectingRef.current) return;
      isSelectingRef.current = false;
      if (eventTargetsToolbar(event, anchorRef.current)) return;
      scheduleSyncToolbarToSelection();
    };

    const onSelectionChange = () => {
      if (isSelectingRef.current) {
        hideToolbar();
        return;
      }
      scheduleSyncToolbarToSelection();
    };

    const onScroll = () => {
      if (isSelectingRef.current) return;
      hideToolbar();
      globalThis.getSelection()?.removeAllRanges();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hideToolbar();
    };

    root.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("mouseup", onPointerUp);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    document.addEventListener("keydown", onKeyDown);

    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("mouseup", onPointerUp);
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
      if (shareMenuOpen) return;
      if (eventTargetsToolbar(event, anchorRef.current)) return;
      hideToolbar();
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [hideToolbar, shareMenuOpen, toolbar]);

  const onCopyLinkPress = useCallback(() => {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl).then(() => {
      toasts.add(
        {
          title: "Link copied",
          variant: "success",
        },
        {
          timeout: 2000,
        },
      );
    });
  }, [shareUrl]);

  const dismissAfterShare = useCallback(() => {
    hideToolbar();
    globalThis.getSelection()?.removeAllRanges();
  }, [hideToolbar]);

  const onPlayPress = useCallback(() => {
    if (!toolbar) return;
    playFromSelection(article, toolbar.text);
    hideToolbar();
    globalThis.getSelection()?.removeAllRanges();
  }, [article, hideToolbar, playFromSelection, toolbar]);

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
        <ToolbarGroup aria-label="Listen">
          <IconButton
            variant="tertiary"
            size="lg"
            label="Read from here"
            onPress={onPlayPress}
          >
            <Play size={18} />
          </IconButton>
        </ToolbarGroup>
        <ToolbarGroup aria-label="Share">
          <IconButton
            variant="tertiary"
            size="lg"
            label="Copy link"
            isDisabled={!shareUrl}
            onPress={onCopyLinkPress}
          >
            <LinkIcon size={18} />
          </IconButton>
          <LinkShareMenu
            getLinkUrl={() => shareUrl}
            isOpen={shareMenuOpen}
            onOpenChange={setShareMenuOpen}
            onShare={dismissAfterShare}
            trigger={
              <IconButton
                variant="tertiary"
                size="lg"
                label="Share"
                isDisabled={!shareUrl}
              >
                <Share2 size={18} />
              </IconButton>
            }
          />
        </ToolbarGroup>
      </Toolbar>
    </div>,
    document.body,
  );
}
