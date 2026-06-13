import type { loadApiDocsFixtures } from "./fixtures";

import { resolveHandleExampleFromFixtures } from "./fixture-defaults";

export type ApiDocsAuthClass = "none" | "required" | "optional-did";

export type ApiDocsCatalogEntry = {
  nsid: string;
  method: "query" | "procedure";
  section: string;
  description: string;
  auth: ApiDocsAuthClass;
  status: "shipped" | "planned";
  params: Array<{ name: string; type: string; required?: boolean }>;
  example: {
    autoRun: boolean;
    params?:
      | Record<string, string>
      | ((
          fixtures: ReturnType<typeof loadApiDocsFixtures>,
        ) => Record<string, string>);
    body?:
      | Record<string, unknown>
      | ((
          fixtures: ReturnType<typeof loadApiDocsFixtures>,
        ) => Record<string, unknown>);
  };
};

function q(
  nsid: string,
  section: string,
  description: string,
  auth: ApiDocsAuthClass,
  params: ApiDocsCatalogEntry["params"],
  example: ApiDocsCatalogEntry["example"],
): ApiDocsCatalogEntry {
  return {
    nsid,
    method: "query",
    section,
    description,
    auth,
    status: "shipped",
    params,
    example,
  };
}

function p(
  nsid: string,
  section: string,
  description: string,
  params: ApiDocsCatalogEntry["params"],
  example: ApiDocsCatalogEntry["example"],
): ApiDocsCatalogEntry {
  return {
    nsid,
    method: "procedure",
    section,
    description,
    auth: "required",
    status: "shipped",
    params,
    example: { ...example, autoRun: false },
  };
}

export const API_DOCS_CATALOG: Array<ApiDocsCatalogEntry> = [
  // Public queries
  q(
    "app.standard-reader.resolveUrl",
    "Public queries",
    "Match a web page URL to an indexed standard.site article or publication.",
    "none",
    [
      { name: "url", type: "uri" },
      { name: "urls", type: "uri[]" },
      { name: "did", type: "did" },
    ],
    {
      autoRun: true,
      params: (f) => ({ url: f.resolveUrl }),
    },
  ),
  q(
    "app.standard-reader.resolveHandle",
    "Public queries",
    "Resolve an AT Proto handle, domain, or DID to publication previews.",
    "none",
    [{ name: "handle", type: "string", required: true }],
    {
      autoRun: true,
      params: (f) => ({ handle: resolveHandleExampleFromFixtures(f) }),
    },
  ),
  q(
    "app.standard-reader.searchPublications",
    "Public queries",
    "Full-text search over indexed publications.",
    "none",
    [
      { name: "q", type: "string", required: true },
      { name: "limit", type: "integer" },
      { name: "cursor", type: "string" },
    ],
    {
      autoRun: true,
      params: (f) => ({ q: f.searchQuery, limit: "5" }),
    },
  ),
  q(
    "app.standard-reader.searchDocuments",
    "Public queries",
    "Full-text search over indexed articles.",
    "none",
    [
      { name: "q", type: "string", required: true },
      { name: "limit", type: "integer" },
      { name: "cursor", type: "string" },
    ],
    {
      autoRun: true,
      params: (f) => ({ q: f.searchQuery, limit: "5" }),
    },
  ),
  q(
    "app.standard-reader.getPublication",
    "Public queries",
    "Fetch a single publication profile with owner identity and aggregate stats.",
    "none",
    [{ name: "publication", type: "at-uri", required: true }],
    {
      autoRun: true,
      params: (f) => ({ publication: f.publicationUri }),
    },
  ),
  q(
    "app.standard-reader.getDocument",
    "Public queries",
    "Fetch a single article card metadata and aggregate stats (no full body).",
    "none",
    [{ name: "document", type: "at-uri", required: true }],
    {
      autoRun: true,
      params: (f) => ({ document: f.documentUri }),
    },
  ),
  q(
    "app.standard-reader.getPublications",
    "Public queries",
    "Browse the publication directory with topic filter, sort, and cursor pagination.",
    "none",
    [
      { name: "topic", type: "string" },
      { name: "sort", type: "string" },
      { name: "limit", type: "integer" },
      { name: "cursor", type: "string" },
      { name: "q", type: "string" },
    ],
    { autoRun: true, params: { limit: "6", sort: "readers" } },
  ),

  // Directory & feeds
  q(
    "app.standard-reader.getLatestFeed",
    "Directory & feeds",
    "Chronological feed of indexed articles with optional filter.",
    "none",
    [
      { name: "filter", type: "string" },
      { name: "limit", type: "integer" },
      { name: "cursor", type: "string" },
      { name: "did", type: "did" },
    ],
    { autoRun: true, params: { filter: "all", limit: "5" } },
  ),
  q(
    "app.standard-reader.getTrendingPublications",
    "Directory & feeds",
    "Ranked list of trending discover-eligible publications.",
    "none",
    [{ name: "limit", type: "integer" }],
    { autoRun: true, params: { limit: "6" } },
  ),
  q(
    "app.standard-reader.getTrendingDocuments",
    "Directory & feeds",
    "Ranked list of trending articles across the network.",
    "none",
    [
      { name: "limit", type: "integer" },
      { name: "scope", type: "string" },
    ],
    { autoRun: true, params: { limit: "6" } },
  ),
  q(
    "app.standard-reader.getTagFeed",
    "Directory & feeds",
    "Articles or publications carrying a given tag.",
    "none",
    [
      { name: "tag", type: "string", required: true },
      { name: "view", type: "string" },
      { name: "sort", type: "string" },
      { name: "limit", type: "integer" },
      { name: "cursor", type: "string" },
    ],
    {
      autoRun: true,
      params: (f) => ({ tag: f.tag, view: "articles", limit: "5" }),
    },
  ),
  q(
    "app.standard-reader.getAuthor",
    "Directory & feeds",
    "Author profile for a DID with aggregate stats.",
    "none",
    [{ name: "did", type: "did", required: true }],
    {
      autoRun: true,
      params: (f) => ({ did: f.readerDid }),
    },
  ),
  q(
    "app.standard-reader.getAuthorPublications",
    "Directory & feeds",
    "Publications owned by a DID with cursor pagination.",
    "none",
    [
      { name: "did", type: "did", required: true },
      { name: "limit", type: "integer" },
      { name: "cursor", type: "string" },
    ],
    {
      autoRun: true,
      params: (f) => ({ did: f.readerDid, limit: "5" }),
    },
  ),
  q(
    "app.standard-reader.getList",
    "Directory & feeds",
    "Public metadata and member publications for an app.standard-reader.list AT-URI.",
    "none",
    [{ name: "list", type: "at-uri", required: true }],
    {
      autoRun: true,
      params: (f) => ({ list: f.listUri }),
    },
  ),
  q(
    "app.standard-reader.getListFeed",
    "Directory & feeds",
    "Chronological article feed across all publications in a list.",
    "none",
    [
      { name: "list", type: "at-uri", required: true },
      { name: "limit", type: "integer" },
      { name: "cursor", type: "string" },
    ],
    {
      autoRun: true,
      params: (f) => ({ list: f.listUri, limit: "5" }),
    },
  ),
  q(
    "app.standard-reader.getDocumentContext",
    "Directory & feeds",
    "Deferred reading-view context: related articles, recents, social proof.",
    "none",
    [{ name: "document", type: "at-uri", required: true }],
    {
      autoRun: true,
      params: (f) => ({ document: f.documentUri }),
    },
  ),

  // Personalized feeds
  q(
    "app.standard-reader.getHomeFeed",
    "Personalized feeds",
    "Signed-in home page critical path: featured lead and latest rows.",
    "required",
    [{ name: "scope", type: "string" }],
    { autoRun: false, params: { scope: "subscriptions" } },
  ),
  q(
    "app.standard-reader.getRecommendedPublications",
    "Personalized feeds",
    "Personalized publication recommendations for the authenticated user.",
    "required",
    [{ name: "limit", type: "integer" }],
    { autoRun: false, params: { limit: "6" } },
  ),
  q(
    "app.standard-reader.getFollowedByPeopleYouFollow",
    "Personalized feeds",
    "Publications followed by Bluesky accounts the caller follows.",
    "required",
    [{ name: "limit", type: "integer" }],
    { autoRun: false, params: { limit: "6" } },
  ),

  // Reader state
  q(
    "app.standard-reader.getFollowStatus",
    "Reader state",
    "Whether the subject reader subscribes to a publication.",
    "optional-did",
    [
      { name: "did", type: "did" },
      { name: "publication", type: "at-uri", required: true },
    ],
    {
      autoRun: true,
      params: (f) => ({ did: f.readerDid, publication: f.publicationUri }),
    },
  ),
  q(
    "app.standard-reader.getReadStatus",
    "Reader state",
    "Whether the subject reader has read a document.",
    "optional-did",
    [
      { name: "did", type: "did" },
      { name: "document", type: "at-uri", required: true },
    ],
    {
      autoRun: true,
      params: (f) => ({ did: f.readerDid, document: f.documentUri }),
    },
  ),
  q(
    "app.standard-reader.getBookmarkStatus",
    "Reader state",
    "Whether the subject reader bookmarked a document.",
    "optional-did",
    [
      { name: "did", type: "did" },
      { name: "document", type: "at-uri", required: true },
    ],
    {
      autoRun: true,
      params: (f) => ({ did: f.readerDid, document: f.documentUri }),
    },
  ),
  q(
    "app.standard-reader.getRecommendStatus",
    "Reader state",
    "Whether the subject reader liked a document.",
    "optional-did",
    [
      { name: "did", type: "did" },
      { name: "document", type: "at-uri", required: true },
    ],
    {
      autoRun: true,
      params: (f) => ({ did: f.readerDid, document: f.documentUri }),
    },
  ),
  q(
    "app.standard-reader.getSaved",
    "Reader state",
    "Subject reader save queue with hydrated document rows.",
    "optional-did",
    [
      { name: "did", type: "did" },
      { name: "limit", type: "integer" },
      { name: "cursor", type: "string" },
    ],
    {
      autoRun: true,
      params: (f) => ({ did: f.readerDid, limit: "5" }),
    },
  ),
  q(
    "app.standard-reader.getReadingHistory",
    "Reader state",
    "Subject reader reading history.",
    "optional-did",
    [
      { name: "did", type: "did" },
      { name: "limit", type: "integer" },
      { name: "cursor", type: "string" },
    ],
    {
      autoRun: true,
      params: (f) => ({ did: f.readerDid, limit: "5" }),
    },
  ),
  q(
    "app.standard-reader.getLikes",
    "Reader state",
    "Subject reader liked articles.",
    "optional-did",
    [
      { name: "did", type: "did" },
      { name: "limit", type: "integer" },
      { name: "cursor", type: "string" },
    ],
    {
      autoRun: true,
      params: (f) => ({ did: f.readerDid, limit: "5" }),
    },
  ),

  // Write procedures
  p(
    "app.standard-reader.followPublication",
    "Write procedures",
    "Subscribe to a site.standard.publication.",
    [{ name: "publication", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ publication: f.publicationUri }),
    },
  ),
  p(
    "app.standard-reader.unfollowPublication",
    "Write procedures",
    "Remove a publication subscription.",
    [{ name: "publication", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ publication: f.publicationUri }),
    },
  ),
  p(
    "app.standard-reader.recommendDocument",
    "Write procedures",
    "Like an article on the network.",
    [{ name: "document", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ document: f.documentUri }),
    },
  ),
  p(
    "app.standard-reader.unrecommendDocument",
    "Write procedures",
    "Remove a network like from an article.",
    [{ name: "document", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ document: f.documentUri }),
    },
  ),
  p(
    "app.standard-reader.markRead",
    "Write procedures",
    "Mark an article as read.",
    [{ name: "document", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ document: f.documentUri }),
    },
  ),
  p(
    "app.standard-reader.markUnread",
    "Write procedures",
    "Mark an article as unread.",
    [{ name: "document", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ document: f.documentUri }),
    },
  ),
  p(
    "app.standard-reader.bookmarkDocument",
    "Write procedures",
    "Save an article for later.",
    [{ name: "document", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ document: f.documentUri }),
    },
  ),
  p(
    "app.standard-reader.unbookmarkDocument",
    "Write procedures",
    "Remove an article from the save queue.",
    [{ name: "document", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ document: f.documentUri }),
    },
  ),
  p(
    "app.standard-reader.saveList",
    "Write procedures",
    "Add another reader publication list to this app.",
    [{ name: "list", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ list: f.listUri }),
    },
  ),
  p(
    "app.standard-reader.unsaveList",
    "Write procedures",
    "Remove a saved list from this app.",
    [{ name: "list", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ list: f.listUri }),
    },
  ),
  p(
    "app.standard-reader.markAllRead",
    "Write procedures",
    "Mark all unread articles in the effective follow set as read.",
    [],
    { autoRun: false, body: {} },
  ),
  p(
    "app.standard-reader.markPublicationAllRead",
    "Write procedures",
    "Mark all unread articles from one publication as read.",
    [{ name: "publication", type: "at-uri", required: true }],
    {
      autoRun: false,
      body: (f) => ({ publication: f.publicationUri }),
    },
  ),
  p(
    "app.standard-reader.createList",
    "Write procedures",
    "Create a new publication list.",
    [
      { name: "name", type: "string", required: true },
      { name: "description", type: "string" },
      { name: "publications", type: "at-uri[]", required: true },
    ],
    {
      autoRun: false,
      body: (f) => ({
        name: "Example list",
        publications: [f.publicationUri],
      }),
    },
  ),
  p(
    "app.standard-reader.updateList",
    "Write procedures",
    "Replace an existing publication list owned by the actor.",
    [
      { name: "rkey", type: "string", required: true },
      { name: "name", type: "string", required: true },
      { name: "publications", type: "at-uri[]", required: true },
    ],
    {
      autoRun: false,
      body: (f) => ({
        rkey: "abc",
        name: "Updated list",
        publications: [f.publicationUri],
      }),
    },
  ),
  p(
    "app.standard-reader.deleteList",
    "Write procedures",
    "Delete a publication list owned by the actor.",
    [{ name: "rkey", type: "string", required: true }],
    { autoRun: false, body: { rkey: "abc" } },
  ),
];

export function catalogEntryByNsid(
  nsid: string,
): ApiDocsCatalogEntry | undefined {
  return API_DOCS_CATALOG.find((entry) => entry.nsid === nsid);
}

export function autoRunnableCatalogEntries(): Array<ApiDocsCatalogEntry> {
  return API_DOCS_CATALOG.filter(
    (entry) => entry.status === "shipped" && entry.example.autoRun,
  );
}

export const API_DOCS_SECTIONS = [
  "Public queries",
  "Directory & feeds",
  "Personalized feeds",
  "Reader state",
  "Write procedures",
] as const;
