import * as stylex from "@stylexjs/stylex";
import { Check, Plus } from "lucide-react";

import type { PublicationCard } from "#/integrations/tanstack-query/api-shapes";

import { Badge } from "../../design-system/badge";
import { uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../../design-system/theme/typography.stylex";
import { ToggleButton } from "../../design-system/toggle-button";
import { PublicationAvatar } from "../reader/primitives";

const styles = stylex.create({
  row: {
    alignItems: "center",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    // Rows sit inside a bordered container — a divider between rows only, none
    // under the last row, so the row borders don't stack on the container edge.
    borderBottomWidth: { default: 1, ":last-child": 0 },
    borderRadius: 0,
    columnGap: gap.xl,
    display: "flex",
    height: "auto",
    justifyContent: "flex-start",
    paddingBottom: verticalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    paddingInlineEnd: horizontalSpace.xl,
    paddingTop: verticalSpace.xl,
    textAlign: "start",
    width: "100%",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
    rowGap: verticalSpace.xxs,
  },
  titleLine: {
    alignItems: "center",
    columnGap: gap.md,
    display: "flex",
    minWidth: 0,
  },
  name: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  handle: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  description: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginBottom: 0,
    marginTop: 0,
    // The row is a <button>, which sets `white-space: nowrap` — inherited, that
    // pinned descriptions to one unwrappable line that got clipped mid-word.
    // Restore normal wrapping, then cap the block at two lines.
    maxHeight: `calc(2 * ${lineHeight.sm} * ${fontSize.sm})`,
    minWidth: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
    whiteSpace: "normal",
  },
  metaLine: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.md,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  action: {
    alignItems: "center",
    borderColor: uiColor.border2,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    columnGap: gap.xs,
    display: "flex",
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    paddingBottom: verticalSpace.xs,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
    paddingTop: verticalSpace.xs,
  },
});

export function OnboardingPubRow({
  pub,
  trending = false,
  selected,
  onToggle,
}: {
  pub: PublicationCard;
  trending?: boolean;
  selected: boolean;
  onToggle: (next: boolean) => void;
}) {
  const readers =
    pub.subscriberCount > 0
      ? `${formatCount(pub.subscriberCount)} readers`
      : pub.documentCount > 0
        ? `${formatCount(pub.documentCount)} articles`
        : null;

  return (
    <ToggleButton
      variant="tertiary"
      isSelected={selected}
      onChange={onToggle}
      aria-label={`${selected ? "Unsubscribe from" : "Subscribe to"} ${pub.name}`}
      style={styles.row}
    >
      <PublicationAvatar pub={pub} size="lg" />
      <span {...stylex.props(styles.body)}>
        <span {...stylex.props(styles.titleLine)}>
          <span dir="auto" {...stylex.props(styles.name)}>
            {pub.name}
          </span>
          {trending ? <Badge variant="primary">Trending</Badge> : null}
        </span>
        {pub.ownerHandle ? (
          <span dir="auto" {...stylex.props(styles.handle)}>
            @{pub.ownerHandle}
          </span>
        ) : null}
        {pub.description ? (
          <p dir="auto" {...stylex.props(styles.description)}>
            {pub.description}
          </p>
        ) : null}
        {pub.topic || readers ? (
          <span {...stylex.props(styles.metaLine)}>
            {pub.topic ? <span>{pub.topic}</span> : null}
            {pub.topic && readers ? <span aria-hidden>·</span> : null}
            {readers ? <span>{readers}</span> : null}
          </span>
        ) : null}
      </span>
      <span {...stylex.props(styles.action)}>
        {selected ? <Check size={13} /> : <Plus size={13} />}
        {selected ? "Subscribed" : "Subscribe"}
      </span>
    </ToggleButton>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}
