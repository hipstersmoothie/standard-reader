import type { XrpcRegistryEntry } from "./types";

import * as catalog from "./handlers/catalog";
import * as feeds from "./handlers/feeds";
import * as labels from "./handlers/labels";
import * as reader from "./handlers/reader";
import * as writes from "./handlers/writes";
import { XRPC_WRITE_SCOPES } from "./scopes";

export const XRPC_REGISTRY = new Map<string, XrpcRegistryEntry>([
  // Public catalog — resolve, search, profiles
  [
    "app.standard-reader.resolveUrl",
    { method: "query", auth: "none", handler: catalog.handleResolveUrl },
  ],
  [
    "app.standard-reader.resolveHandle",
    { method: "query", auth: "none", handler: catalog.handleResolveHandle },
  ],
  [
    "app.standard-reader.searchPublications",
    {
      method: "query",
      auth: "none",
      handler: catalog.handleSearchPublications,
    },
  ],
  [
    "app.standard-reader.searchDocuments",
    { method: "query", auth: "none", handler: catalog.handleSearchDocuments },
  ],
  [
    "app.standard-reader.getPublication",
    { method: "query", auth: "none", handler: catalog.handleGetPublication },
  ],
  [
    "app.standard-reader.getDocument",
    { method: "query", auth: "none", handler: catalog.handleGetDocument },
  ],
  [
    "app.standard-reader.getPublications",
    { method: "query", auth: "none", handler: catalog.handleGetPublications },
  ],
  [
    "app.standard-reader.getAuthor",
    { method: "query", auth: "none", handler: catalog.handleGetAuthor },
  ],
  [
    "app.standard-reader.getAuthorPublications",
    {
      method: "query",
      auth: "none",
      handler: catalog.handleGetAuthorPublications,
    },
  ],
  [
    "app.standard-reader.getDocumentContext",
    {
      method: "query",
      auth: "none",
      handler: catalog.handleGetDocumentContext,
    },
  ],

  // Labelers — discovery + per-subject labels from subscribed labelers
  [
    "app.standard-reader.getLabelers",
    { method: "query", auth: "optional-did", handler: labels.handleGetLabelers },
  ],
  [
    "app.standard-reader.getLabeler",
    { method: "query", auth: "optional-did", handler: labels.handleGetLabeler },
  ],
  [
    "app.standard-reader.getLabels",
    { method: "query", auth: "optional-did", handler: labels.handleGetLabels },
  ],

  // Feeds & lists — directory rails, tags, publication lists
  [
    "app.standard-reader.getLatestFeed",
    { method: "query", auth: "none", handler: feeds.handleGetLatestFeed },
  ],
  [
    "app.standard-reader.getTrendingPublications",
    {
      method: "query",
      auth: "none",
      handler: feeds.handleGetTrendingPublications,
    },
  ],
  [
    "app.standard-reader.getTrendingDocuments",
    {
      method: "query",
      auth: "none",
      handler: feeds.handleGetTrendingDocuments,
    },
  ],
  [
    "app.standard-reader.getTagFeed",
    { method: "query", auth: "none", handler: feeds.handleGetTagFeed },
  ],
  [
    "app.standard-reader.getList",
    { method: "query", auth: "none", handler: feeds.handleGetList },
  ],
  [
    "app.standard-reader.getListFeed",
    { method: "query", auth: "none", handler: feeds.handleGetListFeed },
  ],

  // Signed-in home & discovery rails
  [
    "app.standard-reader.getHomeFeed",
    { method: "query", auth: "required", handler: reader.handleGetHomeFeed },
  ],
  [
    "app.standard-reader.getRecommendedPublications",
    {
      method: "query",
      auth: "required",
      handler: reader.handleGetRecommendedPublications,
    },
  ],
  [
    "app.standard-reader.getFollowedByPeopleYouFollow",
    {
      method: "query",
      auth: "required",
      handler: reader.handleGetFollowedByPeopleYouFollow,
    },
  ],

  // Reader state — optional did param or authenticated subject
  [
    "app.standard-reader.getFollowStatus",
    {
      method: "query",
      auth: "optional-did",
      handler: reader.handleGetFollowStatus,
    },
  ],
  [
    "app.standard-reader.getReadStatus",
    {
      method: "query",
      auth: "optional-did",
      handler: reader.handleGetReadStatus,
    },
  ],
  [
    "app.standard-reader.getBookmarkStatus",
    {
      method: "query",
      auth: "optional-did",
      handler: reader.handleGetBookmarkStatus,
    },
  ],
  [
    "app.standard-reader.getRecommendStatus",
    {
      method: "query",
      auth: "optional-did",
      handler: reader.handleGetRecommendStatus,
    },
  ],
  [
    "app.standard-reader.getSaved",
    { method: "query", auth: "optional-did", handler: reader.handleGetSaved },
  ],
  [
    "app.standard-reader.getReadingHistory",
    {
      method: "query",
      auth: "optional-did",
      handler: reader.handleGetReadingHistory,
    },
  ],
  [
    "app.standard-reader.getLikes",
    { method: "query", auth: "optional-did", handler: reader.handleGetLikes },
  ],

  // Write procedures — repo records on the user's PDS
  [
    "app.standard-reader.followPublication",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.subscription],
      handler: writes.handleFollowPublication,
    },
  ],
  [
    "app.standard-reader.unfollowPublication",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.subscription],
      handler: writes.handleUnfollowPublication,
    },
  ],
  [
    "app.standard-reader.subscribeLabeler",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.labelerSubscription],
      handler: writes.handleSubscribeLabeler,
    },
  ],
  [
    "app.standard-reader.unsubscribeLabeler",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.labelerSubscription],
      handler: writes.handleUnsubscribeLabeler,
    },
  ],
  [
    "app.standard-reader.recommendDocument",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.recommend],
      handler: writes.handleRecommendDocument,
    },
  ],
  [
    "app.standard-reader.unrecommendDocument",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.recommend],
      handler: writes.handleUnrecommendDocument,
    },
  ],
  [
    "app.standard-reader.markRead",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.read],
      handler: writes.handleMarkRead,
    },
  ],
  [
    "app.standard-reader.markUnread",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.read],
      handler: writes.handleMarkUnread,
    },
  ],
  [
    "app.standard-reader.markAllRead",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.read],
      handler: writes.handleMarkAllRead,
    },
  ],
  [
    "app.standard-reader.markPublicationAllRead",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.read],
      handler: writes.handleMarkPublicationAllRead,
    },
  ],
  [
    "app.standard-reader.bookmarkDocument",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.bookmark],
      handler: writes.handleBookmarkDocument,
    },
  ],
  [
    "app.standard-reader.unbookmarkDocument",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.bookmark],
      handler: writes.handleUnbookmarkDocument,
    },
  ],
  [
    "app.standard-reader.createList",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.list],
      handler: writes.handleCreateList,
    },
  ],
  [
    "app.standard-reader.updateList",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.list],
      handler: writes.handleUpdateList,
    },
  ],
  [
    "app.standard-reader.deleteList",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.list],
      handler: writes.handleDeleteList,
    },
  ],
  [
    "app.standard-reader.saveList",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.listSave],
      handler: writes.handleSaveList,
    },
  ],
  [
    "app.standard-reader.unsaveList",
    {
      method: "procedure",
      auth: "required",
      scopes: [XRPC_WRITE_SCOPES.listSave],
      handler: writes.handleUnsaveList,
    },
  ],
]);

export function parseXrpcNsid(pathname: string): string | null {
  const prefix = "/xrpc/";
  if (!pathname.startsWith(prefix)) return null;
  const nsid = pathname.slice(prefix.length).replace(/\/+$/, "");
  return nsid.length > 0 ? decodeURIComponent(nsid) : null;
}
