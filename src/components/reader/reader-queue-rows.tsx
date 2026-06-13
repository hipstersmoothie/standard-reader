"use client";

import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";

import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Flex } from "#/design-system/flex";
import { uiColor } from "#/design-system/theme/color.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "#/design-system/theme/typography.stylex";

import { ArticleRow } from "./cards";
import { documentLinkParams, formatRelativeTime } from "./format";

export interface ReaderQueueRowItem {
  id: string;
  documentUri: string;
  article: ArticleCard | null;
  timestamp: string | null;
  /** Past-tense verb prefix, e.g. "Saved", "Liked", "Read". */
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
});

export function ReaderQueueRows({
  items,
  showSaveButton = true,
  saveButtonPlacement = "header",
  assumeBookmarked,
}: {
  items: Array<ReaderQueueRowItem>;
  showSaveButton?: boolean;
  saveButtonPlacement?: "header" | "besideMedia";
  /** Skip per-row bookmark status fetches when rendering the save queue. */
  assumeBookmarked?: boolean;
}) {
  return items.map((item, index) => {
    if (item.article) {
      return (
        <ArticleRow
          key={item.id}
          article={item.article}
          isFirstInSection={index === 0}
          showSaveButton={showSaveButton}
          saveButtonPlacement={saveButtonPlacement}
          assumeBookmarked={assumeBookmarked}
        />
      );
    }

    const link = documentLinkParams(item.documentUri);
    const when = item.timestamp
      ? `${item.actionLabel} ${formatRelativeTime(item.timestamp)}`
      : item.actionLabel;

    return (
      <div key={item.id} {...stylex.props(styles.unavailableRow)}>
        <Flex direction="column" gap="sm">
          <span {...stylex.props(styles.unavailableTitle)}>
            Article unavailable
          </span>
          <span {...stylex.props(styles.unavailableMeta)}>
            {when}
            {link ? (
              <>
                {" · "}
                <Link
                  to="/a/$did/$rkey"
                  params={link}
                  {...stylex.props(styles.unavailableMeta)}
                >
                  View record
                </Link>
              </>
            ) : null}
          </span>
        </Flex>
      </div>
    );
  });
}
