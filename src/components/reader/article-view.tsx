"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Circle,
  CircleCheck,
  ExternalLink,
  Headphones,
  Heart,
  MoreHorizontal,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { AppLink } from "#/components/reader/app-link";
import { AuthorProfileLink } from "#/components/reader/author-profile-link";
import { PublicationNameLink } from "#/components/reader/publication-name-link";
import { DirectionalIcon } from "#/design-system/directional-icon";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { resolveArticleHeroImage } from "#/lib/document/lead-image";
import { usePageReader } from "#/lib/page-reader/page-reader-context";
import { useFormatters } from "#/lib/use-formatters";
import { useOpenCollectionsInMagazine } from "#/lib/use-open-collections-in-magazine";
import { useReadingTypography } from "#/lib/use-reading-typography";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { prefetchCollectionMagazine } from "#/magazine/load-magazine-data";

import { Alert } from "../../design-system/alert";
import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
import { Flex } from "../../design-system/flex";
import { IconButton } from "../../design-system/icon-button";
import { Lightbox } from "../../design-system/lightbox";
import {
  LIGHTBOX_IMAGE_TRANSITION_NAME,
  startLightboxViewTransition,
} from "../../design-system/lightbox/transition";
import { Menu, MenuItem } from "../../design-system/menu";
import { animationDuration } from "../../design-system/theme/animations.stylex";
import {
  criticalColor,
  primaryColor,
  uiColor,
} from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { ArticleBelowFold } from "./article-below-fold";
import { FollowButton } from "./cards";
import { ArticleContent } from "./content/article-content";
import { articleMeasureStyle } from "./content/body-styles";
import {
  articleDescriptionIsBodyExcerpt,
  articleReadingText,
  articleSpeechText,
} from "./content/extract-text";
import { MarkdownArticle } from "./content/renderers/shared/markdown-article";
import { DocumentShareMenu } from "./document-share-menu";
import {
  articlePublicationUrl,
  documentLinkParams,
  formatReaders,
  formatReadingTime,
  initials,
  primaryAuthor,
  publicationLinkParams,
} from "./format";
import { formatArticleReadStats } from "./format-i18n";
import { LabelerPill } from "./labeler-pill";
import {
  ArticleEngagement,
  Handle,
  Kicker,
  PublicationAvatar,
  Topic,
} from "./primitives";
import { QuoteShareLayer } from "./quote-share-layer";
import { applyMarkReadOptimisticUpdate } from "./read-optimistic";
import { ReaderWordHighlighter } from "./reader-word-highlighter";
import { SaveDraftConsumer } from "./save-draft-consumer";
import { useArticleBookmark } from "./use-article-bookmark";
import { useArticleReadToggle } from "./use-article-read-toggle";
import { useArticleRecommend } from "./use-article-recommend";

/** Reading progress of the article content within the document scroll. */
function articleReadingProgress(content: HTMLElement): number {
  const viewport = globalThis.innerHeight;
  const scrollY = globalThis.scrollY;
  const contentTop = content.getBoundingClientRect().top + scrollY;
  const contentBottom = contentTop + content.offsetHeight;
  const endScroll = Math.max(contentBottom - viewport, contentTop);
  const range = endScroll - contentTop;
  if (range <= 0) {
    return scrollY >= contentTop ? 1 : 0;
  }
  return Math.min(1, Math.max(0, (scrollY - contentTop) / range));
}

const styles = stylex.create({
  root: {
    "--current-word-highlight-background-color": primaryColor.solid1,
    "--current-word-highlight-color": primaryColor.textContrast,
    boxSizing: "border-box",
    maxWidth: "100%",
    minWidth: 0,
    // Deliberately no `overflow-x: clip` here, and the app shell drops its own
    // clip for this view (see `scroller` in app-shell). A horizontal clip
    // anywhere above the sticky article header makes WebKit re-snap the clip
    // rect to whole device pixels every frame while the page scrolls at
    // fractional offsets, so the header visibly jitters ~1px and leaks a sliver
    // of content along its top edge. Wide body content (code blocks, tables,
    // math, carousels) already scrolls inside its own `overflow-x: auto` box,
    // so nothing here needs an outer clip.
    // The floating bottom-nav pill overlays the app scroller on mobile, so
    // reserve room for trailing content; the nav is hidden at desktop widths.
    paddingBottom: {
      default: `calc(env(safe-area-inset-bottom, 0px) + ${spacing["28"]})`,
      "@media (min-width: 60rem)": 0,
    },
  },
  // The floating page-reader bar overlays the scroller on every width while a
  // document is playing, so reserve extra room for trailing content.
  rootReader: {
    paddingBottom: {
      default: `calc(env(safe-area-inset-bottom, 0px) + ${spacing["40"]})`,
      "@media (min-width: 60rem)": spacing["28"],
    },
  },
  stickyChrome: {
    backgroundColor: `color-mix(in oklch, ${uiColor.bg} 95%, transparent)`,
    position: "sticky",
    zIndex: 20,
    top: 0,
  },
  topBar: {
    alignItems: "center",
    backdropFilter: "blur(12px)",
    backgroundColor: `color-mix(in oklch, ${uiColor.bg} 90%, transparent)`,
    columnGap: {
      default: gap.sm,
      "@media (min-width: 40rem)": gap.lg,
    },
    display: "flex",
    flexShrink: 0,
    justifyContent: "space-between",
    rowGap: gap.lg,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
    paddingInlineStart: {
      default: spacing["4"],
      "@media (min-width: 40rem)": spacing["5"],
    },
    paddingInlineEnd: {
      default: spacing["4"],
      "@media (min-width: 40rem)": spacing["5"],
    },
    paddingTop: spacing["3"],
  },
  progressTrack: {
    backgroundColor: uiColor.component2,
    flexShrink: 0,
    position: "relative",
    height: spacing["1"],
    width: "100%",
  },
  topLeft: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    rowGap: gap.lg,
    minWidth: 0,
  },
  topActs: {
    alignItems: "center",
    columnGap: {
      default: gap.xs,
      "@media (min-width: 40rem)": gap.md,
    },
    display: "flex",
    flexShrink: 0,
    rowGap: gap.md,
  },
  topActsInline: {
    alignItems: "center",
    columnGap: gap.md,
    // Individual secondary buttons on desktop; folded into an overflow menu below
    // this breakpoint (see `topActsOverflow`).
    display: {
      default: "none",
      "@media (min-width: 40rem)": "flex",
    },
  },
  topActsOverflow: {
    alignItems: "center",
    display: {
      default: "flex",
      "@media (min-width: 40rem)": "none",
    },
  },
  pubByline: {
    borderWidth: 0,
    textDecoration: { default: "none", ":hover": "underline" },
    alignItems: "center",
    backgroundColor: "transparent",
    color: "inherit",
    columnGap: gap.md,
    cursor: "pointer",
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    rowGap: gap.md,
    textUnderlineOffset: "2px",
    minWidth: 0,
    paddingBottom: spacing["0"],
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["0"],
    paddingTop: spacing["0"],
  },
  pubBylineName: {
    // Single-line NAME/TITLE in a UI row: isolate for correct character
    // ordering, but let alignment follow the surrounding UI (right under
    // RTL). `dir="auto"` here would left-align it and break the column.
    unicodeBidi: "isolate",
    overflow: "hidden",
    color: uiColor.text2,
    flexShrink: 1,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  progress: {
    backgroundColor: primaryColor.solid1,
    position: "absolute",
    transitionDuration: animationDuration.fast,
    transitionProperty: "width",
    transitionTimingFunction: "linear",
    height: "100%",
    insetInlineStart: 0,
    top: 0,
  },
  article: {
    boxSizing: "border-box",
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "100%",
    minWidth: 0,
    paddingBottom: spacing["24"],
    paddingInlineStart: spacing["6"],
    paddingInlineEnd: spacing["6"],
    paddingTop: spacing["14"],
    width: "100%",
  },
  kicker: {
    gap: gap.sm,
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    textAlign: "center",
    marginBottom: spacing["5"],
  },
  labelBadges: {
    gap: gap.sm,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: {
      default: "2.125rem",
      "@media (min-width: 40rem)": "3.125rem",
    },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    textAlign: "center",
    // eslint-disable-next-line @stylexjs/valid-styles
    textWrap: "balance",
    marginBottom: spacing["5"],
    marginTop: spacing["0"],
  },
  dek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    textAlign: "center",
    // eslint-disable-next-line @stylexjs/valid-styles
    textWrap: "balance",
    marginBottom: spacing["7"],
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    marginTop: spacing["0"],
    maxWidth: "48ch",
  },
  magazineIntro: {
    marginBottom: spacing["12"],
  },
  byline: {
    alignItems: "center",
    boxSizing: "border-box",
    columnGap: gap.lg,
    display: "flex",
    justifyContent: "center",
    rowGap: gap.lg,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginBottom: spacing["2"],
    maxWidth: "100%",
    minWidth: 0,
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
    width: "100%",
  },
  bylineWho: {
    gap: gap.sm,
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    textAlign: "start",
    minWidth: 0,
  },
  bylineName: {
    // On mobile the name + @handle rarely fit on one line, so stack them as a
    // tight two-line byline instead of letting the handle wrap with the wide
    // inline gap. From `sm` up they sit inline again.
    columnGap: gap.lg,
    rowGap: spacing["1"],
    alignItems: {
      default: "flex-start",
      "@media (min-width: 40rem)": "center",
    },
    color: uiColor.text2,
    display: "flex",
    flexDirection: { default: "column", "@media (min-width: 40rem)": "row" },
    flexWrap: "wrap",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    maxWidth: "100%",
    minWidth: 0,
  },
  bylineNameLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
    minWidth: 0,
  },
  bylineHandleLink: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "100%",
  },
  bylineMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  // Each meta segment (date, reading time, read count) is its own bidi
  // paragraph. Without isolation the Unicode bidi algorithm reorders the Latin
  // digits/words across the `·` separators under an RTL UI, so the row renders
  // scrambled (e.g. `قراءة min read · 13 2 2026 يوليو 17`).
  bylineMetaItem: {
    unicodeBidi: "isolate",
  },
  hero: {
    borderRadius: radius.lg,
    overflow: "hidden",
    aspectRatio: "16 / 9",
    marginBottom: spacing["8"],
    padding: spacing["0"],
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "zoom-in",
    display: "block",
    width: "100%",
  },
  heroImg: {
    display: "block",
    objectFit: "cover",
    height: "100%",
    width: "100%",
  },
  foot: {
    alignItems: "center",
    columnGap: gap.xl,
    display: "flex",
    rowGap: gap.xl,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: spacing["14"],
    paddingTop: spacing["7"],
  },
  footGrow: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  footName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  colophon: {
    textAlign: "center",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: spacing["14"],
    paddingTop: spacing["7"],
  },
  colophonBody: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    lineHeight: lineHeight.base,
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "46ch",
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    textAlign: "center",
    paddingBottom: spacing["16"],
    paddingTop: spacing["16"],
  },
  bookmarkActive: {
    color: primaryColor.text2,
  },
  likePrompt: {
    gap: gap["2xl"],
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    textAlign: "center",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: spacing["14"],
    paddingBottom: spacing["7"],
    paddingTop: spacing["10"],
  },
  likePromptTitle: {
    margin: spacing["0"],
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontStyle: "italic",
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
  },
  likePromptSubtext: {
    margin: spacing["0"],
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.base,
    maxWidth: "42ch",
  },
  likeButton: {
    borderColor: uiColor.border1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    gap: gap.lg,
    alignItems: "center",
    backgroundColor: uiColor.bg,
    display: "inline-flex",
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color, border-color, color",
    transitionTimingFunction: "ease-in-out",
    paddingBottom: verticalSpace.md,
    paddingInlineStart: horizontalSpace["2xl"],
    paddingInlineEnd: horizontalSpace["2xl"],
    paddingTop: verticalSpace.md,
  },
  likeButtonActive: {
    borderColor: criticalColor.border1,
    backgroundColor: criticalColor.bgSubtle,
  },
  likeButtonHeart: {
    color: criticalColor.solid1,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  likeButtonLabel: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  likeButtonDivider: {
    alignSelf: "stretch",
    borderInlineStartColor: uiColor.border1,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    width: spacing["0"],
  },
  likeButtonCount: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.normal,
    minWidth: spacing["6"],
  },
});

function articleTopic(article: ArticleDetail): string | null {
  if (article.tags && article.tags.length > 0) return article.tags[0] ?? null;
  return article.publication?.topic ?? null;
}

/** The author's bare @handle (lead contributor, else publication owner). */
function authorHandle(article: ArticleDetail): string | null {
  return (
    article.contributors[0]?.handle ?? article.publicationOwnerHandle ?? null
  );
}

/** Avatar for the article's author (lead contributor, else publication owner). */
function authorAvatarUrl(article: ArticleDetail): string | null {
  return (
    article.contributors[0]?.avatarUrl ??
    article.publication?.ownerAvatarUrl ??
    null
  );
}

/** DID for the byline author (lead contributor, else publication owner). */
function authorDid(article: ArticleDetail): string | null {
  return (
    article.contributors[0]?.did ?? article.publication?.did ?? article.did
  );
}

function BookmarkButton({
  bookmarked,
  onToggle,
  isPending = false,
}: {
  bookmarked: boolean;
  onToggle: () => void;
  isPending?: boolean;
}) {
  const { t } = useLingui();
  return (
    <IconButton
      variant="secondary"
      size="md"
      label={bookmarked ? t`Saved for later` : t`Save for later`}
      isDisabled={isPending}
      onPress={onToggle}
      style={bookmarked ? styles.bookmarkActive : undefined}
    >
      <Bookmark size={18} fill={bookmarked ? "currentColor" : "none"} />
    </IconButton>
  );
}

function ReadToggleButton({
  isRead,
  onToggle,
  isPending = false,
}: {
  isRead: boolean;
  onToggle: () => void;
  isPending?: boolean;
}) {
  const { t } = useLingui();
  return (
    <IconButton
      variant="secondary"
      size="md"
      label={isRead ? t`Mark as unread` : t`Mark as read`}
      aria-pressed={isRead}
      isDisabled={isPending}
      onPress={onToggle}
      style={isRead ? styles.bookmarkActive : undefined}
    >
      {isRead ? <CircleCheck size={18} /> : <Circle size={18} />}
    </IconButton>
  );
}

/**
 * Mobile overflow for the article top bar: collapses the secondary actions
 * (magazine / open-on-site / read toggle / save) behind a single "⋯" button so
 * the bar doesn't overflow on narrow screens. On desktop the same actions render
 * as individual icon buttons instead (see `styles.topActsInline`).
 */
function ReaderSecondaryActionsMenu({
  onOpenMagazine,
  onOpenPublication,
  publicationName,
  showReadToggle,
  isRead,
  onToggleRead,
  bookmarked,
  onToggleBookmark,
}: {
  onOpenMagazine: (() => void) | null;
  onOpenPublication: (() => void) | null;
  publicationName?: string | null;
  showReadToggle: boolean;
  isRead: boolean;
  onToggleRead: () => void;
  bookmarked: boolean;
  onToggleBookmark: () => void;
}) {
  const { t } = useLingui();
  return (
    <Menu
      trigger={
        <IconButton variant="secondary" size="md" label={t`More actions`}>
          <MoreHorizontal size={18} />
        </IconButton>
      }
    >
      {onOpenMagazine ? (
        <MenuItem
          prefix={<BookOpen size={16} />}
          onPress={onOpenMagazine}
          textValue={t`Open magazine edition`}
        >
          <Trans>Open magazine edition</Trans>
        </MenuItem>
      ) : null}
      {onOpenPublication ? (
        <MenuItem
          prefix={<ExternalLink size={16} />}
          onPress={onOpenPublication}
          textValue={
            publicationName
              ? t`Open on ${publicationName}`
              : t`Open on publication`
          }
        >
          {publicationName ? (
            <Trans>Open on {publicationName}</Trans>
          ) : (
            <Trans>Open on publication</Trans>
          )}
        </MenuItem>
      ) : null}
      {showReadToggle ? (
        <MenuItem
          prefix={isRead ? <CircleCheck size={16} /> : <Circle size={16} />}
          onPress={onToggleRead}
          textValue={isRead ? t`Mark as unread` : t`Mark as read`}
        >
          {isRead ? <Trans>Mark as unread</Trans> : <Trans>Mark as read</Trans>}
        </MenuItem>
      ) : null}
      <MenuItem
        prefix={
          <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} />
        }
        onPress={onToggleBookmark}
        textValue={bookmarked ? t`Saved for later` : t`Save for later`}
      >
        {bookmarked ? (
          <Trans>Saved for later</Trans>
        ) : (
          <Trans>Save for later</Trans>
        )}
      </MenuItem>
    </Menu>
  );
}

function ArticleLikePrompt({
  recommended,
  onToggle,
  recommendCount,
}: {
  recommended: boolean;
  onToggle: () => void;
  recommendCount: number;
}) {
  return (
    <div {...stylex.props(styles.likePrompt)}>
      <h2 {...stylex.props(styles.likePromptTitle)}>
        <Trans>Did you enjoy this article?</Trans>
      </h2>
      <p {...stylex.props(styles.likePromptSubtext)}>
        <Trans>
          Recommend it — Standard Reader surfaces well-loved writing to more
          readers across the network.
        </Trans>
      </p>
      <Button
        variant="secondary"
        aria-pressed={recommended}
        onPress={onToggle}
        style={[styles.likeButton, recommended && styles.likeButtonActive]}
      >
        <span {...stylex.props(styles.likeButtonHeart)}>
          <Heart
            size={18}
            strokeWidth={2}
            fill={recommended ? "currentColor" : "none"}
          />
        </span>
        <span {...stylex.props(styles.likeButtonLabel)}>
          {recommended ? (
            <Trans>Recommended</Trans>
          ) : (
            <Trans>Recommend this article</Trans>
          )}
        </span>
        <span aria-hidden {...stylex.props(styles.likeButtonDivider)} />
        <span {...stylex.props(styles.likeButtonCount)}>
          {formatReaders(recommendCount)}
        </span>
      </Button>
    </div>
  );
}

export function ArticleView(props: {
  article: ArticleDetail;
  sharedQuote?: string | null;
}) {
  return <ArticleViewBody {...props} />;
}

/** Top-bar control to start/pause reading this article aloud. */
function TopListenButton({ article }: { article: ArticleDetail }) {
  const { t } = useLingui();
  const { nowPlaying, state, playArticle } = usePageReader();
  const available = useMemo(
    () => (articleSpeechText(article)?.trim().length ?? 0) > 0,
    [article],
  );
  if (!available) return null;

  // Once this article is loaded into the global player, its transport lives in
  // the playback toolbar — drop the header button to avoid a duplicate control.
  const isCurrent = nowPlaying?.uri === article.uri;
  if (isCurrent && state.status !== "idle") return null;

  return (
    <IconButton
      variant="secondary"
      size="md"
      label={t`Listen`}
      onPress={() => playArticle(article)}
    >
      <Headphones size={18} />
    </IconButton>
  );
}

/** Scroll progress bar shown in the article's sticky chrome. */
function ReaderProgress({ progress }: { progress: number }) {
  return (
    <div {...stylex.props(styles.progressTrack)} aria-hidden>
      <div
        {...stylex.props(styles.progress)}
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

const COLLECTION_MAGAZINE_INTRO_KEY = "collection-magazine-intro:v1";

function CollectionColophon({ body }: { body: string }) {
  return (
    <footer {...stylex.props(styles.colophon)}>
      <div {...stylex.props(styles.colophonBody)}>
        <MarkdownArticle
          text={body}
          hasHero={false}
          codeHighlights={undefined}
        />
      </div>
    </footer>
  );
}

function hasSeenCollectionMagazineIntro(): boolean {
  if (globalThis.localStorage === undefined) {
    return true;
  }
  try {
    return (
      globalThis.localStorage.getItem(COLLECTION_MAGAZINE_INTRO_KEY) === "1"
    );
  } catch {
    return true;
  }
}

function ArticleViewBody({
  article,
  sharedQuote,
}: {
  article: ArticleDetail;
  sharedQuote?: string | null;
}) {
  const { t, i18n } = useLingui();
  const fmt = useFormatters();
  const router = useRouter();
  const { active: readerActive } = usePageReader();
  const { rememberOpenInMagazine } = useOpenCollectionsInMagazine();
  const { preference: readingTypography } = useReadingTypography();
  const articleRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [showMagazineIntro, setShowMagazineIntro] = useState(
    () => Boolean(article.collection) && !hasSeenCollectionMagazineIntro(),
  );
  const pub = article.publication;
  const publicationName = pub?.name;
  const pubParams = pub ? publicationLinkParams(pub.uri) : null;
  const authorName = primaryAuthor(article);
  const handle = authorHandle(article);
  const bylineDid = authorDid(article);
  const showHandle = handle != null && authorName !== `@${handle}`;
  const topic = articleTopic(article);
  const { data: labelData } = useQuery(
    labelerApi.getDocumentLabelsQueryOptions(article.uri),
  );
  // De-dup by `val` (first emitting labeler wins) but keep the labeler DID
  // (`src`) so each pill can resolve its display name and link to the labeler.
  const labelRefs = (() => {
    const byVal = new Map<string, { src: string; val: string }>();
    for (const l of labelData?.labels ?? []) {
      if (l.visibility === "ignore") continue;
      if (byVal.has(l.val)) continue;
      byVal.set(l.val, { src: l.src, val: l.val });
    }
    return [...byVal.values()];
  })();
  const readingLabel = formatReadingTime(articleReadingText(article));
  const date = fmt.date(article.publishedAt);
  const publicationArticleUrl = articlePublicationUrl(article);
  const linkParams = documentLinkParams(article.uri);

  const handleOpenMagazine =
    article.collection && linkParams
      ? () => {
          rememberOpenInMagazine();
          void router.navigate({
            to: "/collection/$did/$rkey",
            params: linkParams,
            replace: true,
          });
        }
      : null;
  const handleOpenPublication = publicationArticleUrl
    ? () => {
        globalThis.open(publicationArticleUrl, "_blank", "noopener,noreferrer");
      }
    : null;

  const dismissMagazineIntro = () => {
    try {
      globalThis.localStorage?.setItem(COLLECTION_MAGAZINE_INTRO_KEY, "1");
    } catch {
      // Private browsing or disabled storage — still hide for this session.
    }
    setShowMagazineIntro(false);
  };

  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  const {
    recommended,
    recommendCount,
    toggle: toggleRecommend,
  } = useArticleRecommend(article.uri, signedIn, article.recommendCount);

  const {
    bookmarked,
    toggle: toggleBookmark,
    isPending: bookmarkPending,
  } = useArticleBookmark(article.uri, signedIn);

  const readStats = formatArticleReadStats(i18n, article.readCount);
  const hasEngagement = article.recommendCount > 0 || article.commentCount > 0;
  const hero = useMemo(() => resolveArticleHeroImage(article), [article]);
  const [heroLightboxOpen, setHeroLightboxOpen] = useState(false);
  const [heroTransitionActive, setHeroTransitionActive] = useState(false);

  const queryClient = useQueryClient();
  const { enabled: trackReading } = useTrackReadingHistory();
  const { mutate: markRead } = useMutation(readerApi.markReadMutationOptions());
  const markedUriRef = useRef<string | null>(null);

  const {
    isRead,
    toggle: toggleRead,
    isPending: readTogglePending,
  } = useArticleReadToggle(article.uri, {
    signedIn,
    publicationUri: article.publicationUri,
  });

  useEffect(() => {
    if (!signedIn || !trackReading || markedUriRef.current === article.uri) {
      return;
    }
    markedUriRef.current = article.uri;
    applyMarkReadOptimisticUpdate(
      queryClient,
      article.uri,
      article.publicationUri,
    );
    markRead(article.uri);
  }, [
    article.publicationUri,
    article.uri,
    signedIn,
    trackReading,
    markRead,
    queryClient,
  ]);

  useEffect(() => {
    if (!article.collection || !linkParams) return;

    prefetchCollectionMagazine(queryClient, linkParams);

    const preloadMagazine = () => {
      void router.preloadRoute({
        to: "/collection/$did/$rkey",
        params: linkParams,
      });
    };

    if (typeof globalThis.requestIdleCallback === "function") {
      const id = globalThis.requestIdleCallback(preloadMagazine);
      return () => globalThis.cancelIdleCallback(id);
    }

    const timeout = globalThis.setTimeout(preloadMagazine, 1);
    return () => globalThis.clearTimeout(timeout);
  }, [article.collection, article.uri, linkParams, queryClient, router]);

  useLayoutEffect(() => {
    // Measure the <article> only — progress should hit 100% at the end of the
    // article body, not after the "More from" / comments sections below it.
    const articleEl = articleRef.current;
    if (!articleEl) return;

    const sync = () => {
      setProgress(articleReadingProgress(articleEl));
    };

    if (!sharedQuote?.trim()) {
      globalThis.scrollTo(0, 0);
    }
    sync();

    // The page (document) is the scroller, so its scroll event fires on window.
    globalThis.addEventListener("scroll", sync, { passive: true });
    const resizeObserver = new ResizeObserver(() => sync());
    resizeObserver.observe(articleEl);

    return () => {
      globalThis.removeEventListener("scroll", sync);
      resizeObserver.disconnect();
    };
  }, [article.uri, sharedQuote]);

  return (
    <div
      data-unclipped-sticky
      {...stylex.props(styles.root, readerActive && styles.rootReader)}
    >
      <div {...stylex.props(styles.stickyChrome)}>
        <div {...stylex.props(styles.topBar)}>
          <div {...stylex.props(styles.topLeft)}>
            <IconButton
              variant="secondary"
              size="md"
              label={t`Back`}
              onPress={() => {
                router.history.back();
              }}
            >
              <DirectionalIcon as={ArrowLeft} size={18} />
            </IconButton>

            {pub ? (
              <>
                {pubParams ? (
                  <Link
                    to="/p/$did/$rkey"
                    params={pubParams}
                    {...stylex.props(styles.pubByline)}
                  >
                    <PublicationAvatar pub={pub} size="sm" />
                    <span {...stylex.props(styles.pubBylineName)}>
                      {pub.name}
                    </span>
                  </Link>
                ) : pub.url ? (
                  <AppLink href={pub.url} linkStyle={styles.pubByline}>
                    <PublicationAvatar pub={pub} size="sm" />
                    <span {...stylex.props(styles.pubBylineName)}>
                      {pub.name}
                    </span>
                  </AppLink>
                ) : (
                  <span {...stylex.props(styles.pubByline)}>
                    <PublicationAvatar pub={pub} size="sm" />
                    <span {...stylex.props(styles.pubBylineName)}>
                      {pub.name}
                    </span>
                  </span>
                )}
              </>
            ) : null}
          </div>

          <div {...stylex.props(styles.topActs)}>
            <TopListenButton article={article} />

            {/* Secondary actions: individual buttons on desktop… */}
            <div {...stylex.props(styles.topActsInline)}>
              {handleOpenMagazine ? (
                <IconButton
                  variant="secondary"
                  size="md"
                  label={t`Open magazine edition`}
                  onPress={handleOpenMagazine}
                >
                  <BookOpen size={18} />
                </IconButton>
              ) : null}
              {handleOpenPublication ? (
                <IconButton
                  variant="secondary"
                  size="md"
                  label={
                    pub ? t`Open on ${publicationName}` : t`Open on publication`
                  }
                  onPress={handleOpenPublication}
                >
                  <ExternalLink size={18} />
                </IconButton>
              ) : null}
              {signedIn && trackReading ? (
                <ReadToggleButton
                  isRead={isRead}
                  onToggle={toggleRead}
                  isPending={readTogglePending}
                />
              ) : null}
              <BookmarkButton
                bookmarked={bookmarked}
                onToggle={toggleBookmark}
                isPending={bookmarkPending}
              />
            </div>

            {/* …collapsed into an overflow menu on mobile. */}
            <div {...stylex.props(styles.topActsOverflow)}>
              <ReaderSecondaryActionsMenu
                onOpenMagazine={handleOpenMagazine}
                onOpenPublication={handleOpenPublication}
                publicationName={publicationName}
                showReadToggle={signedIn && trackReading}
                isRead={isRead}
                onToggleRead={toggleRead}
                bookmarked={bookmarked}
                onToggleBookmark={toggleBookmark}
              />
            </div>

            <DocumentShareMenu
              recordUri={article.uri}
              title={article.title}
              canonicalUrl={article.canonicalUrl}
              description={article.description}
              author={primaryAuthor(article)}
              siteName={pub?.name}
              imageUrl={article.coverImageUrl}
            />
          </div>
        </div>

        <ReaderProgress progress={progress} />
      </div>

      <ReaderWordHighlighter rootRef={articleRef} articleUri={article.uri} />
      <SaveDraftConsumer />
      <article
        ref={articleRef}
        {...stylex.props(
          styles.article,
          articleMeasureStyle(readingTypography),
        )}
      >
        {showMagazineIntro ? (
          <div {...stylex.props(styles.magazineIntro)}>
            <Alert
              title={t`There’s a magazine edition of this collection.`}
              action={
                <Button variant="primary" onPress={dismissMagazineIntro}>
                  <Trans>OK</Trans>
                </Button>
              }
            >
              <Trans>
                Nine pieces, laid out as spreads — made to be read slowly. Click
                the book icon in the header.
              </Trans>
            </Alert>
          </div>
        ) : null}

        {topic || labelRefs.length > 0 ? (
          <div {...stylex.props(styles.kicker)}>
            {labelRefs.length > 0 ? (
              <div {...stylex.props(styles.labelBadges)}>
                {labelRefs.map((ref) => (
                  <LabelerPill
                    key={`${ref.src}:${ref.val}`}
                    src={ref.src}
                    val={ref.val}
                  />
                ))}
              </div>
            ) : null}
            {topic ? (
              <Kicker>
                <Topic name={topic} />
              </Kicker>
            ) : null}
          </div>
        ) : null}

        {hero ? (
          <button
            aria-label={t`Open image`}
            type="button"
            onClick={() => {
              flushSync(() => setHeroTransitionActive(true));
              startLightboxViewTransition(() => setHeroLightboxOpen(true));
            }}
            style={
              heroTransitionActive && !heroLightboxOpen
                ? { viewTransitionName: LIGHTBOX_IMAGE_TRANSITION_NAME }
                : undefined
            }
            {...stylex.props(styles.hero)}
          >
            <img
              src={hero.url}
              alt=""
              referrerPolicy="no-referrer"
              {...stylex.props(styles.heroImg)}
            />
          </button>
        ) : null}
        {hero ? (
          <Lightbox
            alt={t`Article header image`}
            images={[
              {
                src: hero.url,
                alt: "",
                transitionName: heroTransitionActive
                  ? LIGHTBOX_IMAGE_TRANSITION_NAME
                  : undefined,
              },
            ]}
            isOpen={heroLightboxOpen}
            onOpenChange={(open) => {
              setHeroLightboxOpen(open);
              if (!open) setHeroTransitionActive(false);
            }}
          />
        ) : null}

        {/* dir="auto" for the same reason as the article body: this is author
            content, not UI chrome, so it must not inherit the UI direction. */}
        <h1 dir="auto" {...stylex.props(styles.title)}>
          {article.title}
        </h1>

        {article.description && !articleDescriptionIsBodyExcerpt(article) ? (
          <p dir="auto" {...stylex.props(styles.dek)}>
            {article.description}
          </p>
        ) : null}

        <div {...stylex.props(styles.byline)}>
          <Avatar
            size="lg"
            src={authorAvatarUrl(article) ?? undefined}
            fallback={initials(authorName)}
            alt={authorName}
          />
          <div {...stylex.props(styles.bylineWho)}>
            <div {...stylex.props(styles.bylineName)}>
              {bylineDid ? (
                <Link
                  to="/u/$did"
                  params={{ did: bylineDid }}
                  {...stylex.props(styles.bylineNameLink)}
                >
                  {authorName}
                </Link>
              ) : (
                authorName
              )}

              {showHandle && bylineDid ? (
                <Link
                  to="/u/$did"
                  params={{ did: bylineDid }}
                  {...stylex.props(
                    styles.bylineNameLink,
                    styles.bylineHandleLink,
                  )}
                >
                  <Handle>@{handle}</Handle>
                </Link>
              ) : showHandle ? (
                <Handle>@{handle}</Handle>
              ) : null}
            </div>
            <Flex align="center" gap="md" wrap style={styles.bylineMeta}>
              <span>
                <span {...stylex.props(styles.bylineMetaItem)}>{date}</span>
                {readingLabel ? (
                  <>
                    <span aria-hidden> · </span>
                    <span {...stylex.props(styles.bylineMetaItem)}>
                      {readingLabel}
                    </span>
                  </>
                ) : null}
                {readStats ? (
                  <>
                    <span aria-hidden> · </span>
                    <span {...stylex.props(styles.bylineMetaItem)}>
                      {readStats}
                    </span>
                  </>
                ) : null}
              </span>
              {hasEngagement ? (
                <>
                  <span aria-hidden>·</span>
                  <ArticleEngagement
                    recommendCount={article.recommendCount}
                    commentCount={article.commentCount}
                    size="sm"
                  />
                </>
              ) : null}
            </Flex>
          </div>
        </div>

        {linkParams ? (
          <QuoteShareLayer article={article} sharedQuote={sharedQuote}>
            <ArticleContent article={article} />
          </QuoteShareLayer>
        ) : (
          <ArticleContent article={article} />
        )}

        {article.collection?.colophon?.body ? (
          <CollectionColophon body={article.collection.colophon.body} />
        ) : null}

        <ArticleLikePrompt
          recommended={recommended}
          onToggle={toggleRecommend}
          recommendCount={recommendCount}
        />

        {pub ? (
          <div {...stylex.props(styles.foot)}>
            <PublicationAvatar pub={pub} size="lg" />
            <Flex direction="column" gap="xs" style={styles.footGrow}>
              <PublicationNameLink
                publicationUri={article.publicationUri}
                url={pub.url}
                linkStyle={styles.footName}
              >
                {pub.name}
              </PublicationNameLink>
              {article.publicationOwnerHandle && bylineDid ? (
                <AuthorProfileLink authorRef={bylineDid}>
                  <Handle>@{article.publicationOwnerHandle}</Handle>
                </AuthorProfileLink>
              ) : null}
            </Flex>
            {article.publicationUri ? (
              <FollowButton
                publicationUri={article.publicationUri}
                signedIn={signedIn}
              />
            ) : null}
          </div>
        ) : null}
      </article>

      <ArticleBelowFold article={article} showComments={Boolean(linkParams)} />
    </div>
  );
}

export function ArticleNotFound() {
  return (
    <div {...stylex.props(styles.emptyNote)}>
      <Trans>We couldn’t find that article.</Trans>
    </div>
  );
}
