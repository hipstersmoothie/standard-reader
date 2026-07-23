"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { ButtonLink } from "#/components/router-links";
import { subscriptionsApi } from "#/integrations/tanstack-query/api-subscriptions.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import {
  listsQueryOptions,
  sidebarQueryOptions,
} from "#/integrations/tanstack-query/shell-queries";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { Masthead, ReaderContent } from "../components/reader/primitives";
import { SubscriptionsTable } from "../components/reader/subscriptions-table";
import { Flex } from "../design-system/flex";
import { uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../design-system/theme/typography.stylex";

/**
 * The subscriptions directory — the sidebar's "Subscriptions" heading made into
 * a page you can actually manage from.
 *
 * The rows themselves cost nothing: the app shell already holds them in the
 * `["feed", "sidebar"]` cache on every route, so navigating here paints from
 * cache. The only query this page adds is per-person publishing stats (see
 * `api-subscriptions.functions.ts`) — awaited on navigation so the table is
 * complete on first paint, prefetched without awaiting on link hover.
 */
export const Route = createFileRoute("/_layout/subscriptions")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/subscriptions") },
      });
    }
  },
  loader: async ({ context, preload }) => {
    const peopleStats =
      subscriptionsApi.getSubscriptionPeopleStatsQueryOptions();
    if (preload) {
      // Link-hover warm-up: fill the cache, never block the hover.
      void context.queryClient.prefetchQuery(peopleStats);
      void context.queryClient.prefetchQuery(listsQueryOptions());
      return;
    }
    await Promise.all([
      context.queryClient.ensureQueryData(peopleStats),
      context.queryClient.ensureQueryData(listsQueryOptions()),
    ]);
  },
  head: () => ({
    meta: pageSocialMeta("subscriptions", getPublicUrlClient()),
  }),
  component: ReaderSubscriptions,
});

const styles = stylex.create({
  emptyCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    marginTop: spacing["6"],
    maxWidth: "100%",
    paddingBottom: spacing["10"],
    paddingInlineStart: spacing["8"],
    paddingInlineEnd: spacing["8"],
    paddingTop: spacing["10"],
    width: "100%",
  },
  emptyInner: {
    minWidth: 0,
    width: "100%",
  },
  emptyTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
  },
  emptyDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    maxWidth: "52ch",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  emptyCode: {
    fontFamily: fontFamily.mono,
    fontSize: "0.88em",
    overflowWrap: "anywhere",
  },
});

function ReaderSubscriptions() {
  const { t } = useLingui();
  const { data: sidebar } = useSuspenseQuery(sidebarQueryOptions());
  const { data: lists } = useQuery(listsQueryOptions());
  const { data: peopleStats } = useQuery(
    subscriptionsApi.getSubscriptionPeopleStatsQueryOptions(),
  );

  const following = sidebar.following;
  const followingUsers = sidebar.followingUsers;
  const total = following.length + followingUsers.length;

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Your library`}
        title={t`Subscriptions`}
        dek={t`Every publication and person you follow. Easily manage them all.`}
        // This page is about what you follow, not what you haven't read —
        // /latest and the sidebar already carry the unread count.
        metaLabel={t`Following`}
        metaValue={String(total)}
      />

      {total === 0 ? (
        <div {...stylex.props(styles.emptyCard)}>
          <Flex
            direction="column"
            gap="lg"
            align="start"
            style={styles.emptyInner}
          >
            <span {...stylex.props(styles.emptyTitle)}>
              <Trans>Nothing to manage yet</Trans>
            </span>
            <p {...stylex.props(styles.emptyDek)}>
              <Trans>
                Subscribe to a publication or follow a writer and they&apos;ll
                show up here, with their unread count and latest post. Each
                subscription is an{" "}
                <code {...stylex.props(styles.emptyCode)}>
                  app.standard-reader.subscription
                </code>{" "}
                record in your repo — yours to take anywhere.
              </Trans>
            </p>
            <ButtonLink to="/discover" variant="secondary" size="lg">
              <Trans>Discover publications</Trans>
            </ButtonLink>
          </Flex>
        </div>
      ) : (
        <SubscriptionsTable
          following={following}
          followingUsers={followingUsers}
          peopleStats={peopleStats}
          lists={lists ?? []}
        />
      )}
    </ReaderContent>
  );
}
