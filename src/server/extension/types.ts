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

export type ExtensionSessionResponse = {
  signedIn: boolean;
  handle: string | null;
  name: string | null;
  image: string | null;
  did: string | null;
};
