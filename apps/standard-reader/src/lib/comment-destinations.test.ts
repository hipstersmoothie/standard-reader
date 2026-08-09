import { describe, expect, it } from "vitest";

import { BSKY_COMPOSE_CLIENTS } from "./bsky-clients";
import {
  bskyCommentDestinations,
  bskyCommentMode,
  platformCommentUrl,
  platformSupportsComments,
} from "./comment-destinations";

const POST_URI = "at://did:plc:abc123/app.bsky.feed.post/3ktest";
const READER_URL = "https://standard-reader.app/a/did:plc:abc123/entry";

describe("bskyCommentMode", () => {
  it("replies when the document carries a post ref", () => {
    expect(bskyCommentMode(POST_URI)).toBe("reply");
  });

  it("posts when there is no ref, or the ref isn't a Bluesky post", () => {
    expect(bskyCommentMode(null)).toBe("post");
    expect(bskyCommentMode("")).toBe("post");
    expect(
      bskyCommentMode("at://did:plc:abc123/site.standard.document/x"),
    ).toBe("post");
  });
});

describe("bskyCommentDestinations — reply mode", () => {
  const reply = bskyCommentDestinations({
    bskyPostUri: POST_URI,
    authorHandle: "author.example",
    readerUrl: READER_URL,
  });
  const byId = new Map(reply.map((d) => [d.id, d]));

  it("leads with Bluesky and opens the article's own post", () => {
    expect(reply[0].id).toBe("bluesky");
    expect(reply[0].url).toBe(
      "https://bsky.app/profile/did:plc:abc123/post/3ktest",
    );
  });

  it("includes clients that can only open a post, not compose one", () => {
    // Straight from the @aturi.to/waypoints catalog — these are reply-only.
    expect(byId.get("anisota")?.url).toContain("anisota.net");
    expect(byId.get("bluepy")?.url).toContain("bluepy.social");
  });

  it("includes clients the waypoints catalog doesn't list yet", () => {
    expect(byId.get("mu")?.url).toBe(
      "https://mu.social/profile/did:plc:abc123/post/3ktest",
    );
  });

  it("carries a vendored icon for the clients we know", () => {
    expect(byId.get("bluesky")?.iconUrl).toBe("/brand/clients/bluesky.png");
    expect(byId.get("deer")?.iconUrl).toBe("/brand/clients/deer.png");
  });

  it("offers no publication or dev-tool destinations", () => {
    for (const id of ["leaflet", "pdsls", "atptools", "margin", "tangled"]) {
      expect(byId.has(id)).toBe(false);
    }
  });

  it("lists every destination exactly once", () => {
    expect(new Set(reply.map((d) => d.id)).size).toBe(reply.length);
  });
});

describe("bskyCommentDestinations — post mode", () => {
  it("composes a post mentioning the author in every compose-capable client", () => {
    const posts = bskyCommentDestinations({
      bskyPostUri: null,
      authorHandle: "author.example",
      readerUrl: READER_URL,
    });

    expect(posts.map((d) => d.id)).toEqual(
      BSKY_COMPOSE_CLIENTS.map((c) => c.id),
    );
    const url = new URL(posts[0].url);
    expect(url.origin + url.pathname).toBe("https://bsky.app/intent/compose");
    expect(url.searchParams.get("text")).toBe(
      `@author.example\n\n${READER_URL}`,
    );
  });

  it("falls back to the bare link when the author has no handle", () => {
    const [first] = bskyCommentDestinations({
      bskyPostUri: null,
      authorHandle: null,
      readerUrl: READER_URL,
    });
    expect(new URL(first.url).searchParams.get("text")).toBe(READER_URL);
  });

  it("composes when the stored ref isn't a usable post URI", () => {
    const [first] = bskyCommentDestinations({
      bskyPostUri: "not-an-at-uri",
      authorHandle: "author.example",
      readerUrl: READER_URL,
    });
    expect(new URL(first.url).pathname).toBe("/intent/compose");
  });

  it("has nothing to offer without a post or a reader URL", () => {
    expect(
      bskyCommentDestinations({
        bskyPostUri: null,
        authorHandle: "author.example",
        readerUrl: null,
      }),
    ).toEqual([]);
  });
});

describe("platformCommentUrl", () => {
  const LEAFLET_FORMAT = "pub.leaflet.content";

  it("opens Leaflet's comment drawer, including on a custom domain", () => {
    expect(
      platformCommentUrl("leaflet", {
        canonicalUrl: "https://leaflet.pub/p/hello",
        contentFormat: LEAFLET_FORMAT,
      }),
    ).toBe("https://leaflet.pub/p/hello?interactionDrawer=comments");
    // Custom domain: identified by content format, not host.
    expect(
      platformCommentUrl("leaflet", {
        canonicalUrl: "https://words.example/hello",
        contentFormat: LEAFLET_FORMAT,
      }),
    ).toBe("https://words.example/hello?interactionDrawer=comments");
  });

  it("sends pckt readers to the post itself", () => {
    expect(
      platformCommentUrl("pckt", {
        canonicalUrl: "https://pckt.blog/p/hello",
        contentFormat: "blog.pckt.post",
      }),
    ).toBe("https://pckt.blog/p/hello");
  });

  it("has no destination for Offprint or an unknown platform", () => {
    expect(
      platformCommentUrl("offprint", {
        canonicalUrl: "https://offprint.app/x",
        contentFormat: null,
      }),
    ).toBeNull();
    expect(
      platformCommentUrl(null, {
        canonicalUrl: "https://example.com/x",
        contentFormat: null,
      }),
    ).toBeNull();
    expect(platformSupportsComments("offprint")).toBe(false);
    expect(platformSupportsComments("leaflet")).toBe(true);
  });

  it("has no destination without a canonical URL", () => {
    expect(
      platformCommentUrl("leaflet", {
        canonicalUrl: null,
        contentFormat: LEAFLET_FORMAT,
      }),
    ).toBeNull();
  });
});
