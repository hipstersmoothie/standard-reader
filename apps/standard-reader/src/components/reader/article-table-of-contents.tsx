"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { Popover } from "@standard-reader/design-system/popover";
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
import { useEffect, useMemo, useRef, useState } from "react";
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
  popover: {
    boxSizing: "border-box",
    maxWidth: "100%",
    paddingBottom: verticalSpace["md"],
    paddingInlineEnd: horizontalSpace["md"],
    paddingInlineStart: horizontalSpace["md"],
    paddingTop: verticalSpace["xl"],
    width: spacing["80"],
  },
  heading: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    paddingInlineEnd: horizontalSpace["md"],
    paddingInlineStart: horizontalSpace["md"],
  },
  headingCount: {
    color: uiColor.text1,
    fontWeight: fontWeight.normal,
  },
  scroll: {
    overflowY: "auto",
    overscrollBehavior: "contain",
    // Off the spacing scale on purpose: this caps a scroll box against the
    // viewport so a long outline scrolls inside the popover, not the page.
    maxHeight: "min(28rem, 60dvh)",
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
    textDecoration: "none",
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered])": uiColor.component2,
    },
    borderRadius: radius.md,
    color: uiColor.text1,
    display: "block",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
    paddingBottom: verticalSpace["md"],
    paddingInlineEnd: horizontalSpace["md"],
    paddingInlineStart: horizontalSpace["md"],
    paddingTop: verticalSpace["md"],
  },
  linkTopLevel: {
    color: uiColor.text2,
  },
  linkCurrent: {
    backgroundColor: {
      default: primaryColor.component1,
      ":is([data-hovered])": primaryColor.component2,
    },
    color: primaryColor.text2,
    fontWeight: fontWeight.medium,
  },
});

function prefersReducedMotion(): boolean {
  return (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

function headingElement(id: string): HTMLElement | null {
  // Slug ids are letters, digits and hyphens only, so they're safe to quote.
  return document.querySelector<HTMLElement>(`[id="${id}"]`);
}

/**
 * The section being read: the last heading whose top has passed a line a
 * quarter of the way down the viewport (below the sticky chrome). Measured once,
 * when the popover opens — the list isn't on screen any other time, so there is
 * nothing to keep in sync while scrolling.
 */
function currentHeadingId(
  outline: ReadonlyArray<HeadingOutlineEntry>,
): string | null {
  const line = globalThis.innerHeight * 0.25;
  let current: string | null = null;
  for (const entry of outline) {
    const element = headingElement(entry.id);
    if (!element) continue;
    if (element.getBoundingClientRect().top > line) break;
    current = entry.id;
  }
  return current;
}

/**
 * Scroll to a heading inside the reader's own scroller.
 *
 * Handled here instead of by the browser's fragment navigation: that would
 * push a history entry the router then treats as a navigation (re-running its
 * scroll restoration, which on `/a/…` is switched off except for `#hash`
 * locations — see `router-scroll.ts`). `scrollIntoView` scrolls whichever
 * ancestor actually scrolls, and the heading's `scroll-margin-top` keeps it
 * clear of the sticky chrome. The hash is *replaced* in place, keeping the
 * router's history state, so the section is shareable and a hard reload lands
 * on it without adding a Back step.
 */
function scrollToHeading(id: string): boolean {
  const target = headingElement(id);
  if (!target) return false;

  target.scrollIntoView({
    behavior: prefersReducedMotion() ? "instant" : "smooth",
    block: "start",
  });

  const url = new URL(globalThis.location.href);
  url.hash = id;
  globalThis.history.replaceState(globalThis.history.state, "", url);
  return true;
}

/** Move focus to the heading so the next Tab continues from the section. */
function focusHeading(id: string) {
  const target = headingElement(id);
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

function TocLink({
  entry,
  topLevel,
  current,
  onJump,
}: {
  entry: HeadingOutlineEntry;
  topLevel: boolean;
  current: boolean;
  onJump: (id: string) => void;
}) {
  const { hoverProps, isHovered } = useHover({});
  const { focusProps, isFocusVisible } = useFocusRing();

  return (
    // A plain anchor (as the design system's TableOfContents uses): react-aria's
    // Link would hand the `#hash` to the router.
    <a
      href={`#${entry.id}`}
      aria-current={current ? "location" : undefined}
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
        if (!scrollToHeading(entry.id)) return;
        event.preventDefault();
        onJump(entry.id);
      }}
      {...stylex.props(
        styles.link,
        topLevel && styles.linkTopLevel,
        current && styles.linkCurrent,
      )}
    >
      {entry.text}
    </a>
  );
}

function TocList({
  nodes,
  currentId,
  onJump,
  nested = false,
}: {
  nodes: ReadonlyArray<TocNode>;
  currentId: string | null;
  onJump: (id: string) => void;
  nested?: boolean;
}) {
  return (
    <ol {...stylex.props(styles.list, nested && styles.nestedList)}>
      {nodes.map((node) => (
        <li key={node.entry.id}>
          <TocLink
            entry={node.entry}
            topLevel={!nested}
            current={node.entry.id === currentId}
            onJump={onJump}
          />
          {node.children.length > 0 ? (
            <TocList
              nodes={node.children}
              currentId={currentId}
              onJump={onJump}
              nested
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * The list inside the open popover. It unmounts together with the popover's
 * focus scope, so a pending jump hands focus to the heading from here — any
 * earlier and react-aria's restore-focus pulls it back onto the trigger.
 */
function TocPanel({
  outline,
  onJump,
}: {
  outline: ReadonlyArray<HeadingOutlineEntry>;
  onJump: () => void;
}) {
  const { t } = useLingui();
  const nodes = useMemo(() => nestHeadingOutline(outline), [outline]);
  const [currentId] = useState(() => currentHeadingId(outline));
  const navRef = useRef<HTMLElement>(null);
  const jumpedTo = useRef<string | null>(null);
  const count = outline.length;

  useEffect(() => {
    // In a long outline, open with the current section in view.
    navRef.current
      ?.querySelector('[aria-current="location"]')
      ?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(
    () => () => {
      const id = jumpedTo.current;
      if (!id) return;
      // React-aria restores focus to the trigger in a frame of its own; land
      // after it.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          focusHeading(id);
        });
      });
    },
    [],
  );

  return (
    <Flex direction="column" gap="lg">
      <div {...stylex.props(styles.heading)}>
        <Trans>Contents</Trans>{" "}
        <span {...stylex.props(styles.headingCount)}>
          <span aria-hidden>·</span>{" "}
          <Plural value={count} one="# section" other="# sections" />
        </span>
      </div>
      {/* Heading text is the author's, in the article's language — same
          `dir="auto"` reasoning as the body (see `ArticleBody`). */}
      <nav
        ref={navRef}
        aria-label={t`Table of contents`}
        dir="auto"
        {...stylex.props(styles.scroll)}
      >
        <TocList
          nodes={nodes}
          currentId={currentId}
          onJump={(id) => {
            jumpedTo.current = id;
            onJump();
          }}
        />
      </nav>
    </Flex>
  );
}

/**
 * The article's table of contents: a button in the sticky top bar that opens
 * the heading outline in a popover. Kept out of the article body, and closed
 * until asked for — heading text can give a plot away. Renders nothing below
 * {@link MIN_TOC_HEADINGS} headings.
 */
export function ArticleTableOfContentsButton({
  outline,
}: {
  outline: ReadonlyArray<HeadingOutlineEntry>;
}) {
  const { t } = useLingui();
  const [isOpen, setOpen] = useState(false);

  if (outline.length < MIN_TOC_HEADINGS) return null;

  return (
    <Popover
      placement="bottom end"
      style={styles.popover}
      isOpen={isOpen}
      onOpenChange={setOpen}
      trigger={
        <IconButton
          variant="secondary"
          size="md"
          label={t`Contents`}
          // `label` only feeds the tooltip, so name the button explicitly for
          // assistive tech and touch users.
          aria-label={t`Contents`}
        >
          <ListTree size={18} />
        </IconButton>
      }
    >
      <TocPanel outline={outline} onJump={() => setOpen(false)} />
    </Popover>
  );
}
