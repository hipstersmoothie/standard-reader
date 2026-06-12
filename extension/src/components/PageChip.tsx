import * as stylex from "@stylexjs/stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import {
  gap as gapToken,
  horizontalSpace,
  size,
} from "#/design-system/theme/semantic-spacing.stylex";
import { shadow } from "#/design-system/theme/shadow.stylex";
import {
  animationDuration,
  animationTimingFunction,
} from "#/design-system/theme/animations.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "#/design-system/theme/typography.stylex";
import { ArrowRight, Bookmark, Check, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatDisplayHandle } from "#/utils/saved-handles";
import { ArticleEngagement } from "#/components/reader/primitives";

import type { ExtensionResolveResult } from "../lib/types";
import { pageChipThemeVars } from "../lib/page-chip-theme";
import { sendMessage } from "../lib/messaging";
import { ExtensionTheme } from "./ExtensionTheme";

const chipIn = stylex.keyframes({
  from: {
    opacity: 0,
    transform: "translateY(10px)",
  },
  to: {
    opacity: 1,
    transform: "translateY(0)",
  },
});

const chipExpandMs = "280ms";
const chipExpandCurve = "cubic-bezier(0.3, 0.8, 0.3, 1)";

const styles = stylex.create({
  wrap: {
    bottom: spacing["5"],
    boxSizing: "border-box",
    position: "fixed",
    right: spacing["5"],
    zIndex: 2_147_483_646,
  },
  chip: {
    alignItems: "center",
    animationDuration: animationDuration.verySlow,
    animationFillMode: "both",
    animationName: chipIn,
    animationTimingFunction: "cubic-bezier(0.2, 0.9, 0.3, 1)",
    backgroundColor: "var(--chip-bg)",
    borderColor: "var(--chip-line)",
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: shadow.lg,
    boxSizing: "border-box",
    color: "var(--chip-fg)",
    display: "flex",
    fontFamily: fontFamily.sans,
    gap: gapToken.none,
    overflow: "hidden",
    "@media (prefers-reduced-motion: reduce)": {
      animationDuration: "0ms",
      animationName: "none",
    },
  },
  chipCollapsed: {
    alignItems: "center",
    height: spacing["12"],
    justifyContent: "center",
    maxWidth: spacing["12"],
    paddingBlock: spacing["0"],
    paddingInline: spacing["0"],
    width: spacing["12"],
  },
  chipExpanded: {
    maxWidth: "calc(100vw - 2.75rem)",
    paddingBlock: spacing["2"],
    paddingLeft: spacing["2"],
    paddingRight: spacing["3"],
    transitionDuration: chipExpandMs,
    transitionProperty: "width",
    transitionTimingFunction: chipExpandCurve,
    width: "max-content",
    "@media (prefers-reduced-motion: reduce)": {
      transitionDuration: "0ms",
    },
  },
  measure: {
    boxSizing: "border-box",
    left: spacing["0"],
    pointerEvents: "none",
    position: "absolute",
    top: spacing["0"],
    visibility: "hidden",
    width: "max-content",
  },
  mark: {
    alignItems: "center",
    backgroundColor: "var(--chip-accent)",
    borderRadius: radius.full,
    boxSizing: "border-box",
    color: "var(--chip-accent-fg)",
    display: "flex",
    flexShrink: 0,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    fontWeight: fontWeight.semibold,
    height: size["3xl"],
    justifyContent: "center",
    lineHeight: lineHeight.none,
    width: size["3xl"],
  },
  body: {
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    flexShrink: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  bodyCollapsed: {
    maxWidth: spacing["0"],
    opacity: 0,
    paddingLeft: spacing["0"],
    pointerEvents: "none",
    transitionDuration: chipExpandMs,
    transitionProperty: "max-width, opacity, padding-left",
    transitionTimingFunction: chipExpandCurve,
    "@media (prefers-reduced-motion: reduce)": {
      transitionDuration: "0ms",
    },
  },
  bodyExpanded: {
    gap: gapToken.sm,
    maxWidth: "none",
    opacity: 1,
    paddingLeft: spacing["3"],
    paddingRight: spacing["0"],
    pointerEvents: "auto",
    transitionDuration: chipExpandMs,
    transitionProperty: "opacity, padding-left",
    transitionTimingFunction: chipExpandCurve,
    width: "max-content",
    "@media (prefers-reduced-motion: reduce)": {
      transitionDuration: "0ms",
    },
  },
  text: {
    boxSizing: "border-box",
    flexShrink: 1,
    maxWidth: spacing["56"],
    minWidth: 0,
    paddingRight: horizontalSpace.md,
  },
  kicker: {
    color: "var(--chip-accent)",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0.5"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  title: {
    color: "var(--chip-fg)",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  engagement: {
    alignItems: "center",
    display: "flex",
    flexWrap: "nowrap",
    gap: gapToken.md,
    marginTop: spacing["0.5"],
    minWidth: 0,
    overflow: "hidden",
  },
  handle: {
    color: "var(--chip-muted)",
    flexShrink: 1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaDot: {
    color: "var(--chip-muted)",
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
  action: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: radius.full,
    borderStyle: "none",
    boxSizing: "border-box",
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    gap: gapToken.sm,
    paddingBlock: spacing["2"],
    paddingInline: horizontalSpace.lg,
    transitionDuration: animationDuration.default,
    transitionProperty: "background-color, color",
    transitionTimingFunction: animationTimingFunction.easeOut,
    whiteSpace: "nowrap",
  },
  actionSave: {
    backgroundColor: "var(--chip-accent)",
    color: "var(--chip-accent-fg)",
    ":hover": {
      opacity: 0.9,
    },
  },
  actionSaveActive: {
    backgroundColor: "var(--chip-accent-subtle)",
    color: "var(--chip-accent-subtle-fg)",
    ":hover": {
      opacity: 0.9,
    },
  },
  actionOpen: {
    color: "var(--chip-muted)",
    ":hover": {
      backgroundColor: "var(--chip-hover-bg)",
      color: "var(--chip-hover-fg)",
    },
  },
  dismiss: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: radius.full,
    borderStyle: "none",
    boxSizing: "border-box",
    color: "var(--chip-muted)",
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    minHeight: size["3xl"],
    minWidth: size["3xl"],
    padding: spacing["2"],
    transitionDuration: animationDuration.default,
    transitionProperty: "background-color, color",
    transitionTimingFunction: animationTimingFunction.easeOut,
    ":hover": {
      backgroundColor: "var(--chip-hover-bg)",
      color: "var(--chip-hover-fg)",
    },
  },
});

type PageChipProps = {
  result: ExtensionResolveResult;
  onDismiss: () => void;
  onRefresh: () => void;
};

export function PageChip({
  result: resultProp,
  onDismiss,
  onRefresh,
}: PageChipProps) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [widthAnimating, setWidthAnimating] = useState(false);
  const [pinnedWidth, setPinnedWidth] = useState<number | null>(null);
  const [result, setResult] = useState(resultProp);
  const chipRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setResult(resultProp);
  }, [resultProp]);

  const prefersReducedMotion =
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const expandChip = useCallback(() => {
    if (expanded) return;

    const fromWidth = chipRef.current?.offsetWidth;
    const toWidth = measureRef.current?.offsetWidth;

    if (
      prefersReducedMotion ||
      fromWidth == null ||
      toWidth == null ||
      fromWidth >= toWidth
    ) {
      setExpanded(true);
      return;
    }

    setWidthAnimating(true);
    setPinnedWidth(fromWidth);
    setExpanded(true);
    requestAnimationFrame(() => {
      setPinnedWidth(toWidth);
    });
  }, [expanded, prefersReducedMotion]);

  const collapseChip = useCallback(() => {
    setWidthAnimating(false);
    setPinnedWidth(null);
    setExpanded(false);
  }, []);

  const handleChipTransitionEnd = (
    event: React.TransitionEvent<HTMLDivElement>,
  ) => {
    if (
      event.propertyName !== "width" ||
      event.target !== event.currentTarget
    ) {
      return;
    }
    setWidthAnimating(false);
    setPinnedWidth(null);
  };

  if (result.kind !== "article" && result.kind !== "publication") {
    return null;
  }

  const isArticle = result.kind === "article";
  const kicker = isArticle
    ? (result.publicationName ?? "Publication")
    : result.name;
  const title = isArticle
    ? result.title
    : (formatDisplayHandle(result.handle) ?? "");

  const saved = isArticle ? result.isBookmarked : result.isFollowing;

  const chipThemeStyle = useMemo(
    () =>
      pageChipThemeVars({
        themeBackground: result.themeBackground,
        themeForeground: result.themeForeground,
        themeAccent: result.themeAccent,
        themeAccentForeground: result.themeAccentForeground,
      }),
    [result],
  );

  const toggleSave = async () => {
    if (result.kind !== "article" && result.kind !== "publication") return;

    const previous = result;
    setBusy(true);
    try {
      if (result.kind === "article") {
        const nextSaved = !result.isBookmarked;
        setResult({ ...result, isBookmarked: nextSaved });
        await sendMessage({
          type: "bookmark",
          documentUri: result.documentUri,
          save: nextSaved,
        });
      } else {
        const nextFollowing = !result.isFollowing;
        setResult({ ...result, isFollowing: nextFollowing });
        await sendMessage({
          type: "follow",
          publicationUri: result.publicationUri,
          follow: nextFollowing,
        });
      }
      onRefresh();
    } catch {
      setResult(previous);
    } finally {
      setBusy(false);
    }
  };

  const openReader = async () => {
    await sendMessage({ type: "openReader", url: result.readerUrl });
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      collapseChip();
    }
  };

  const chipText = (
    <>
      <div {...stylex.props(styles.kicker)}>{kicker}</div>
      {title ? <div {...stylex.props(styles.title)}>{title}</div> : null}
      {isArticle &&
      (result.authorHandle ||
        result.recommendCount > 0 ||
        result.commentCount > 0) ? (
        <div {...stylex.props(styles.engagement)}>
          {result.authorHandle ? (
            <span {...stylex.props(styles.handle)}>@{result.authorHandle}</span>
          ) : null}
          {result.authorHandle &&
          (result.recommendCount > 0 || result.commentCount > 0) ? (
            <span {...stylex.props(styles.metaDot)} aria-hidden>
              ·
            </span>
          ) : null}
          <ArticleEngagement
            recommendCount={result.recommendCount}
            commentCount={result.commentCount}
            size="xs"
          />
        </div>
      ) : null}
    </>
  );

  return (
    <ExtensionTheme variant="page">
      <div {...stylex.props(styles.wrap)}>
        <div
          ref={chipRef}
          {...stylex.props(
            styles.chip,
            expanded ? styles.chipExpanded : styles.chipCollapsed,
          )}
          style={{
            ...chipThemeStyle,
            ...(widthAnimating && pinnedWidth != null
              ? { width: pinnedWidth, maxWidth: "calc(100vw - 2.75rem)" }
              : expanded
                ? { maxWidth: "calc(100vw - 2.75rem)" }
                : null),
          }}
          tabIndex={0}
          aria-label="Standard Reader"
          aria-expanded={expanded}
          onTransitionEnd={handleChipTransitionEnd}
          onMouseEnter={() => {
            expandChip();
          }}
          onMouseLeave={() => {
            collapseChip();
          }}
          onFocus={() => {
            expandChip();
          }}
          onBlur={handleBlur}
        >
          <div {...stylex.props(styles.mark)} aria-hidden>
            S
          </div>
          <div
            {...stylex.props(
              styles.body,
              expanded ? styles.bodyExpanded : styles.bodyCollapsed,
            )}
          >
            <div {...stylex.props(styles.text)}>{chipText}</div>
            <button
              type="button"
              {...stylex.props(
                styles.action,
                saved ? styles.actionSaveActive : styles.actionSave,
              )}
              disabled={busy}
              onClick={() => {
                void toggleSave();
              }}
            >
              {isArticle ? (
                saved ? (
                  <>
                    <Bookmark size={12} fill="currentColor" />
                    Saved
                  </>
                ) : (
                  <>
                    <Bookmark size={12} />
                    Save
                  </>
                )
              ) : saved ? (
                <>
                  <Check size={12} strokeWidth={2.4} />
                  Subscribed
                </>
              ) : (
                <>
                  <Plus size={12} strokeWidth={2.4} />
                  Subscribe
                </>
              )}
            </button>
            <button
              type="button"
              {...stylex.props(styles.action, styles.actionOpen)}
              disabled={busy}
              onClick={() => {
                void openReader();
              }}
            >
              Open
              <ArrowRight size={11} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              {...stylex.props(styles.dismiss)}
              title="Hide on this site"
              aria-label="Hide on this site"
              onClick={onDismiss}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div
          ref={measureRef}
          aria-hidden
          {...stylex.props(styles.measure, styles.chip, styles.chipExpanded)}
          style={chipThemeStyle}
        >
          <div {...stylex.props(styles.mark)}>S</div>
          <div {...stylex.props(styles.body, styles.bodyExpanded)}>
            <div {...stylex.props(styles.text)}>{chipText}</div>
            <button
              type="button"
              {...stylex.props(
                styles.action,
                saved ? styles.actionSaveActive : styles.actionSave,
              )}
            >
              {isArticle ? (
                saved ? (
                  <>
                    <Bookmark size={12} fill="currentColor" />
                    Saved
                  </>
                ) : (
                  <>
                    <Bookmark size={12} />
                    Save
                  </>
                )
              ) : saved ? (
                <>
                  <Check size={12} strokeWidth={2.4} />
                  Subscribed
                </>
              ) : (
                <>
                  <Plus size={12} strokeWidth={2.4} />
                  Subscribe
                </>
              )}
            </button>
            <button
              type="button"
              {...stylex.props(styles.action, styles.actionOpen)}
            >
              Open
              <ArrowRight size={11} strokeWidth={2.2} />
            </button>
            <button type="button" {...stylex.props(styles.dismiss)}>
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </ExtensionTheme>
  );
}
