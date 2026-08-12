import { beforeEach, describe, expect, it, vi } from "vitest";

import type { db } from "#/db/index.server";
import type * as schema from "#/db/schema";

const DID = "did:plc:example";
const RKEY = "3lzexample";
const DOCUMENT_URI = `at://${DID}/site.standard.document/${RKEY}`;
const CANONICAL_URL = "https://blog.example/some-article";
const APP_URL = `https://standard-reader.app/a/${DID}/${RKEY}`;
const ANNOUNCEMENT_URI = `at://${DID}/app.bsky.feed.post/announcement`;

const getPostBacklinksForTarget = vi.fn();
const getPosts = vi.fn();
const getDirectRepliesToPost = vi.fn();
const fetchMarginNotesForUrls = vi.fn();
const fetchNotesForDocument = vi.fn();
const fetchLeafletCommentsForDocument = vi.fn();

vi.mock("#/server/atproto/constellation", () => ({
  getPostBacklinksForTarget: (target: string) =>
    getPostBacklinksForTarget(target) as unknown,
}));
vi.mock("#/server/atproto/bsky-posts", () => ({
  getPosts: (uris: Array<string>) => getPosts(uris) as unknown,
  getDirectRepliesToPost: (uri: string) =>
    getDirectRepliesToPost(uri) as unknown,
  inferAuthorAnnouncementPostUri: () => Promise.resolve(null),
}));
vi.mock("#/server/atproto/margin-notes", () => ({
  fetchMarginNotesForUrls: (urls: Array<string>) =>
    fetchMarginNotesForUrls(urls) as unknown,
}));
vi.mock("#/server/pckt/notes", () => ({
  fetchNotesForDocument: (uri: string) => fetchNotesForDocument(uri) as unknown,
}));
vi.mock("#/server/leaflet/comments", () => ({
  fetchLeafletCommentsForDocument: (uri: string) =>
    fetchLeafletCommentsForDocument(uri) as unknown,
}));
vi.mock("#/server/reader/quote-shares", () => ({
  listQuoteSharesForDocument: () => Promise.resolve([]),
}));
vi.mock("#/lib/public-url", () => ({
  getCanonicalPublicUrl: () => "https://standard-reader.app",
  getPublicUrlClient: () => "https://standard-reader.app",
}));

/** Minimal stand-in for the one `select(...).limit(1)` chain the module runs. */
function fakeDb(row: Record<string, unknown> | null): typeof db {
  const chain = {
    select: () => chain,
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(row ? [row] : []),
  };
  return chain as unknown as typeof db;
}

const fakeSchema = {
  documents: {
    did: "did",
    rkey: "rkey",
    path: "path",
    canonicalUrl: "canonical_url",
    uri: "uri",
    bskyPostUri: "bsky_post_uri",
    publishedAt: "published_at",
    contentJson: "content_json",
    publicationUri: "publication_uri",
  },
  publications: { uri: "uri", url: "url" },
} as unknown as typeof schema;

const documentRow = {
  did: DID,
  rkey: RKEY,
  path: "/some-article",
  canonicalUrl: CANONICAL_URL,
  publicationUrl: "https://blog.example",
  bskyPostUri: ANNOUNCEMENT_URI,
  publishedAt: new Date("2026-07-15T12:00:00.000Z"),
  contentJson: null,
};

function backlink(rkey: string, did = "did:plc:commenter") {
  return { did, collection: "app.bsky.feed.post", rkey };
}

function postView({
  uri,
  isReply = false,
}: {
  uri: string;
  isReply?: boolean;
}) {
  return {
    uri,
    cid: "cid",
    author: {
      did: "did:plc:commenter",
      handle: "commenter.example",
      displayName: null,
      avatar: null,
    },
    text: "a comment",
    facets: null,
    replyCount: 0,
    likeCount: 0,
    indexedAt: "2026-07-15T13:00:00.000Z",
    isReply,
  };
}

async function importModule() {
  vi.resetModules();
  return import("./document-comments");
}

describe("document comment counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMarginNotesForUrls.mockResolvedValue([]);
    fetchNotesForDocument.mockResolvedValue([]);
    fetchLeafletCommentsForDocument.mockResolvedValue([]);
    getDirectRepliesToPost.mockResolvedValue([]);
  });

  /**
   * Regression test: the badge count used to be summed from separate per-source
   * Constellation totals, so it drifted from the list — here it would have
   * counted the same post once per link target, plus the announcement post and
   * an off-thread reply that the list drops.
   */
  it("counts exactly the comments the Discussion renders", async () => {
    const sharedUri = "at://did:plc:commenter/app.bsky.feed.post/shared";
    const offThreadUri = "at://did:plc:commenter/app.bsky.feed.post/offthread";

    getPostBacklinksForTarget.mockImplementation((target: string) => {
      // The same post links both the canonical URL and the in-app article URL,
      // and the author's announcement post links the article too.
      if (target === CANONICAL_URL) {
        return Promise.resolve([
          backlink("shared"),
          backlink("offthread"),
          backlink("announcement", DID),
        ]);
      }
      if (target === APP_URL) return Promise.resolve([backlink("shared")]);
      return Promise.resolve([]);
    });
    getPosts.mockResolvedValue([
      postView({ uri: sharedUri }),
      postView({ uri: offThreadUri, isReply: true }),
    ]);

    const { countDocumentComments, fetchDocumentComments } =
      await importModule();
    const dbClient = fakeDb(documentRow);

    const comments = await fetchDocumentComments(
      dbClient,
      fakeSchema,
      DOCUMENT_URI,
    );
    const count = await countDocumentComments(
      dbClient,
      fakeSchema,
      DOCUMENT_URI,
    );

    expect(comments.comments.map((comment) => comment.postUri)).toEqual([
      sharedUri,
    ]);
    expect(count).toBe(comments.comments.length);
    expect(comments.hiddenByBlocks).toBe(0);
  });

  it("counts merged non-Bluesky sources as rendered items", async () => {
    getPostBacklinksForTarget.mockResolvedValue([]);
    getPosts.mockResolvedValue([]);
    fetchLeafletCommentsForDocument.mockResolvedValue([
      {
        source: "leaflet",
        kind: "link",
        postUri: "at://did:plc:reader/pub.leaflet.comment/one",
        postUrl: "https://leaflet.pub/thread",
        author: {
          did: "did:plc:reader",
          handle: null,
          displayName: null,
          avatarUrl: null,
        },
        commentary: "nice piece",
        commentaryFacets: null,
        quote: null,
        // Two replies live under this comment; they are folded in here rather
        // than counted as separate items.
        replyCount: 2,
        indexedAt: "2026-07-15T14:00:00.000Z",
      },
    ]);

    const { countDocumentComments, fetchDocumentComments } =
      await importModule();
    const dbClient = fakeDb(documentRow);

    const comments = await fetchDocumentComments(
      dbClient,
      fakeSchema,
      DOCUMENT_URI,
    );
    const count = await countDocumentComments(
      dbClient,
      fakeSchema,
      DOCUMENT_URI,
    );

    expect(comments.comments).toHaveLength(1);
    expect(count).toBe(1);
  });

  it("rebuilds the list on every request but holds the badge steady", async () => {
    const firstUri = "at://did:plc:commenter/app.bsky.feed.post/first";
    const secondUri = "at://did:plc:commenter/app.bsky.feed.post/second";

    getPostBacklinksForTarget.mockResolvedValue([backlink("first")]);
    getPosts.mockResolvedValue([postView({ uri: firstUri })]);

    const { countDocumentComments, fetchDocumentComments } =
      await importModule();
    const dbClient = fakeDb(documentRow);

    await fetchDocumentComments(dbClient, fakeSchema, DOCUMENT_URI);
    await expect(
      countDocumentComments(dbClient, fakeSchema, DOCUMENT_URI),
    ).resolves.toBe(1);

    // A new reply lands. The section picks it up immediately — it does not wait
    // for the cache entry to expire — and the badge follows from that build.
    getPostBacklinksForTarget.mockResolvedValue([
      backlink("first"),
      backlink("second"),
    ]);
    getPosts.mockResolvedValue([
      postView({ uri: firstUri }),
      postView({ uri: secondUri }),
    ]);

    const reloaded = await fetchDocumentComments(
      dbClient,
      fakeSchema,
      DOCUMENT_URI,
    );

    expect(reloaded.comments).toHaveLength(2);
    await expect(
      countDocumentComments(dbClient, fakeSchema, DOCUMENT_URI),
    ).resolves.toBe(2);
  });

  it("serves badge counts from cache instead of rebuilding per request", async () => {
    getPostBacklinksForTarget.mockResolvedValue([backlink("only")]);
    getPosts.mockResolvedValue([
      postView({ uri: "at://did:plc:commenter/app.bsky.feed.post/only" }),
    ]);

    const { countDocumentComments, fetchDocumentComments } =
      await importModule();
    const dbClient = fakeDb(documentRow);

    await fetchDocumentComments(dbClient, fakeSchema, DOCUMENT_URI);
    const buildsAfterSection = getPosts.mock.calls.length;

    for (let i = 0; i < 3; i++) {
      await expect(
        countDocumentComments(dbClient, fakeSchema, DOCUMENT_URI),
      ).resolves.toBe(1);
    }

    expect(getPosts.mock.calls).toHaveLength(buildsAfterSection);
  });

  /**
   * Regression test: a collection assembled in-app has no page of its own, so
   * ingest resolves `canonicalUrl` to the bare publication root (no `path`).
   * That must not become a Constellation backlink target — an exact-URL
   * lookup on the bare root would match every post that links to the
   * publication's site at all, not just this document.
   */
  it("does not use a bare publication-root canonical URL as a comment target", async () => {
    const collectionRow = {
      ...documentRow,
      path: null,
      canonicalUrl: "https://blog.example",
      publicationUrl: "https://blog.example",
      bskyPostUri: null,
    };

    getPostBacklinksForTarget.mockImplementation((target: string) => {
      // Some unrelated post links the publication's homepage in general.
      if (target === "https://blog.example") {
        return Promise.resolve([backlink("unrelated")]);
      }
      return Promise.resolve([]);
    });
    getPosts.mockResolvedValue([
      postView({ uri: "at://did:plc:commenter/app.bsky.feed.post/unrelated" }),
    ]);

    const { fetchDocumentComments } = await importModule();
    const dbClient = fakeDb(collectionRow);

    const comments = await fetchDocumentComments(
      dbClient,
      fakeSchema,
      DOCUMENT_URI,
    );

    expect(
      getPostBacklinksForTarget.mock.calls.map(([target]) => target),
    ).not.toContain("https://blog.example");
    expect(comments.comments).toHaveLength(0);
  });

  it("reports 0 for a document with no discussion", async () => {
    getPostBacklinksForTarget.mockResolvedValue([]);
    getPosts.mockResolvedValue([]);

    const { countDocumentComments, fetchDocumentComments } =
      await importModule();
    const dbClient = fakeDb(documentRow);

    await fetchDocumentComments(dbClient, fakeSchema, DOCUMENT_URI);

    await expect(
      countDocumentComments(dbClient, fakeSchema, DOCUMENT_URI),
    ).resolves.toBe(0);
  });
});
