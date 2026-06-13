import type { ReaderVoicePreference } from "#/lib/reader-voice";

export type ExtensionPublicationTheme = {
  themeBackground: string | null;
  themeForeground: string | null;
  themeAccent: string | null;
  themeAccentForeground: string | null;
};

export type ExtensionResolveArticle = {
  kind: "article";
  documentUri: string;
  title: string;
  publicationUri: string | null;
  publicationName: string | null;
  publicationHandle: string | null;
  publicationIconUrl: string | null;
  publicationOwnerAvatarUrl: string | null;
  publicationSubscriberCount: number | null;
  publicationReaderUrl: string | null;
  publishedAt: string | null;
  readingMinutes: number | null;
  authorName: string | null;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
  readerUrl: string;
  canonicalUrl: string | null;
  hasRenderableBody: boolean;
  isBookmarked?: boolean;
  isRead?: boolean;
  isFollowing?: boolean;
  isRecommended?: boolean;
  recommendCount: number;
  commentCount: number;
} & ExtensionPublicationTheme;

export type ExtensionResolvePublication = {
  kind: "publication";
  publicationUri: string;
  name: string;
  description: string | null;
  handle: string | null;
  iconUrl: string | null;
  ownerAvatarUrl: string | null;
  subscriberCount: number | null;
  readerUrl: string;
  siteUrl: string | null;
  isFollowing?: boolean;
} & ExtensionPublicationTheme;

export type ExtensionResolveReaderLink = {
  kind: "reader-link";
  readerUrl: string;
};

export type ExtensionResolveUnknown = {
  kind: "unknown";
};

export type ExtensionResolveResult =
  | ExtensionResolveArticle
  | ExtensionResolvePublication
  | ExtensionResolveReaderLink
  | ExtensionResolveUnknown;

export type ExtensionNarrationResponse = {
  documentUri: string;
  title: string;
  /** Narration author — drives the reader's automatic voice pick. */
  author: string | null;
  /** Full speech text (title, dek, byline, body) — same as the app reader. */
  text: string;
  /**
   * False when the indexed record had no structured body (the text may be a
   * truncated excerpt) — the background then prefers reading the live page.
   */
  complete: boolean;
};

export type ExtensionDiscussionComment = {
  source: "bluesky" | "margin" | "semble";
  kind: "link" | "quote";
  postUri: string;
  postUrl: string;
  author: {
    did: string;
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  commentary: string;
  quote: string | null;
  replyCount: number;
  indexedAt: string;
};

export type ExtensionDiscussionArticle = {
  uri: string;
  title: string;
  publicationName: string | null;
  publicationUri: string | null;
  readerUrl: string;
  commentCount: number;
  subtitle?: string;
};

export type ExtensionDiscussionResponse = {
  keepReading: Array<ExtensionDiscussionArticle>;
  discussions: Array<ExtensionDiscussionComment>;
  relatedReading: Array<ExtensionDiscussionArticle>;
  citedIn: Array<ExtensionDiscussionArticle>;
};

export type ExtensionSessionResponse = {
  signedIn: boolean;
  handle: string | null;
  name: string | null;
  image: string | null;
  did: string | null;
};

export type ExtensionSettings = {
  overlayEnabled: boolean;
  bskyBadgesEnabled: boolean;
  readerVoice: ReaderVoicePreference;
  apiOrigin?: string;
};
