import type {
  ArticleCard,
  ProfileSummary,
  PublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import type { ExtensionResolveResult } from "#/server/extension/types";

export function toPublicationView(card: PublicationCard) {
  return {
    uri: card.uri,
    did: card.did,
    name: card.name,
    url: card.url,
    description: card.description,
    iconUrl: card.iconUrl,
    ownerAvatarUrl: card.ownerAvatarUrl,
    ownerHandle: card.ownerHandle,
    topic: card.topic,
    verified: card.verified,
    subscriberCount: card.subscriberCount,
    documentCount: card.documentCount,
    lastDocumentAt: card.lastDocumentAt,
    searchNameHtml: card.searchNameHtml ?? null,
    searchSnippetHtml: card.searchSnippetHtml ?? null,
  };
}

export function toDocumentView(card: ArticleCard) {
  return {
    uri: card.uri,
    did: card.did,
    title: card.title,
    description: card.description,
    path: card.path,
    canonicalUrl: card.canonicalUrl,
    coverImageUrl: card.coverImageUrl,
    publishedAt: card.publishedAt,
    featured: card.featured,
    publicationUri: card.publicationUri,
    publicationName: card.publicationName,
    publicationIconUrl: card.publicationIconUrl,
    publicationOwnerAvatarUrl: card.publicationOwnerAvatarUrl,
    publicationOwnerHandle: card.publicationOwnerHandle,
    publicationBannerUrl: card.publicationBannerUrl,
    publicationTopic: card.publicationTopic,
    tags: card.tags,
    recommendCount: card.recommendCount,
    commentCount: card.commentCount,
    hasRenderableBody: card.hasRenderableBody,
    isRead: card.isRead,
    searchTitleHtml: card.searchTitleHtml ?? null,
    searchSnippetHtml: card.searchSnippetHtml ?? null,
  };
}

export function toProfileView(profile: ProfileSummary) {
  return {
    did: profile.did,
    handle: profile.handle,
    displayName: profile.displayName,
    description: profile.description,
    avatarUrl: profile.avatarUrl,
    bannerUrl: profile.bannerUrl,
  };
}

export function toResolveView(result: ExtensionResolveResult) {
  return result;
}
