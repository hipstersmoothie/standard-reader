"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Play, Share2, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@standard-reader/design-system/button";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { MenuItem, MenuSeparator } from "@standard-reader/design-system/menu";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { shadow } from "@standard-reader/design-system/theme/shadow.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { toasts } from "@standard-reader/design-system/toast";
import { Toolbar, ToolbarGroup } from "@standard-reader/design-system/toolbar";
import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import { quoteShareApi } from "#/integrations/tanstack-query/api-quote-share.functions";
import { usePageReader } from "#/lib/page-reader/page-reader-context";
import { buildQuoteShareUrl, normalizeQuoteText } from "#/lib/quote-share";
import {
  clearSelectionRetentionHighlight,
  setSelectionRetentionHighlight,
} from "#/lib/selection-retention-highlight";
import { useCompactNav } from "#/lib/use-media-query";

import { primaryAuthor } from "./format";
import { LinkShareMenu } from "./link-share-menu";
import { SaveToCollectionDialog } from "./save-to-collection-dialog";
import { useSelectionDock } from "./selection-dock-context";

const MIN_SELECTION_LENGTH = 3;
const SYNC_SELECTION_DELAY_MS = 0;
/** Breathing room kept between the docked bar and the screen edges. */
const DOCK_EDGE_GUTTER_PX = 16;

const styles = stylex.create({
  anchor: {
    insetInlineStart: 0,
    position: "fixed",
    transform: "translate(-50%, calc(-100% - 12px))",
    zIndex: 1000,
    top: 0,
  },
  shell: {
    borderColor: uiColor.border2,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.bg,
    boxShadow: shadow.lg,
    paddingInlineEnd: horizontalSpace.xs,
    paddingInlineStart: horizontalSpace.xs,
    transitionDuration: animationDuration.fast,
    transitionProperty: "opacity, transform",
    transitionTimingFunction: "ease-out",
    paddingBottom: verticalSpace.xs,
    paddingTop: verticalSpace.xs,
  },
  shellVisible: {
    opacity: 1,
    transform: "scale(1)",
  },
  // Docked variant: fills the bottom-nav slot the shell hands over, so it never
  // competes with the OS selection callout hovering over the selection itself.
  dockedAnchor: {
    display: "flex",
    justifyContent: "center",
    pointerEvents: "auto",
  },
  // Deliberately mirrors the nav pill (`fabBar` in app-shell) so the swap reads
  // as the same control changing modes rather than a new surface appearing.
  dockedShell: {
    borderColor: uiColor.border1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: uiColor.bg,
    boxShadow:
      "0 1px 1px oklch(0.3 0.03 60 / 0.04), 0 6px 18px -8px oklch(0.3 0.04 60 / 0.18), 0 14px 34px -18px oklch(0.3 0.05 60 / 0.22)",
    columnGap: gap.xxs,
    flexWrap: "nowrap",
    paddingInlineEnd: spacing["1.5"],
    paddingInlineStart: spacing["1.5"],
    rowGap: gap.xxs,
    paddingBottom: spacing["1.5"],
    paddingTop: spacing["1.5"],
  },
  // Round, not the default squircle, and sized to the nav's `bottomItem`
  // height so the docked bar is exactly as tall as the pill it replaces
  // (`size="lg"` is 2.75rem, a quarter-rem short).
  dockedButton: {
    borderRadius: radius.full,
    // Buttons default to a squircle, but the pill around them is a true
    // stadium — at this radius the two curves visibly disagree. Match the
    // container.
    cornerShape: "normal",
    // Keyed on `[data-size=lg]` to match how IconButton declares its own
    // height/width, so this override can't lose on specificity.
    height: { default: spacing["12"], ":is([data-size=lg])": spacing["12"] },
    width: { default: spacing["12"], ":is([data-size=lg])": spacing["12"] },
  },
  // Labelled docked item: an auto-width pill rather than a circle, holding the
  // same nav-item height so a labelled bar is still exactly as tall as the pill
  // it replaces.
  dockedLabelButton: {
    borderRadius: radius.full,
    cornerShape: "normal",
    paddingInlineEnd: horizontalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    height: { default: spacing["12"], ":is([data-size=lg])": spacing["12"] },
  },
  // Mirrors the bottom nav's `bottomLabel` type so the swap reads as the same
  // control changing modes rather than a different surface appearing. No accent
  // colour: nothing here is "current", and the accent stays rare by design.
  dockedLabel: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.wide,
    whiteSpace: "nowrap",
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

function eventTargets(event: Event, anchor: HTMLElement | null): boolean {
  if (!anchor) return false;
  const path = event.composedPath();
  return path.includes(anchor);
}

/**
 * One toolbar action, labelled or not.
 *
 * Docked on touch the icon carries a visible label, because there's no hover
 * there to reveal a tooltip. Everywhere else — the desktop toolbar floating by
 * the selection, or a docked bar too narrow for this locale's strings — it stays
 * the icon button it has always been, explained on hover by IconButton's own
 * tooltip. `accessibleName` must contain the visible label so voice control can
 * address the control by what the user can see (WCAG 2.5.3).
 */
function ToolbarAction({
  icon,
  label,
  accessibleName,
  showLabel,
  style,
  isDisabled,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  accessibleName: string;
  showLabel: boolean;
  style?: stylex.StyleXStyles;
  isDisabled?: boolean;
  onPress?: () => void;
}) {
  if (!showLabel) {
    return (
      <IconButton
        variant="tertiary"
        size="lg"
        label={accessibleName}
        style={style}
        isDisabled={isDisabled}
        onPress={onPress}
      >
        {icon}
      </IconButton>
    );
  }

  return (
    <Button
      variant="tertiary"
      size="lg"
      aria-label={accessibleName}
      style={style}
      isDisabled={isDisabled}
      onPress={onPress}
    >
      {icon}
      <span {...stylex.props(styles.dockedLabel)}>{label}</span>
    </Button>
  );
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
  const { i18n, t } = useLingui();
  const anchorRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(false);
  const isSelectingRef = useRef(false);
  // Docked, tapping the toolbar (opening the share menu, copying) moves focus
  // out of the article and the mobile browser clears the OS text selection.
  // This flag marks that clear as toolbar-driven so `selectionchange` doesn't
  // read the now-empty selection as a deselect and hide the toolbar mid-share.
  const suppressDockedHideRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null,
  );
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [dockedLabelsFit, setDockedLabelsFit] = useState(true);
  const [saveDialog, setSaveDialog] = useState<"margin" | "semble" | null>(
    null,
  );
  const { playFromSelection } = usePageReader();

  // On compact widths the toolbar moves into the shell's bottom-nav slot; the
  // OS selection callout owns the space around the selection itself.
  const compact = useCompactNav();
  const dock = useSelectionDock();
  const isDocked = compact && dock !== null;

  const setDockActive = dock?.setActive;
  useEffect(() => {
    if (!setDockActive) return;
    setDockActive(isDocked && toolbar !== null);
    return () => setDockActive(false);
  }, [isDocked, setDockActive, toolbar]);

  const hideToolbar = useCallback(() => {
    pinnedRef.current = false;
    suppressDockedHideRef.current = false;
    clearSelectionRetentionHighlight();
    setShareMenuOpen(false);
    setToolbar(null);
  }, []);

  const openToolbar = useCallback(
    (range: Range, text: string) => {
      const { x, y } = toolbarPosition(range);
      pinnedRef.current = true;
      // Docked/touch: paint the stand-in highlight straight away and leave it up
      // for as long as the toolbar is, so it never depends on catching the tap
      // that dismissed the OS selection. Snapshot the range first — the live one
      // moves with the selection. Not docked, drop any highlight left over from
      // a previous compact layout.
      if (isDocked) {
        setSelectionRetentionHighlight(range.cloneRange());
      } else {
        clearSelectionRetentionHighlight();
      }
      setToolbar({ text, x, y });
    },
    [isDocked],
  );

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

  // Clear the share URL when the selection changes so a fresh one is created
  // only on the next explicit share action (not automatically on selection).
  useEffect(() => {
    setShareUrl(null);
  }, [toolbar]);

  const ensureShareUrl = useCallback(async (): Promise<string | null> => {
    if (!toolbar) return null;
    if (shareUrl) return shareUrl;
    try {
      const { id } = await quoteShareApi.createQuoteShare({
        data: { documentUri, quote: toolbar.text },
      });
      const url = buildQuoteShareUrl(did, rkey, id);
      setShareUrl(url);
      return url;
    } catch {
      toasts.add(
        {
          title: t`Couldn't create share link`,
          variant: "critical",
        },
        { timeout: 3000 },
      );
      return null;
    }
  }, [did, documentUri, rkey, shareUrl, t, toolbar]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onPointerDown = (event: Event) => {
      if (eventTargets(event, anchorRef.current)) return;
      isSelectingRef.current = true;
      // The docked toolbar doesn't track the selection rect, so it can hold its
      // place while the handles are dragged — hiding it would flash the nav
      // back in on every adjustment.
      if (!isDocked) hideToolbar();
    };

    const onPointerUp = (event: Event) => {
      if (!isSelectingRef.current) return;
      isSelectingRef.current = false;
      if (eventTargets(event, anchorRef.current)) return;
      scheduleSyncToolbarToSelection();
    };

    const onSelectionChange = () => {
      if (isSelectingRef.current && !isDocked) {
        hideToolbar();
        return;
      }
      // A toolbar tap (share menu, copy) clears the OS selection as focus
      // leaves the article — don't sync that empty selection into a hide. The
      // flag is lifted again by the next tap outside the toolbar (see the
      // docked pointerdown handler below).
      if (isDocked && suppressDockedHideRef.current) return;
      scheduleSyncToolbarToSelection();
    };

    const onScroll = () => {
      if (isSelectingRef.current) return;
      // Docked, the toolbar is pinned to the viewport and stays valid while
      // scrolling — and touch momentum after a long-press would otherwise
      // destroy the selection the user just made.
      if (isDocked) return;
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
  }, [hideToolbar, isDocked, rootRef, scheduleSyncToolbarToSelection]);

  useEffect(() => {
    if (!toolbar) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!pinnedRef.current) return;
      if (shareMenuOpen) return;
      if (eventTargets(event, anchorRef.current)) {
        // Docked, this tap makes the OS drop its selection as focus moves into
        // the toolbar/menu; flag it so `selectionchange` keeps the toolbar up.
        // The stand-in highlight is already painted (see `openToolbar`).
        if (isDocked) suppressDockedHideRef.current = true;
        return;
      }
      // Any tap outside the toolbar means the user has moved on — resume normal
      // selection tracking so a real deselect can hide the toolbar again, and
      // drop our stand-in highlight so it can't linger behind a new selection.
      suppressDockedHideRef.current = false;
      clearSelectionRetentionHighlight();
      // Docked, a touch inside the article is usually a selection-handle drag;
      // let `selectionchange` decide whether the selection actually went away.
      if (isDocked && eventTargets(event, rootRef.current)) return;
      hideToolbar();
    };

    // Capture phase, and non-negotiably so: react-aria's `usePress` calls
    // `stopPropagation()` on pointer-down, and because React dispatches at the
    // root container that also stops the *native* event before it can reach a
    // bubble-phase listener here. Every tap on a toolbar button would go unseen
    // — no suppression flag, so the selection loss read as a deselect and tore
    // the toolbar (and the share menu inside it) down on first press.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [hideToolbar, isDocked, rootRef, shareMenuOpen, toolbar]);

  // Drop the retained-selection highlight if the toolbar unmounts while shown.
  useEffect(() => () => clearSelectionRetentionHighlight(), []);

  // Labels are the design on touch — there's no hover tooltip there to explain
  // an icon. But a long locale ("Compartir", "Vorlesen") can push the row past
  // a narrow phone, so measure the composed pill against the space the dock
  // gives us and fall back to icon-only when it genuinely doesn't fit. Dropping
  // the labels beats truncating a six-character word. This runs in a layout
  // effect so the fallback lands before paint rather than as a visible reflow.
  useLayoutEffect(() => {
    if (!isDocked || !toolbar || !dockedLabelsFit) return;
    const pill = anchorRef.current?.firstElementChild;
    if (!pill) return;
    // Measure against the viewport, not the anchor: the dock slot is a flex
    // container that stretches to whatever the pill needs, so comparing the two
    // always reports a fit. The docked bar is viewport-bounded by definition.
    const available = globalThis.innerWidth - DOCK_EDGE_GUTTER_PX * 2;
    if (pill.getBoundingClientRect().width > available) {
      setDockedLabelsFit(false);
    }
  }, [dockedLabelsFit, isDocked, toolbar]);

  // Re-test when the available width or the strings change: optimistically put
  // the labels back so the measurement above gets to run against the new size.
  useEffect(() => {
    const restoreLabels = () => setDockedLabelsFit(true);
    globalThis.addEventListener("resize", restoreLabels);
    return () => globalThis.removeEventListener("resize", restoreLabels);
  }, []);

  useEffect(() => {
    setDockedLabelsFit(true);
  }, [i18n.locale]);

  const dismissAfterShare = useCallback(() => {
    hideToolbar();
    globalThis.getSelection()?.removeAllRanges();
  }, [hideToolbar]);

  const [savePassage, setSavePassage] = useState<string | null>(null);

  const openSaveDialog = useCallback(
    (app: "margin" | "semble") => {
      if (!toolbar) return;
      setSavePassage(toolbar.text);
      setSaveDialog(app);
      dismissAfterShare();
    },
    [dismissAfterShare, toolbar],
  );

  // Decoupled from `ensureShareUrl` (which reads live `toolbar` state) since
  // the save dialog stays open — and may complete its OAuth round-trip —
  // after the toolbar (and its selection) has already been dismissed.
  const ensureSaveQuoteShareUrl = useCallback(async (): Promise<
    string | null
  > => {
    if (!savePassage) return null;
    try {
      const { id } = await quoteShareApi.createQuoteShare({
        data: { documentUri, quote: savePassage },
      });
      return buildQuoteShareUrl(did, rkey, id);
    } catch {
      toasts.add(
        { title: t`Couldn't create share link`, variant: "critical" },
        { timeout: 3000 },
      );
      return null;
    }
  }, [did, documentUri, rkey, savePassage, t]);

  const onPlayPress = useCallback(() => {
    if (!toolbar) return;
    playFromSelection(article, toolbar.text);
    hideToolbar();
    globalThis.getSelection()?.removeAllRanges();
  }, [article, hideToolbar, playFromSelection, toolbar]);

  const onDismissPress = useCallback(() => {
    hideToolbar();
    globalThis.getSelection()?.removeAllRanges();
  }, [hideToolbar]);

  // Docked buttons round off and grow to the nav item's height so the pill
  // matches the bar it replaces.
  const buttonStyle = isDocked ? styles.dockedButton : undefined;
  // Labels ride on the docked (touch) bar only, and only when they fit.
  const showDockedLabels = isDocked && dockedLabelsFit;
  // Labelled items trade the circle for an auto-width pill; the dismiss ✕ keeps
  // its circle either way — the glyph is universally read, and leaving it bare
  // keeps the row from getting wordy.
  const actionStyle = showDockedLabels ? styles.dockedLabelButton : buttonStyle;

  const toolbarContent = toolbar ? (
    <Toolbar
      aria-label={t`Text selection actions`}
      style={
        isDocked
          ? [styles.shell, styles.shellVisible, styles.dockedShell]
          : [styles.shell, styles.shellVisible]
      }
    >
      <>
        <ToolbarGroup aria-label={t`Listen`}>
          <ToolbarAction
            icon={<Play size={18} />}
            label={t`Listen`}
            // Contains the visible "Listen" when labelled; keeps the fuller
            // wording as the tooltip when it's an icon on its own.
            accessibleName={
              showDockedLabels ? t`Listen from here` : t`Read from here`
            }
            showLabel={showDockedLabels}
            style={actionStyle}
            onPress={onPlayPress}
          />
        </ToolbarGroup>
        <ToolbarGroup aria-label={t`Share`}>
          <LinkShareMenu
            getLinkUrl={() => shareUrl}
            ensureLinkUrl={ensureShareUrl}
            isOpen={shareMenuOpen}
            onOpenChange={setShareMenuOpen}
            onShare={dismissAfterShare}
            trigger={
              <ToolbarAction
                icon={<Share2 size={18} />}
                label={t`Share`}
                accessibleName={t`Share`}
                showLabel={showDockedLabels}
                style={actionStyle}
              />
            }
          >
            <MenuSeparator />
            <MenuItem
              onPress={() => openSaveDialog("margin")}
              textValue={t`Save to Margin…`}
            >
              <Trans>Save to Margin…</Trans>
            </MenuItem>
            <MenuItem
              onPress={() => openSaveDialog("semble")}
              textValue={t`Save to Semble…`}
            >
              <Trans>Save to Semble…</Trans>
            </MenuItem>
          </LinkShareMenu>
        </ToolbarGroup>
        {isDocked ? (
          <ToolbarGroup aria-label={t`Dismiss`}>
            <IconButton
              variant="tertiary"
              size="lg"
              label={t`Dismiss selection`}
              style={buttonStyle}
              onPress={onDismissPress}
            >
              <X size={18} />
            </IconButton>
          </ToolbarGroup>
        ) : null}
      </>
    </Toolbar>
  ) : null;

  return (
    <>
      {toolbar && toolbarContent && globalThis.document !== undefined
        ? isDocked
          ? // Docked: the shell hands over its bottom-nav slot, which only
            // exists once it has re-rendered in response to `setActive`.
            dock?.slot
            ? createPortal(
                <div ref={anchorRef} {...stylex.props(styles.dockedAnchor)}>
                  {toolbarContent}
                </div>,
                dock.slot,
              )
            : null
          : createPortal(
              <div
                ref={anchorRef}
                {...stylex.props(styles.anchor)}
                style={{ left: toolbar.x, top: toolbar.y }}
              >
                {toolbarContent}
              </div>,
              document.body,
            )
        : null}
      {/* Rendered independent of `toolbar` — the save dialog (and its OAuth
          round-trip) must stay mounted even after the toolbar/selection is
          dismissed. */}
      <SaveToCollectionDialog
        app="margin"
        isOpen={saveDialog === "margin"}
        onOpenChange={(open) => setSaveDialog(open ? "margin" : null)}
        articleTitle={article.title}
        getStandardReaderUrl={() => globalThis.location.href}
        originalUrl={article.canonicalUrl}
        passage={savePassage ?? undefined}
      />
      <SaveToCollectionDialog
        app="semble"
        isOpen={saveDialog === "semble"}
        onOpenChange={(open) => setSaveDialog(open ? "semble" : null)}
        articleTitle={article.title}
        getStandardReaderUrl={() => globalThis.location.href}
        originalUrl={article.canonicalUrl}
        articleDescription={article.description}
        articleAuthor={primaryAuthor(article)}
        articleSiteName={article.publication?.name}
        articleImageUrl={article.coverImageUrl}
        passage={savePassage ?? undefined}
        ensureQuoteShareUrl={ensureSaveQuoteShareUrl}
      />
    </>
  );
}
