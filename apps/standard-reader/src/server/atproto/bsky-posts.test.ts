import { afterEach, describe, expect, it, vi } from "vitest";

import { inferAuthorAnnouncementPostUri } from "./bsky-posts";

const DID = "did:plc:fip3nyk6tjo3senpq4ei2cxw";
const ARTICLE_URL = "https://example.com/some-article";
const PUBLISHED_AT = new Date("2026-07-15T12:00:00.000Z");

function feedPost({
  rkey,
  createdAt,
  replyCount = 0,
  linkUri,
}: {
  rkey: string;
  createdAt: string;
  replyCount?: number;
  linkUri?: string;
}) {
  return {
    post: {
      uri: `at://${DID}/app.bsky.feed.post/${rkey}`,
      cid: `cid-${rkey}`,
      author: { did: DID, handle: "author.example", displayName: null },
      record: {
        text: "hello",
        createdAt,
        ...(linkUri
          ? {
              facets: [
                {
                  features: [
                    { $type: "app.bsky.richtext.facet#link", uri: linkUri },
                  ],
                },
              ],
            }
          : {}),
      },
      replyCount,
      likeCount: 0,
      indexedAt: createdAt,
    },
  };
}

function mockFeedResponse(feed: Array<unknown>) {
  return {
    ok: true,
    json: async () => ({ feed }),
  } as Response;
}

describe("inferAuthorAnnouncementPostUri", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Regression test: a linkblog entry with no matching announcement post
  // previously fell back to the author's most-replied unrelated post in the
  // publish window, surfacing that post's replies as the document's
  // Discussion.
  it("does not fall back to an unrelated post just because it has many replies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFeedResponse([
          feedPost({
            rkey: "unrelated-popular",
            createdAt: "2026-07-14T12:00:00.000Z",
            replyCount: 200,
          }),
        ]),
      ),
    );

    const uri = await inferAuthorAnnouncementPostUri(DID, PUBLISHED_AT, [
      ARTICLE_URL,
    ]);

    expect(uri).toBeNull();
  });

  it("picks the post that actually links the article URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFeedResponse([
          feedPost({
            rkey: "unrelated-popular",
            createdAt: "2026-07-14T12:00:00.000Z",
            replyCount: 200,
          }),
          feedPost({
            rkey: "the-announcement",
            createdAt: "2026-07-15T13:00:00.000Z",
            replyCount: 1,
            linkUri: ARTICLE_URL,
          }),
        ]),
      ),
    );

    const uri = await inferAuthorAnnouncementPostUri(DID, PUBLISHED_AT, [
      ARTICLE_URL,
    ]);

    expect(uri).toBe(`at://${DID}/app.bsky.feed.post/the-announcement`);
  });
});
