"use client";

import { Avatar } from "@standard-reader/design-system/avatar";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { initials } from "#/components/reader/format";
import { PublicationAvatar } from "#/components/reader/primitives";
import { authorApi } from "#/integrations/tanstack-query/api-author.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { fetchMiniPost, pcktNoteUrl } from "#/lib/pckt/mini";
import { useFormatters } from "#/lib/use-formatters";

// An embedded pckt note, delineated from the article prose by a bordered card
// (mirroring the sibling Bluesky post embed). The body is set in the serif
// reading face so the note stays in the article's voice; identity + date frame
// it as metadata. The whole card links to the note on pckt.
const styles = stylex.create({
  card: {
    borderColor: {
      default: uiColor.border1,
      ":hover": uiColor.border2,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    marginBlock: spacing["6"],
    paddingInline: spacing["4"],
    display: "flex",
    flexDirection: "column",
    position: "relative",
    transitionDuration: animationDuration.default,
    transitionProperty: "border-color",
    paddingBottom: spacing["3"],
    paddingTop: spacing["4"],
  },
  // Stretched link: a transparent overlay that makes the whole card open the
  // note on pckt, while the quoted document (layered above it) keeps its own
  // in-app link — so neither anchor nests inside the other.
  stretchedLink: {
    inset: 0,
    borderRadius: radius.md,
    position: "absolute",
    zIndex: 0,
  },
  header: {
    gap: gap.lg,
    alignItems: "center",
    display: "flex",
    minWidth: 0,
  },
  avatarRound: {
    borderRadius: radius.full,
  },
  meta: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    lineHeight: lineHeight.xs,
    rowGap: spacing["2"],
    minWidth: 0,
  },
  name: {
    color: uiColor.text2,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  handle: {
    color: uiColor.text1,
    fontSize: fontSize.base,
  },
  body: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    marginTop: spacing["3"],
  },
  time: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    marginTop: spacing["2"],
  },
  // A quoted article, shown as a compact reference inside the note. A subtle
  // fill (not a nested bordered card) groups it; it isn't a separate link — the
  // whole note card opens on pckt, where the quote is live.
  quote: {
    padding: spacing["2"],
    borderRadius: radius.sm,
    gap: gap.lg,
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: {
      default: uiColor.component1,
      ":hover": uiColor.component2,
    },
    color: "inherit",
    display: "flex",
    position: "relative",
    transitionDuration: animationDuration.default,
    transitionProperty: "background-color",
    zIndex: 1,
    marginTop: spacing["4"],
  },
  quoteThumb: {
    borderRadius: radius.xs,
    flexShrink: 0,
    objectFit: "cover",
    height: spacing["12"],
    width: spacing["12"],
  },
  quoteCol: {
    display: "flex",
    flexDirection: "column",
    rowGap: spacing["1"],
    minWidth: 0,
  },
  quoteTitle: {
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    color: uiColor.text2,
    display: "-webkit-box",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    // -webkit-box clamps to a fixed line count; a hair of bottom padding keeps
    // serif descenders on the last line from being trimmed by overflow:hidden.
    paddingBottom: "0.1em",
  },
  quoteByline: {
    overflow: "hidden",
    color: uiColor.text1,
    fontSize: fontSize.sm,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const DOCUMENT_COLLECTIONS = new Set([
  "site.standard.document",
  "blog.pckt.document",
  "pub.leaflet.document",
]);

/** A document quoted by a note (`embed #record`), shown as a compact reference
 * that links to the article in-app. Layered above the card's stretched link so
 * it stays independently clickable. Non-document quotes are omitted. */
function PcktNoteQuoteEmbed({ uri }: { uri: string }) {
  const parts = uri.split("/");
  const collection = parts[3];
  const did = parts[2];
  const rkey = parts[4];
  const isDocument = collection ? DOCUMENT_COLLECTIONS.has(collection) : false;

  const { data: article } = useQuery({
    ...publicationApi.getArticleCardQueryOptions(uri),
    enabled: isDocument,
  });

  if (!isDocument || !article || !did || !rkey) return null;

  const byline =
    article.publicationName ??
    article.authorDisplayName ??
    (article.authorHandle ? `@${article.authorHandle}` : null);

  return (
    <Link
      to="/a/$did/$rkey"
      params={{ did, rkey }}
      {...stylex.props(styles.quote)}
    >
      {article.coverImageUrl ? (
        <img
          src={article.coverImageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          {...stylex.props(styles.quoteThumb)}
        />
      ) : null}
      <div {...stylex.props(styles.quoteCol)}>
        <span {...stylex.props(styles.quoteTitle)}>{article.title}</span>
        {byline ? (
          <span {...stylex.props(styles.quoteByline)}>{byline}</span>
        ) : null}
      </div>
    </Link>
  );
}

/** Renders `blog.pckt.block.noteEmbed` — a pckt note embedded inline in a post. */
export function PcktNoteEmbedView({
  noteRef,
}: {
  noteRef?: { uri?: string; cid?: string };
}) {
  const fmt = useFormatters();
  const uri = noteRef?.uri?.trim();

  const { data: note } = useQuery({
    queryKey: ["pckt-mini-post", uri] as const,
    queryFn: async () => (uri ? fetchMiniPost(uri) : null),
    enabled: Boolean(uri),
    staleTime: 5 * 60 * 1000,
  });

  const { data: summary } = useQuery({
    ...authorApi.getAuthorSummaryQueryOptions(note?.did ?? ""),
    enabled: Boolean(note?.did),
  });
  const author = summary?.profile;

  // Notes published under a blog (`publication` set) show the publication —
  // its icon, name, and domain — instead of the author.
  const { data: pubHeader } = useQuery({
    ...publicationApi.getPublicationHeaderQueryOptions(
      note?.publicationUri ?? "",
    ),
    enabled: Boolean(note?.publicationUri),
  });

  if (!uri || !note) return null;

  const asPublication = pubHeader ?? null;
  const resolvedHref = pcktNoteUrl(note.did, note.rkey);

  const name = asPublication
    ? asPublication.publication.name
    : author?.displayName?.trim() ||
      (author?.handle ? `@${author.handle}` : note.did.slice(0, 16));
  const handle = asPublication
    ? asPublication.owner.handle
      ? `@${asPublication.owner.handle}`
      : null
    : author?.handle
      ? `@${author.handle}`
      : null;

  const avatar = asPublication ? (
    <PublicationAvatar pub={asPublication.publication} size="lg" />
  ) : (
    <Avatar
      size="lg"
      src={author?.avatarUrl ?? undefined}
      fallback={initials(name)}
      alt={name}
      style={styles.avatarRound}
    />
  );

  return (
    <div {...stylex.props(styles.card)}>
      <a
        href={resolvedHref}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open note by ${name} on pckt`}
        {...stylex.props(styles.stretchedLink)}
      />
      <div {...stylex.props(styles.header)}>
        {avatar}
        <div {...stylex.props(styles.meta)}>
          <span {...stylex.props(styles.name)}>{name}</span>
          {handle ? (
            <span {...stylex.props(styles.handle)}>{handle}</span>
          ) : null}
        </div>
      </div>
      <div {...stylex.props(styles.body)}>{note.text}</div>
      {note.quotedRecordUri ? (
        <PcktNoteQuoteEmbed uri={note.quotedRecordUri} />
      ) : null}
      <time dateTime={note.createdAt} {...stylex.props(styles.time)}>
        {fmt.relativeTime(note.createdAt)}
      </time>
    </div>
  );
}
