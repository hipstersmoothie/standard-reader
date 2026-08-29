// GENERATED FILE — do not edit.
// Regenerate with: pnpm --filter standard-reader xrpc:example-plan
//
// Every XRPC method Standard Reader serves, with the example arguments its
// public API docs advertise. `{{token}}` values are resolved from the runner's
// fixtures (see src/fixtures.ts).

import type { XrpcExampleMethod } from "./types";

export const XRPC_EXAMPLE_PLAN: Array<XrpcExampleMethod> = [
  {
    auth: "required",
    body: {
      document: "{{documentUri}}",
    },
    description: "Save an article for later.",
    kind: "procedure",
    nsid: "app.standard-reader.bookmarkDocument",
    role: "primary",
    section: "Write procedures",
    undo: "app.standard-reader.unbookmarkDocument",
  },
  {
    auth: "required",
    body: {
      name: "Example list",
      publications: ["{{publicationUri}}"],
    },
    description: "Create a new publication list.",
    kind: "procedure",
    nsid: "app.standard-reader.createList",
    role: "chained",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      rkey: "abc",
    },
    description: "Delete a publication list owned by the actor.",
    kind: "procedure",
    nsid: "app.standard-reader.deleteList",
    role: "chained",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      publication: "{{publicationUri}}",
    },
    description: "Subscribe to a site.standard.publication.",
    kind: "procedure",
    nsid: "app.standard-reader.followPublication",
    role: "primary",
    section: "Write procedures",
    undo: "app.standard-reader.unfollowPublication",
  },
  {
    auth: "required",
    body: {
      did: "{{readerDid}}",
    },
    description: "Follow another user by DID.",
    kind: "procedure",
    nsid: "app.standard-reader.followUser",
    role: "primary",
    section: "Write procedures",
    undo: "app.standard-reader.unfollowUser",
  },
  {
    auth: "none",
    description:
      "Author profile for a DID with aggregate stats and a first page of their publications.",
    kind: "query",
    nsid: "app.standard-reader.getAuthor",
    params: {
      did: "{{readerDid}}",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "none",
    description:
      "Every article a DID has a byline on — their own posts plus documents they are credited on elsewhere (featured in) — newest first, with cursor pagination.",
    kind: "query",
    nsid: "app.standard-reader.getAuthorPosts",
    params: {
      did: "{{readerDid}}",
      limit: "5",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "none",
    description: "Publications owned by a DID with cursor pagination.",
    kind: "query",
    nsid: "app.standard-reader.getAuthorPublications",
    params: {
      did: "{{readerDid}}",
      limit: "5",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "optional-did",
    description: "Whether the subject reader bookmarked a document.",
    kind: "query",
    nsid: "app.standard-reader.getBookmarkStatus",
    params: {
      did: "{{readerDid}}",
      document: "{{documentUri}}",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "none",
    description:
      "Fetch a single article: card metadata, aggregate stats, and the renderable body (content) ready for the renderers.",
    kind: "query",
    nsid: "app.standard-reader.getDocument",
    params: {
      document: "{{documentUri}}",
    },
    role: "primary",
    section: "Public queries",
  },
  {
    auth: "none",
    description:
      "Deferred reading-view context: related articles, recents, social proof.",
    kind: "query",
    nsid: "app.standard-reader.getDocumentContext",
    params: {
      document: "{{documentUri}}",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "required",
    description:
      "Publications followed by Bluesky accounts the caller follows.",
    kind: "query",
    nsid: "app.standard-reader.getFollowedByPeopleYouFollow",
    params: {
      limit: "6",
    },
    role: "primary",
    section: "Personalized feeds",
  },
  {
    auth: "optional-did",
    description: "Whether the subject reader subscribes to a publication.",
    kind: "query",
    nsid: "app.standard-reader.getFollowStatus",
    params: {
      did: "{{readerDid}}",
      publication: "{{publicationUri}}",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "required",
    description:
      "Signed-in home page critical path: featured lead and latest rows.",
    kind: "query",
    nsid: "app.standard-reader.getHomeFeed",
    params: {
      scope: "subscriptions",
    },
    role: "primary",
    section: "Personalized feeds",
  },
  {
    auth: "optional-did",
    description:
      "Resolve one labeler by DID or handle, with the calling reader's subscription state.",
    kind: "query",
    nsid: "app.standard-reader.getLabeler",
    params: {
      actor: "{{labelerDid}}",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "optional-did",
    description:
      "Labelers the calling reader is subscribed to, each resolved to a labeler view.",
    kind: "query",
    nsid: "app.standard-reader.getLabelers",
    params: {
      did: "{{readerDid}}",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "optional-did",
    description:
      "Labels on a set of subjects, from the calling reader's subscribed labelers.",
    kind: "query",
    nsid: "app.standard-reader.getLabels",
    params: {
      uris: "{{documentUri}}",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "none",
    description: "Chronological feed of indexed articles with optional filter.",
    kind: "query",
    nsid: "app.standard-reader.getLatestFeed",
    params: {
      filter: "all",
      limit: "5",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "optional-did",
    description: "Subject reader liked articles.",
    kind: "query",
    nsid: "app.standard-reader.getLikes",
    params: {
      did: "{{readerDid}}",
      limit: "5",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "none",
    description:
      "Public metadata and member publications for an app.standard-reader.list AT-URI.",
    kind: "query",
    nsid: "app.standard-reader.getList",
    params: {
      list: "{{listUri}}",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "none",
    description:
      "Chronological article feed across all publications in a list.",
    kind: "query",
    nsid: "app.standard-reader.getListFeed",
    params: {
      list: "{{listUri}}",
      limit: "5",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "none",
    description:
      "Fetch a single publication profile with owner identity and aggregate stats.",
    kind: "query",
    nsid: "app.standard-reader.getPublication",
    params: {
      publication: "{{publicationUri}}",
    },
    role: "primary",
    section: "Public queries",
  },
  {
    auth: "none",
    description:
      "Page through a single publication's articles, newest first, with cursor pagination.",
    kind: "query",
    nsid: "app.standard-reader.getPublicationDocuments",
    params: {
      publication: "{{publicationUri}}",
      limit: "5",
    },
    role: "primary",
    section: "Public queries",
  },
  {
    auth: "none",
    description:
      "Browse the publication directory with topic filter, sort, and cursor pagination.",
    kind: "query",
    nsid: "app.standard-reader.getPublications",
    params: {
      limit: "6",
      sort: "readers",
    },
    role: "primary",
    section: "Public queries",
  },
  {
    auth: "none",
    description:
      "Readers subscribed to a publication, most recently subscribed first, with cursor pagination.",
    kind: "query",
    nsid: "app.standard-reader.getPublicationSubscribers",
    params: {
      publication: "{{publicationUri}}",
      limit: "10",
    },
    role: "primary",
    section: "Public queries",
  },
  {
    auth: "optional-did",
    description: "Subject reader reading history.",
    kind: "query",
    nsid: "app.standard-reader.getReadingHistory",
    params: {
      did: "{{readerDid}}",
      limit: "5",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "optional-did",
    description: "Whether the subject reader has read a document.",
    kind: "query",
    nsid: "app.standard-reader.getReadStatus",
    params: {
      did: "{{readerDid}}",
      document: "{{documentUri}}",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "required",
    description:
      "Personalized publication recommendations for the authenticated user.",
    kind: "query",
    nsid: "app.standard-reader.getRecommendedPublications",
    params: {
      limit: "6",
    },
    role: "primary",
    section: "Personalized feeds",
  },
  {
    auth: "optional-did",
    description: "Whether the subject reader liked a document.",
    kind: "query",
    nsid: "app.standard-reader.getRecommendStatus",
    params: {
      did: "{{readerDid}}",
      document: "{{documentUri}}",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "optional-did",
    description: "Subject reader save queue with hydrated document rows.",
    kind: "query",
    nsid: "app.standard-reader.getSaved",
    params: {
      did: "{{readerDid}}",
      limit: "5",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "none",
    description: "Articles or publications carrying a given tag.",
    kind: "query",
    nsid: "app.standard-reader.getTagFeed",
    params: {
      tag: "{{tag}}",
      view: "articles",
      limit: "5",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "none",
    description: "Ranked list of trending articles across the network.",
    kind: "query",
    nsid: "app.standard-reader.getTrendingDocuments",
    params: {
      limit: "6",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "none",
    description: "Ranked list of trending discover-eligible publications.",
    kind: "query",
    nsid: "app.standard-reader.getTrendingPublications",
    params: {
      limit: "6",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "optional-did",
    description: "Whether the subject reader follows a user.",
    kind: "query",
    nsid: "app.standard-reader.getUserFollowStatus",
    params: {
      did: "{{readerDid}}",
      subject: "{{readerDid}}",
    },
    role: "primary",
    section: "Reader state",
  },
  {
    auth: "none",
    description:
      "Every publication list authored by a DID, each with its member publications resolved.",
    kind: "query",
    nsid: "app.standard-reader.getUserLists",
    params: {
      did: "{{readerDid}}",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "none",
    description:
      "Publications a DID subscribes to, most recently subscribed first, with cursor pagination.",
    kind: "query",
    nsid: "app.standard-reader.getUserSubscriptions",
    params: {
      did: "{{readerDid}}",
      limit: "5",
    },
    role: "primary",
    section: "Directory & feeds",
  },
  {
    auth: "required",
    body: {},
    description:
      "Mark all unread articles in the effective follow set as read.",
    kind: "procedure",
    nsid: "app.standard-reader.markAllRead",
    role: "destructive",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      publication: "{{publicationUri}}",
    },
    description: "Mark all unread articles from one publication as read.",
    kind: "procedure",
    nsid: "app.standard-reader.markPublicationAllRead",
    role: "destructive",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      document: "{{documentUri}}",
    },
    description: "Mark an article as read.",
    kind: "procedure",
    nsid: "app.standard-reader.markRead",
    role: "primary",
    section: "Write procedures",
    undo: "app.standard-reader.markUnread",
  },
  {
    auth: "required",
    body: {
      document: "{{documentUri}}",
    },
    description: "Mark an article as unread.",
    kind: "procedure",
    nsid: "app.standard-reader.markUnread",
    role: "undo",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      document: "{{documentUri}}",
    },
    description: "Recommend an article on the network.",
    kind: "procedure",
    nsid: "app.standard-reader.recommendDocument",
    role: "primary",
    section: "Write procedures",
    undo: "app.standard-reader.unrecommendDocument",
  },
  {
    auth: "none",
    description:
      "Resolve an AT Proto handle, domain, or DID to publication previews.",
    kind: "query",
    nsid: "app.standard-reader.resolveHandle",
    params: {
      handle: "rockstar.l7y.media",
    },
    role: "primary",
    section: "Public queries",
  },
  {
    auth: "none",
    description:
      "Match a web page URL to an indexed standard.site article or publication.",
    kind: "query",
    nsid: "app.standard-reader.resolveUrl",
    params: {
      url: "{{resolveUrl}}",
    },
    role: "primary",
    section: "Public queries",
  },
  {
    auth: "required",
    body: {
      list: "{{listUri}}",
    },
    description: "Add another reader publication list to this app.",
    kind: "procedure",
    nsid: "app.standard-reader.saveList",
    role: "primary",
    section: "Write procedures",
    undo: "app.standard-reader.unsaveList",
  },
  {
    auth: "none",
    description: "Full-text search over indexed articles.",
    kind: "query",
    nsid: "app.standard-reader.searchDocuments",
    params: {
      q: "{{searchQuery}}",
      limit: "5",
    },
    role: "primary",
    section: "Public queries",
  },
  {
    auth: "none",
    description: "Full-text search over indexed publications.",
    kind: "query",
    nsid: "app.standard-reader.searchPublications",
    params: {
      q: "{{searchQuery}}",
      limit: "5",
    },
    role: "primary",
    section: "Public queries",
  },
  {
    auth: "required",
    body: {
      labeler: "{{labelerDid}}",
    },
    description: "Subscribe the calling reader to a labeler service.",
    kind: "procedure",
    nsid: "app.standard-reader.subscribeLabeler",
    role: "primary",
    section: "Write procedures",
    undo: "app.standard-reader.unsubscribeLabeler",
  },
  {
    auth: "required",
    body: {
      document: "{{documentUri}}",
    },
    description: "Remove an article from the save queue.",
    kind: "procedure",
    nsid: "app.standard-reader.unbookmarkDocument",
    role: "undo",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      publication: "{{publicationUri}}",
    },
    description: "Remove a publication subscription.",
    kind: "procedure",
    nsid: "app.standard-reader.unfollowPublication",
    role: "undo",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      did: "{{readerDid}}",
    },
    description: "Unfollow a user by DID.",
    kind: "procedure",
    nsid: "app.standard-reader.unfollowUser",
    role: "undo",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      document: "{{documentUri}}",
    },
    description: "Remove your recommendation from an article on the network.",
    kind: "procedure",
    nsid: "app.standard-reader.unrecommendDocument",
    role: "undo",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      list: "{{listUri}}",
    },
    description: "Remove a saved list from this app.",
    kind: "procedure",
    nsid: "app.standard-reader.unsaveList",
    role: "undo",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      labeler: "{{labelerDid}}",
    },
    description: "Unsubscribe the calling reader from a labeler service.",
    kind: "procedure",
    nsid: "app.standard-reader.unsubscribeLabeler",
    role: "undo",
    section: "Write procedures",
  },
  {
    auth: "required",
    body: {
      rkey: "abc",
      name: "Updated list",
      publications: ["{{publicationUri}}"],
    },
    description: "Replace an existing publication list owned by the actor.",
    kind: "procedure",
    nsid: "app.standard-reader.updateList",
    role: "chained",
    section: "Write procedures",
  },
];
