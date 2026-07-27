"use client";

import { DirectionalIcon } from "@standard-reader/design-system/directional-icon";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import {
  criticalColor,
  primaryColor,
  successColor,
  uiColor,
  warningColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  Bug,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Info,
  Lightbulb,
  List,
  ListTodo,
  Pencil,
  Quote,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import type { CalloutKind } from "#/lib/markdown/callouts";

const KIND_ICON: Record<CalloutKind, LucideIcon> = {
  note: Pencil,
  abstract: ClipboardList,
  info: Info,
  todo: ListTodo,
  tip: Lightbulb,
  success: Check,
  question: CircleHelp,
  warning: TriangleAlert,
  failure: X,
  danger: Zap,
  bug: Bug,
  example: List,
  quote: Quote,
};

const styles = stylex.create({
  callout: {
    backgroundColor: "var(--callout-surface)",
    borderColor: "var(--callout-border)",
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: radius.md,
    cornerShape: "squircle",
    fontFamily: fontFamily.sans,
    marginBottom: spacing["6"],
    marginTop: spacing["6"],
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    color: "var(--callout-accent)",
    columnGap: spacing["2"],
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: 1.4,
    // Tighter than the top padding: the title should sit close to the body it
    // introduces rather than floating in the middle of the box.
    paddingBottom: spacing["2"],
    paddingInlineStart: spacing["4"],
    paddingInlineEnd: spacing["4"],
    paddingTop: spacing["3"],
  },
  headerButton: {
    backgroundColor: "transparent",
    borderWidth: 0,
    cursor: "pointer",
    textAlign: "start",
    width: "100%",
  },
  icon: {
    color: "var(--callout-accent)",
    flexShrink: 0,
    height: "1.125rem",
    width: "1.125rem",
  },
  title: {
    flexGrow: 1,
    minWidth: 0,
  },
  chevron: {
    flexShrink: 0,
    height: "1.125rem",
    transitionDuration: animationDuration.default,
    transitionProperty: "rotate",
    transitionTimingFunction: "ease",
    width: "1.125rem",
  },
  chevronOpen: {
    rotate: "90deg",
    // Cancel the RTL mirror once open: a rotated-down chevron reads the same
    // in both directions, and mirroring it would point it back up.
    transform: "none",
  },
  body: {
    // No font family: inherit the article's serif so callout prose matches the
    // surrounding body copy.
    color: "var(--callout-body)",
    fontSize: fontSize.base,
    lineHeight: 1.55,
    // Bottom padding mirrors the header's vertical padding so the prose sits
    // evenly inside the box instead of hugging one edge.
    paddingBottom: spacing["3"],
    paddingInlineStart: spacing["4"],
    paddingInlineEnd: spacing["4"],
    // Callout prose reuses the article paragraph style (a full 1.5rem bottom
    // margin), which leaves an oversized, unbalanced gap inside the box. Tighten
    // the gap between stacked blocks and drop the trailing margin so the body
    // padding alone controls the bottom edge.
    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) > p": {
      marginBottom: spacing["3"],
    },
    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) > :last-child": {
      marginBottom: spacing["0"],
    },
  },
});

// Callouts are colored from the reader's own design-system tokens — not raw
// Radix scales — so they inherit the editorial theme (warm-paper `uiColor` and
// camel `primaryColor`) and its light/dark overrides. Informational kinds carry
// the camel accent; only the genuinely stateful kinds reach for the semantic
// success/warning/critical families. That keeps most callouts on-theme (brown),
// with color reserved for the few that mean something.
type CalloutFamily = "primary" | "neutral" | "success" | "warning" | "critical";

const KIND_FAMILY: Record<CalloutKind, CalloutFamily> = {
  note: "primary",
  abstract: "primary",
  info: "primary",
  todo: "primary",
  example: "primary",
  quote: "neutral",
  tip: "success",
  success: "success",
  question: "warning",
  warning: "warning",
  failure: "critical",
  danger: "critical",
  bug: "critical",
};

const familyTheme = stylex.create({
  primary: {
    "--callout-surface": primaryColor.bgSubtle,
    "--callout-border": primaryColor.border1,
    "--callout-accent": primaryColor.text1,
    "--callout-body": primaryColor.text2,
  },
  neutral: {
    "--callout-surface": uiColor.bgSubtle,
    "--callout-border": uiColor.border1,
    "--callout-accent": uiColor.text1,
    "--callout-body": uiColor.text2,
  },
  success: {
    "--callout-surface": successColor.bgSubtle,
    "--callout-border": successColor.border1,
    "--callout-accent": successColor.text1,
    "--callout-body": successColor.text2,
  },
  warning: {
    "--callout-surface": warningColor.bgSubtle,
    "--callout-border": warningColor.border1,
    "--callout-accent": warningColor.text1,
    "--callout-body": warningColor.text2,
  },
  critical: {
    "--callout-surface": criticalColor.bgSubtle,
    "--callout-border": criticalColor.border1,
    "--callout-accent": criticalColor.text1,
    "--callout-body": criticalColor.text2,
  },
});

export function Callout({
  kind,
  title,
  fold,
  children,
}: {
  kind: CalloutKind;
  title: string;
  /** `"open"`/`"closed"` makes the callout collapsible; omit for a static one. */
  fold?: "open" | "closed";
  children: ReactNode;
}) {
  const Icon = KIND_ICON[kind];
  const bodyId = useId();
  const collapsible = fold !== undefined;
  const [open, setOpen] = useState(fold !== "closed");

  const headerInner = (
    <>
      <Icon aria-hidden {...stylex.props(styles.icon)} />
      <span {...stylex.props(styles.title)}>{title}</span>
      {collapsible ? (
        <DirectionalIcon
          as={ChevronRight}
          style={[styles.chevron, open && styles.chevronOpen]}
        />
      ) : null}
    </>
  );

  return (
    <div {...stylex.props(styles.callout, familyTheme[KIND_FAMILY[kind]])}>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
          {...stylex.props(styles.header, styles.headerButton)}
        >
          {headerInner}
        </button>
      ) : (
        <div {...stylex.props(styles.header)}>{headerInner}</div>
      )}
      {(!collapsible || open) && (
        <div id={bodyId} {...stylex.props(styles.body)}>
          {children}
        </div>
      )}
    </div>
  );
}
