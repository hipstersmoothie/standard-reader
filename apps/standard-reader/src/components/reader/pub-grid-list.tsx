import { focusColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { GridList, GridListItem, RouterProvider } from "react-aria-components";

import { parseInternalRoute } from "#/lib/internal-route";

import type { PublicationCard } from "../../integrations/tanstack-query/api-shapes";
import { PubCard, PubDirectoryRow } from "./cards";
import { publicationLinkParams } from "./format";

/**
 * A publication section rendered as a react-aria `GridList`: the whole section
 * is a single tab stop, arrow keys move between publications, and Tab within a
 * focused item reaches its Follow button. Each item is a real, client-routed
 * link (via the react-aria `RouterProvider` bridged to TanStack Router below),
 * so cmd/ctrl-click still opens in a new tab.
 *
 * Deliberately local to the reader (not a design-system primitive) until the
 * pattern proves out across more surfaces.
 */

type Layout = "rail" | "grid" | "list";
type Variant = "card" | "row";

/**
 * Keep a keyboard-focused item within view. react-aria scrolls the item into
 * its nearest scroll parent (a rail's horizontal scroller) but leaves the
 * page's vertical scroller unmoved, so tabbing back up to an off-screen list
 * lands focus somewhere invisible. Scrolling the row itself covers every
 * scroll ancestor (and respects each item's `scroll-margin`). Bound via
 * `onFocusCapture` on a wrapper since GridListItem doesn't type `onFocus`.
 */
function scrollFocusedIntoView(event: React.FocusEvent<HTMLElement>) {
  const row = event.target;
  if (row instanceof HTMLElement && row.getAttribute("role") === "row") {
    row.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

interface PubTarget {
  href: string;
  external: boolean;
}

/** Resolve a publication to a concrete href (client route or external URL). */
function usePubTarget(): (pub: PublicationCard) => PubTarget | null {
  const router = useRouter();
  return useCallback(
    (pub) => {
      const params = publicationLinkParams(pub.uri);
      if (params) {
        return {
          href: router.buildLocation({ to: "/p/$did/$rkey", params }).href,
          external: false,
        };
      }
      const url = pub.url;
      if (!url) return null;
      const internal = parseInternalRoute(url);
      if (internal) {
        const loc = internal.params
          ? router.buildLocation({ to: internal.to, params: internal.params })
          : router.buildLocation({ to: internal.to });
        return { href: loc.href, external: false };
      }
      return { href: url, external: true };
    },
    [router],
  );
}

export function PubGridList({
  pubs,
  layout,
  variant,
  showRank = false,
  "aria-label": ariaLabel,
}: {
  pubs: Array<PublicationCard>;
  layout: Layout;
  variant: Variant;
  /** Number the rows (trending). */
  showRank?: boolean;
  "aria-label": string;
}) {
  const navigate = useNavigate();
  const target = usePubTarget();

  const routerNavigate = useCallback(
    (to: string, options?: { replace?: boolean }) => {
      void navigate({ to, replace: options?.replace });
    },
    [navigate],
  );

  return (
    <RouterProvider navigate={routerNavigate}>
      <div
        {...stylex.props(styles.focusScope)}
        onFocusCapture={scrollFocusedIntoView}
      >
        <GridList
          aria-label={ariaLabel}
          layout={layout === "list" ? "stack" : "grid"}
          selectionMode="none"
          {...stylex.props(
            layout === "rail" && styles.rail,
            layout === "grid" && styles.grid,
            layout === "list" && styles.list,
          )}
        >
          {pubs.map((pub, index) => {
            const t = target(pub);
            return (
              <GridListItem
                key={pub.uri}
                id={pub.uri}
                textValue={pub.name}
                href={t?.href}
                target={t?.external ? "_blank" : undefined}
                rel={t?.external ? "noreferrer" : undefined}
                {...stylex.props(
                  styles.item,
                  variant === "card" ? styles.itemCard : styles.itemRow,
                  layout === "rail" && styles.railItem,
                )}
              >
                {variant === "card" ? (
                  <PubCard pub={pub} rail={layout === "rail"} noLink />
                ) : (
                  <PubDirectoryRow
                    pub={pub}
                    noLink
                    rank={showRank ? index + 1 : undefined}
                    isLast={index === pubs.length - 1}
                  />
                )}
              </GridListItem>
            );
          })}
        </GridList>
      </div>
    </RouterProvider>
  );
}

const styles = stylex.create({
  // Layout-transparent wrapper that only carries the focus listener.
  focusScope: {
    display: "contents",
  },
  rail: {
    scrollSnapType: "x mandatory",
    alignItems: "stretch",
    columnGap: gap.lg,
    display: "grid",
    gridAutoColumns: {
      default: "260px",
      "@media (min-width: 40rem)": "300px",
    },
    gridAutoFlow: "column",
    marginInlineEnd: `calc(${spacing["2"]} * -1)`,
    marginInlineStart: `calc(${spacing["2"]} * -1)`,
    paddingInlineEnd: spacing["2"],
    paddingInlineStart: spacing["2"],
    rowGap: gap.lg,
    // eslint-disable-next-line @stylexjs/valid-styles
    scrollbarWidth: "thin",
    // Horizontal padding gives the first/last cards' focus rings room inside
    // the scroll clip region; the matching negative margins keep the cards
    // aligned with the section (same trick this rail uses vertically).
    marginTop: `calc(${spacing["3"]} * -1)`,
    overflowX: "auto",
    paddingBottom: spacing["2"],
    paddingTop: spacing["3"],
  },
  grid: {
    columnGap: gap.lg,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    rowGap: gap.lg,
  },
  list: {
    display: "flex",
    flexDirection: "column",
  },
  item: {
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    outlineOffset: "2px",
    scrollMarginInlineEnd: spacing["6"],
    scrollMarginInlineStart: spacing["6"],
    scrollMarginBottom: spacing["6"],
    // Breathing room when a focused item is scrolled into view (in the rail's
    // horizontal scroller or the page's vertical scroller) so it never hugs
    // the container edge or hides under the masthead.
    scrollMarginTop: spacing["6"],
  },
  // Match each item's ring radius to the content it wraps: cards are rounded
  // (radius.md), directory rows are near-square.
  itemCard: {
    borderRadius: radius.md,
  },
  itemRow: {
    borderRadius: radius.sm,
  },
  railItem: {
    scrollSnapAlign: "start",
  },
});
