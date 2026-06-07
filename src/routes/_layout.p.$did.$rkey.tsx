import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { ExternalLink } from "lucide-react";

import {
  ArticleRow,
  FeatureArticle,
  FollowButton,
} from "../components/reader/cards";
import {
  formatReaders,
  publicationUriFromParams,
} from "../components/reader/format";
import {
  Handle,
  Kicker,
  PublicationAvatar,
  ReaderContent,
  SectionHead,
} from "../components/reader/primitives";
import { Flex } from "../design-system/flex";
import { IconButton } from "../design-system/icon-button";
import { uiColor } from "../design-system/theme/color.stylex";
import { size as boxSize } from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../design-system/theme/typography.stylex";

export const Route = createFileRoute("/_layout/p/$did/$rkey")({
  loader: async ({ context, params }) => {
    const uri = publicationUriFromParams(params.did, params.rkey);
    const profile = await context.queryClient.ensureQueryData(
      publicationApi.getPublicationProfileQueryOptions(uri),
    );
    await context.queryClient.ensureQueryData(
      readerApi.getFollowStatusQueryOptions(uri),
    );
    if (profile?.recentDocuments.length) {
      await context.queryClient.ensureQueryData(
        readerApi.getReadDocumentsQueryOptions(
          profile.recentDocuments.map((doc) => doc.uri),
        ),
      );
    }
  },
  component: PublicationProfile,
});

const styles = stylex.create({
  hero: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  heroInner: {
    alignItems: "flex-start",
    boxSizing: "border-box",
    columnGap: spacing["5"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["4"],
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "1320px",
    paddingBottom: "1.6rem",
    paddingLeft: { default: "1.25rem", "@media (min-width: 40rem)": "2.5rem" },
    paddingRight: { default: "1.25rem", "@media (min-width: 40rem)": "2.5rem" },
    paddingTop: spacing["6"],
    width: "100%",
  },
  avRing: {
    flexShrink: 0,
  },
  avatar: {
    height: boxSize["6xl"],
    width: boxSize["6xl"],
  },
  heroInfo: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: "240px",
    paddingTop: spacing["0.5"],
  },
  heroName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: { default: "1.85rem", "@media (min-width: 48rem)": "2rem" },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.xs,
    marginBottom: spacing["0"],
    marginTop: spacing["2"],
  },
  heroDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["2"],
    maxWidth: "60ch",
  },
  handleLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textUnderlineOffset: "2px",
  },
  stats: {
    alignItems: "baseline",
    color: uiColor.text1,
    columnGap: spacing["6"],
    display: "flex",
    flexWrap: "wrap",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    rowGap: spacing["2"],
    marginTop: spacing["4"],
  },
  statValue: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginRight: spacing["1"],
  },
  heroActs: {
    alignItems: "center",
    columnGap: spacing["1.5"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    rowGap: spacing["2.5"],
    paddingTop: spacing["1"],
  },
  writing: {
    marginTop: spacing["8"],
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    textAlign: "center",
    paddingBottom: spacing["8"],
    paddingTop: spacing["8"],
  },
});

function lastActive(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span>
      <span {...stylex.props(styles.statValue)}>{value}</span>
      {label}
    </span>
  );
}

function PublicationProfile() {
  const { did, rkey } = Route.useParams();
  const uri = publicationUriFromParams(did, rkey);
  const { data: profile } = useSuspenseQuery(
    publicationApi.getPublicationProfileQueryOptions(uri),
  );
  const { data: follow } = useSuspenseQuery(
    readerApi.getFollowStatusQueryOptions(uri),
  );
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const documentUris = profile?.recentDocuments.map((doc) => doc.uri) ?? [];
  const { data: readUris } = useSuspenseQuery(
    readerApi.getReadDocumentsQueryOptions(documentUris),
  );
  const readSet = new Set(readUris);
  const isUnread = (documentUri: string) =>
    signedIn && !readSet.has(documentUri);

  if (!profile) {
    return (
      <ReaderContent>
        <div {...stylex.props(styles.emptyNote)}>
          We couldn’t find that publication.
        </div>
      </ReaderContent>
    );
  }

  const { publication: pub, owner, recentDocuments } = profile;
  const lead = recentDocuments[0];
  const rest = recentDocuments.slice(1);

  return (
    <div>
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroInner)}>
          <div {...stylex.props(styles.avRing)}>
            <PublicationAvatar pub={pub} size="xl" style={styles.avatar} />
          </div>

          <div {...stylex.props(styles.heroInfo)}>
            {pub.topic ? <Kicker>{pub.topic}</Kicker> : null}
            <h1 {...stylex.props(styles.heroName)}>{pub.name}</h1>
            {pub.description ? (
              <p {...stylex.props(styles.heroDesc)}>{pub.description}</p>
            ) : null}
            <div {...stylex.props(styles.stats)}>
              {owner.handle ? (
                <a
                  href={`https://bsky.app/profile/${owner.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  {...stylex.props(styles.handleLink)}
                >
                  <Handle>@{owner.handle}</Handle>
                </a>
              ) : null}
              <Stat
                value={formatReaders(pub.subscriberCount)}
                label="readers"
              />
              <Stat value={String(pub.documentCount)} label="posts" />
              <Stat
                value={lastActive(
                  pub.lastDocumentAt ?? lead?.publishedAt ?? null,
                )}
                label=""
              />
            </div>
          </div>

          <div {...stylex.props(styles.heroActs)}>
            {pub.url ? (
              <IconButton
                variant="secondary"
                size="md"
                label="Open publication"
                onPress={() => {
                  window.open(pub.url, "_blank", "noopener,noreferrer");
                }}
              >
                <ExternalLink size={15} />
              </IconButton>
            ) : null}
            <FollowButton
              publicationUri={pub.uri}
              signedIn={signedIn}
              size="md"
              pub={pub}
              initialFollowing={follow.isFollowing}
            />
          </div>
        </div>
      </div>

      <ReaderContent>
        <Flex direction="column" gap="6xl" style={styles.writing}>
          <SectionHead kicker="Latest" title="Recent writing" />
          {recentDocuments.length === 0 ? (
            <div {...stylex.props(styles.emptyNote)}>
              No posts indexed from this publication yet.
            </div>
          ) : (
            <div>
              {lead ? (
                <FeatureArticle
                  article={lead}
                  showByline={false}
                  unread={isUnread(lead.uri)}
                />
              ) : null}
              {rest.map((article) => (
                <ArticleRow
                  key={article.uri}
                  article={article}
                  showByline={false}
                  unread={isUnread(article.uri)}
                />
              ))}
            </div>
          )}
        </Flex>
      </ReaderContent>
    </div>
  );
}
