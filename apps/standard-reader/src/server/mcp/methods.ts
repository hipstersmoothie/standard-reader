/**
 * The `app.standard-reader.*` methods the MCP server exposes.
 *
 * Named constants rather than inline strings so a typo is a compile error at
 * the call site and a test failure against {@link XRPC_REGISTRY} — see
 * `methods.test.ts`, which asserts every entry here is a real registered
 * method with the method kind the tools assume.
 */
export const QUERY = {
  getAuthor: "app.standard-reader.getAuthor",
  getAuthorPosts: "app.standard-reader.getAuthorPosts",
  getAuthorPublications: "app.standard-reader.getAuthorPublications",
  getBookmarkStatus: "app.standard-reader.getBookmarkStatus",
  getDocument: "app.standard-reader.getDocument",
  getDocumentContext: "app.standard-reader.getDocumentContext",
  getFollowStatus: "app.standard-reader.getFollowStatus",
  getFollowedByPeopleYouFollow:
    "app.standard-reader.getFollowedByPeopleYouFollow",
  getHomeFeed: "app.standard-reader.getHomeFeed",
  getLatestFeed: "app.standard-reader.getLatestFeed",
  getLikes: "app.standard-reader.getLikes",
  getList: "app.standard-reader.getList",
  getListFeed: "app.standard-reader.getListFeed",
  getPublication: "app.standard-reader.getPublication",
  getPublicationDocuments: "app.standard-reader.getPublicationDocuments",
  getPublicationSubscribers: "app.standard-reader.getPublicationSubscribers",
  getPublications: "app.standard-reader.getPublications",
  getReadStatus: "app.standard-reader.getReadStatus",
  getReadingHistory: "app.standard-reader.getReadingHistory",
  getRecommendStatus: "app.standard-reader.getRecommendStatus",
  getRecommendedPublications: "app.standard-reader.getRecommendedPublications",
  getSaved: "app.standard-reader.getSaved",
  getTagFeed: "app.standard-reader.getTagFeed",
  getTrendingDocuments: "app.standard-reader.getTrendingDocuments",
  getTrendingPublications: "app.standard-reader.getTrendingPublications",
  getUserFollowStatus: "app.standard-reader.getUserFollowStatus",
  getUserLists: "app.standard-reader.getUserLists",
  getUserSubscriptions: "app.standard-reader.getUserSubscriptions",
  resolveHandle: "app.standard-reader.resolveHandle",
  resolveUrl: "app.standard-reader.resolveUrl",
  searchDocuments: "app.standard-reader.searchDocuments",
  searchPublications: "app.standard-reader.searchPublications",
} as const;

export const PROCEDURE = {
  bookmarkDocument: "app.standard-reader.bookmarkDocument",
  createList: "app.standard-reader.createList",
  deleteList: "app.standard-reader.deleteList",
  followPublication: "app.standard-reader.followPublication",
  followUser: "app.standard-reader.followUser",
  markAllRead: "app.standard-reader.markAllRead",
  markPublicationAllRead: "app.standard-reader.markPublicationAllRead",
  markRead: "app.standard-reader.markRead",
  markUnread: "app.standard-reader.markUnread",
  recommendDocument: "app.standard-reader.recommendDocument",
  saveList: "app.standard-reader.saveList",
  unbookmarkDocument: "app.standard-reader.unbookmarkDocument",
  unfollowPublication: "app.standard-reader.unfollowPublication",
  unfollowUser: "app.standard-reader.unfollowUser",
  unrecommendDocument: "app.standard-reader.unrecommendDocument",
  unsaveList: "app.standard-reader.unsaveList",
  updateList: "app.standard-reader.updateList",
} as const;
