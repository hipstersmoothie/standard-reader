"use client";

import { Trans } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import { useFormatters } from "#/lib/use-formatters";

import { ArticleRow } from "./cards";
import { documentLinkParams } from "./format";

export interface ReaderQueueRowItem {
  id: string;
  documentUri: string;
  article: ArticleCard | null;
  timestamp: string | null;
  /** Past-tense verb prefix, e.g. "Saved", "Recommended", "Read". */
  actionLabel: string;
}

const styles = stylex.create({
  unavailableRow: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["6"],
    paddingTop: spacing["6"],
  },
  unavailableTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
  },
  unavailableMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  bidiIsolate: {
    unicodeBidi: "isolate",
  },
});

export function ReaderQueueRows({
  items,
  showSaveButton = true,
  saveButtonPlacement = "header",
  showMarkUnreadButton = false,
  assumeBookmarked,
  flushFirstRow = true,
}: {
  items: Array<ReaderQueueRowItem>;
  showSaveButton?: boolean;
  saveButtonPlacement?: "header" | "besideMedia";
  /** Show a "mark as unread" control per row (reading-history list). */
  showMarkUnreadButton?: boolean;
  /** Skip per-row bookmark status fetches when rendering the save queue. */
  assumeBookmarked?: boolean;
  /**
   * Whether the first row hugs the top, with no padding above it. True for a
   * list that sits directly under a section head. Pass `false` when the list
   * carries its own rule above the first row (`/saved`, under its toolbar), so
   * the row breathes under that rule the same way every other row breathes
   * under the one above it.
   */
  flushFirstRow?: boolean;
}) {
  const fmt = useFormatters();

  return items.map((item, index) => {
    if (item.article) {
      return (
        <ArticleRow
          key={item.id}
          article={item.article}
          isFirstInSection={flushFirstRow && index === 0}
          showSaveButton={showSaveButton}
          saveButtonPlacement={saveButtonPlacement}
          showMarkUnreadButton={showMarkUnreadButton}
          assumeBookmarked={assumeBookmarked}
        />
      );
    }

    const link = documentLinkParams(item.documentUri);
    const when = item.timestamp
      ? `${item.actionLabel} ${fmt.relativeTime(item.timestamp)}`
      : item.actionLabel;

    return (
      <div key={item.id} {...stylex.props(styles.unavailableRow)}>
        <Flex direction="column" gap="sm">
          <span {...stylex.props(styles.unavailableTitle)}>
            <Trans>Article unavailable</Trans>
          </span>
          <span {...stylex.props(styles.unavailableMeta)}>
            {/* Dates are numeric runs; isolate so they can't reorder against
                the RTL label that follows the separator. */}
            <span {...stylex.props(styles.bidiIsolate)}>{when}</span>
            {link ? (
              <>
                {" · "}
                <Link
                  to="/a/$did/$rkey"
                  params={link}
                  {...stylex.props(styles.unavailableMeta)}
                >
                  <Trans>View record</Trans>
                </Link>
              </>
            ) : null}
          </span>
        </Flex>
      </div>
    );
  });
}
