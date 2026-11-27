"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTitle,
} from "@standard-reader/design-system/disclosure";
import { Flex } from "@standard-reader/design-system/flex";
import {
  focusColor,
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { ListTree } from "lucide-react";
import { useMemo } from "react";
import { useFocusRing, useHover } from "react-aria";

import type {
  HeadingOutlineEntry,
  TocNode,
} from "#/lib/document/heading-outline";
import {
  MIN_TOC_HEADINGS,
  nestHeadingOutline,
} from "#/lib/document/heading-outline";

const styles = stylex.create({
  root: {
    backgroundColor: uiColor.component1,
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    marginTop: spacing["9"],
  },
  titleLabel: {
    minWidth: 0,
  },
  titleCount: {
    color: uiColor.text1,
    fontWeight: fontWeight.normal,
  },
  titleIcon: {
    color: uiColor.text1,
    flexShrink: 0,
  },
  panelContent: {
    paddingBottom: verticalSpace["xl"],
    paddingInlineEnd: horizontalSpace["xl"],
    paddingInlineStart: horizontalSpace["xs"],
    paddingTop: verticalSpace["none"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    marginBottom: 0,
    marginTop: 0,
    paddingInlineStart: 0,
  },
  nestedList: {
    paddingInlineStart: horizontalSpace["3xl"],
  },
  link: {
    textDecoration: {
      default: "none",
      ":is([data-hovered])": "underline",
    },
    borderRadius: radius.sm,
    color: {
      default: uiColor.text1,
      ":is([data-hovered])": primaryColor.text2,
    },
    display: "block",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
    paddingBottom: verticalSpace["sm"],
    paddingInlineEnd: horizontalSpace["md"],
    paddingInlineStart: horizontalSpace["md"],
    paddingTop: verticalSpace["sm"],
    textUnderlineOffset: "0.2em",
  },
  linkTopLevel: {
    color: {
      default: uiColor.text2,
      ":is([data-hovered])": primaryColor.text2,
    },
  },
});

function prefersReducedMotion(): boolean {
  return (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

/**
 * Jump to a heading inside the reader's own scroller.
 *
 * Handled here instead of by the browser's fragment navigation: that would
 * push a history entry the router then treats as a navigation (re-running its
 * scroll restoration, which on `/a/…` is switched off except for `#hash`
 * locations — see `router-scroll.ts`). `scrollIntoView` scrolls whichever
 * ancestor actually scrolls (`[data-app-scroller]`), and the heading's
 * `scroll-margin-top` keeps it clear of the sticky chrome. The hash is
 * *replaced* in place, keeping the router's history state, so the section is
 * shareable and a hard reload lands on it without adding a Back step.
 */
function jumpToHeading(id: string): boolean {
  // Slug ids are letters, digits and hyphens only, so they're safe to quote.
  const target = document.querySelector<HTMLElement>(`[id="${id}"]`);
  if (!target) return false;

  target.scrollIntoView({
    behavior: prefersReducedMotion() ? "instant" : "smooth",
    block: "start",
  });
  // Move focus with the reader so the next Tab continues from the section,
  // not from the table of contents.
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });

  const url = new URL(globalThis.location.href);
  url.hash = id;
  globalThis.history.replaceState(globalThis.history.state, "", url);
  return true;
}

function TocLink({
  entry,
  topLevel,
}: {
  entry: HeadingOutlineEntry;
  topLevel: boolean;
}) {
  const { hoverProps, isHovered } = useHover({});
  const { focusProps, isFocusVisible } = useFocusRing();

  return (
    // A plain anchor (as the design system's TableOfContents uses): react-aria's
    // Link would hand the `#hash` to the router.
    <a
      href={`#${entry.id}`}
      data-hovered={isHovered || undefined}
      data-focus-visible={isFocusVisible || undefined}
      {...hoverProps}
      {...focusProps}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        if (jumpToHeading(entry.id)) event.preventDefault();
      }}
      {...stylex.props(styles.link, topLevel && styles.linkTopLevel)}
    >
      {entry.text}
    </a>
  );
}

function TocList({
  nodes,
  nested = false,
}: {
  nodes: ReadonlyArray<TocNode>;
  nested?: boolean;
}) {
  return (
    <ol {...stylex.props(styles.list, nested && styles.nestedList)}>
      {nodes.map((node) => (
        <li key={node.entry.id}>
          <TocLink entry={node.entry} topLevel={!nested} />
          {node.children.length > 0 ? (
            <TocList nodes={node.children} nested />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * The article's table of contents: a disclosure above the body listing its
 * headings. **Collapsed by default** — heading text can give away a plot, and a
 * long outline shouldn't shove the opening paragraph off the first screen.
 * Renders nothing below {@link MIN_TOC_HEADINGS} headings.
 *
 * Sits outside the quote-share root (so it never shifts the body's text
 * offsets) and carries `data-reader-skip` so narration's word alignment ignores
 * it.
 */
export function ArticleTableOfContents({
  outline,
}: {
  outline: ReadonlyArray<HeadingOutlineEntry>;
}) {
  const { t } = useLingui();
  const nodes = useMemo(() => nestHeadingOutline(outline), [outline]);

  if (outline.length < MIN_TOC_HEADINGS) return null;

  const count = outline.length;

  return (
    <div data-reader-skip {...stylex.props(styles.root)}>
      <Disclosure size="sm">
        <DisclosureTitle>
          <Flex align="center" gap="md" style={styles.titleLabel}>
            <ListTree
              size={16}
              aria-hidden
              {...stylex.props(styles.titleIcon)}
            />
            <span>
              <Trans>Contents</Trans>{" "}
              <span {...stylex.props(styles.titleCount)}>
                <span aria-hidden>·</span>{" "}
                <Plural value={count} one="# section" other="# sections" />
              </span>
            </span>
          </Flex>
        </DisclosureTitle>
        <DisclosurePanel contentStyle={styles.panelContent}>
          {/* Heading text is the author's, in the article's language — same
            `dir="auto"` reasoning as the body (see `ArticleBody`). */}
          <nav aria-label={t`Table of contents`} dir="auto">
            <TocList nodes={nodes} />
          </nav>
        </DisclosurePanel>
      </Disclosure>
    </div>
  );
}
