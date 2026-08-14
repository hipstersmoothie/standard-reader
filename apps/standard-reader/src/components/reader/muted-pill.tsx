"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@standard-reader/design-system/badge";
import { Button } from "@standard-reader/design-system/button";
import { HoverCard } from "@standard-reader/design-system/hover-card";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { toasts } from "@standard-reader/design-system/toast";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { VolumeX } from "lucide-react";

import { mutesApi } from "#/integrations/tanstack-query/api-mutes.functions";

import type { MuteSubjectKind } from "./mute-menu-item";
import { Kicker } from "./primitives";

/**
 * A "Muted" pill on the author / publication header, in the same visual
 * register as a labeler label ({@link LabelerPill}) — because that's what it
 * is: a statement about this account, sitting after the account's own words.
 * The difference is who's speaking: a label comes from a labeler, this comes
 * from the reader themself, so instead of linking to a labeler's page the
 * hover card carries the undo.
 *
 * Muting leaves the page fully readable (that's the point — feeds and
 * discovery only), so without this pill a muted profile looks identical to an
 * unmuted one and the mute state is invisible until a feed is missing
 * something. The pill is that feedback.
 *
 * Renders nothing for guests, unmuted subjects, or while the state query is in
 * flight — a pill that pops in late is better than a layout that reserves
 * space for a state that's almost always absent.
 */
export function MutedPill({
  subject,
  kind,
  signedIn,
}: {
  /** A user DID or a publication AT-URI — the mute record's subject. */
  subject: string;
  kind: MuteSubjectKind;
  signedIn: boolean;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    ...mutesApi.getMuteStateQueryOptions(subject),
    enabled: signedIn,
  });

  const unmute = useMutation({
    mutationFn: async () => mutesApi.unmuteSubject({ data: { subject } }),
    onSuccess: () => {
      toasts.add({
        description:
          kind === "publication"
            ? t`This publication will show up in your feeds again.`
            : t`They'll show up in your feeds again.`,
        title: t`Unmuted`,
      });
      // A mute changes every feed and discovery surface — no narrower key.
      void queryClient.invalidateQueries();
    },
    onError: () => {
      toasts.add({
        description: t`We couldn't remove the mute from your account. Try again?`,
        title: t`Something went wrong`,
      });
    },
  });

  if (!signedIn || !data?.muted) return null;

  return (
    <div {...stylex.props(styles.row)}>
      <HoverCard
        placement="top"
        trigger={
          <Badge variant="default" size="sm" style={styles.pill}>
            <VolumeX size={12} aria-hidden />
            <Trans>Muted</Trans>
          </Badge>
        }
      >
        <div {...stylex.props(styles.card)}>
          <div {...stylex.props(styles.meta)}>
            <Kicker muted>
              <Trans>Muted by you</Trans>
            </Kicker>
            <span {...stylex.props(styles.title)}>
              {kind === "publication" ? (
                <Trans>This publication is muted</Trans>
              ) : (
                <Trans>This person is muted</Trans>
              )}
            </span>
          </div>
          <p {...stylex.props(styles.desc)}>
            {kind === "publication" ? (
              <Trans>
                Its articles are hidden from your feeds, search and discovery.
                Your subscription is untouched, and this page still works.
              </Trans>
            ) : (
              <Trans>
                Their articles, publications and recommendations are hidden from
                your feeds, search and discovery. Your subscriptions are
                untouched, and this page still works.
              </Trans>
            )}
          </p>
          <div {...stylex.props(styles.foot)}>
            <Link to="/settings/muted" {...stylex.props(styles.manage)}>
              <Trans>Manage mutes</Trans>
            </Link>
            <Button
              variant="secondary"
              size="sm"
              isPending={unmute.isPending}
              onPress={() => unmute.mutate()}
            >
              <Trans>Unmute</Trans>
            </Button>
          </div>
        </div>
      </HoverCard>
    </div>
  );
}

const styles = stylex.create({
  row: {
    alignItems: "center",
    display: "flex",
  },
  pill: {
    // A leading icon wants less space before it than a bare word does —
    // matches `LabelerPill`'s avatar treatment.
    paddingInlineStart: horizontalSpace.sm,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.md,
    width: "20rem",
  },
  meta: {
    display: "flex",
    flexDirection: "column",
    rowGap: verticalSpace.sm,
    minWidth: 0,
  },
  title: {
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  desc: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBottom: 0,
    marginTop: 0,
  },
  foot: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    marginInlineEnd: `calc(-1 * ${horizontalSpace.md})`,
    // Full-bleed footer, matching `LabelerPill`: the popover content pads with
    // `horizontalSpace.md`, so negate it so the divider spans edge to edge.
    marginInlineStart: `calc(-1 * ${horizontalSpace.md})`,
    paddingInlineEnd: horizontalSpace.md,
    paddingInlineStart: horizontalSpace.md,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingTop: verticalSpace.sm,
  },
  manage: {
    borderRadius: radius.sm,
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    textDecoration: "none",
    textTransform: "uppercase",
  },
});
