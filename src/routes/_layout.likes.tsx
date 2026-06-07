"use client";

import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { Bookmark } from "lucide-react";

import { ArticleRow } from "../components/reader/cards";
import {
  documentLinkParams,
  formatRelativeTime,
} from "../components/reader/format";
import {
  Handle,
  Masthead,
  ReaderContent,
  SectionHead,
} from "../components/reader/primitives";
import { Avatar } from "../design-system/avatar";
import { Button } from "../design-system/button";
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

export const Route = createFileRoute("/_layout/likes")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({ to: "/login", search: { redirect: "/likes" } });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(readerApi.getLikesQueryOptions());
  },
  head: () => ({
    meta: [{ title: "Saved articles · Standard Reader" }],
  }),
  component: ReaderLikes,
});

const styles = stylex.create({
  profile: {
    alignItems: "center",
    columnGap: spacing["4"],
    display: "flex",
    rowGap: spacing["4"],
    marginBottom: spacing["8"],
  },
  profileName: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  emptyCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    marginTop: spacing["6"],
    maxWidth: "100%",
    paddingBottom: spacing["10"],
    paddingLeft: spacing["8"],
    paddingRight: spacing["8"],
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
    overflowWrap: "anywhere",
    maxWidth: "52ch",
    minWidth: 0,
  },
  emptyCode: {
    fontFamily: fontFamily.mono,
    fontSize: "0.88em",
    overflowWrap: "anywhere",
  },
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

function ReaderLikes() {
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const { data: likes } = useSuspenseQuery(readerApi.getLikesQueryOptions());
  const userName = session?.user.name ?? "Reader";
  const userHandle = session?.user.handle;
  const initial = userName.charAt(0).toUpperCase();

  return (
    <ReaderContent>
      <Masthead
        kicker="Your profile"
        kickerIcon={<Bookmark size={14} aria-hidden />}
        title="Saved articles"
        dek="Articles you've liked across the network."
        metaLabel="Saved"
        metaValue={String(likes.length)}
      />

      <div {...stylex.props(styles.profile)}>
        <Avatar
          size="xl"
          src={session?.user.image ?? undefined}
          fallback={initial}
          alt={userName}
        />
        <Flex direction="column" gap="xs">
          <p {...stylex.props(styles.profileName)}>{userName}</p>
          {userHandle ? <Handle>@{userHandle}</Handle> : null}
        </Flex>
      </div>

      {likes.length === 0 ? (
        <div {...stylex.props(styles.emptyCard)}>
          <Flex
            direction="column"
            gap="lg"
            align="start"
            style={styles.emptyInner}
          >
            <span {...stylex.props(styles.emptyTitle)}>Nothing saved yet</span>
            <p {...stylex.props(styles.emptyDek)}>
              Tap the bookmark on any article to save it here. Your likes live
              in your repo as{" "}
              <code {...stylex.props(styles.emptyCode)}>
                site.standard.graph.recommend
              </code>{" "}
              records.
            </p>
            <Link to="/">
              <Button variant="secondary" size="lg">
                Browse your feed
              </Button>
            </Link>
          </Flex>
        </div>
      ) : (
        <>
          <SectionHead kicker="Likes" title="Recently saved" />
          {likes.map((item, index) => {
            if (item.article) {
              return (
                <ArticleRow
                  key={item.recommendUri}
                  article={item.article}
                  isFirstInSection={index === 0}
                />
              );
            }

            const link = documentLinkParams(item.documentUri);
            return (
              <div
                key={item.recommendUri}
                {...stylex.props(styles.unavailableRow)}
              >
                <Flex direction="column" gap="sm">
                  <span {...stylex.props(styles.unavailableTitle)}>
                    Article unavailable
                  </span>
                  <span {...stylex.props(styles.unavailableMeta)}>
                    {item.likedAt
                      ? `Saved ${formatRelativeTime(item.likedAt)}`
                      : "Saved"}
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
          })}
        </>
      )}
    </ReaderContent>
  );
}
