import { describe, expect, it } from "vitest";

import type { PublicationMentionMap } from "./publication-mentions";
import {
  actorLinkIdent,
  collectInlineMentionRefs,
  documentMentionKey,
  lookupActorMention,
  lookupDocumentMention,
  lookupPublicationMention,
  mentionUrlKey,
  normalizeMentionUrl,
  publicationMentionKey,
} from "./publication-mentions";

const NEWS_URI =
  "at://did:plc:b5qihcej3titzzr2iauzvrer/site.standard.publication/3m3lr2gg2d22r";
const NEWS_URL = "https://news.atproto.com.br";
// The same publication (Desmitificando) referenced by its pub.leaflet twin.
const BLOG_STANDARD_URI =
  "at://did:plc:b5qihcej3titzzr2iauzvrer/site.standard.publication/3lzczm4obbc23";
const LEAFLET_BLOG_URI =
  "at://did:plc:b5qihcej3titzzr2iauzvrer/pub.leaflet.publication/3lzczm4obbc23";

const novidades = {
  atUri: NEWS_URI,
  did: "did:plc:b5qihcej3titzzr2iauzvrer",
  rkey: "3m3lr2gg2d22r",
  name: "Novidades ATBrasil",
  iconUrl: "https://cdn.example/icon.png",
};
const mentions: PublicationMentionMap = {
  [NEWS_URI]: novidades,
  [mentionUrlKey(NEWS_URL)]: novidades,
};

describe("normalizeMentionUrl", () => {
  it("strips trailing slashes and whitespace to match stored publication URLs", () => {
    expect(normalizeMentionUrl("https://news.atproto.com.br/")).toBe(NEWS_URL);
    expect(normalizeMentionUrl(" https://news.atproto.com.br//")).toBe(
      NEWS_URL,
    );
  });
});

describe("collectInlineMentionRefs", () => {
  it("collects atMention publication AT-URIs and link URLs from nested list items", () => {
    // Shape mirrors the real record: a bold homepage link + a didMention.
    const content = {
      $type: "pub.leaflet.document",
      pages: [
        {
          $type: "pub.leaflet.pages.linearDocument",
          blocks: [
            {
              block: {
                $type: "pub.leaflet.blocks.unorderedList",
                children: [
                  {
                    content: {
                      $type: "pub.leaflet.blocks.text",
                      plaintext: "Novidades ATBrasil por @atproto.com.br",
                      facets: [
                        {
                          index: { byteStart: 0, byteEnd: 18 },
                          features: [
                            { $type: "pub.leaflet.richtext.facet#bold" },
                            {
                              $type: "pub.leaflet.richtext.facet#link",
                              uri: "https://news.atproto.com.br/",
                            },
                          ],
                        },
                        {
                          index: { byteStart: 23, byteEnd: 38 },
                          features: [
                            {
                              $type: "pub.leaflet.richtext.facet#link",
                              uri: "https://bsky.app/profile/atproto.com.br",
                            },
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              block: {
                $type: "pub.leaflet.blocks.text",
                plaintext: "Desmitificando ATProto",
                facets: [
                  {
                    index: { byteStart: 0, byteEnd: 22 },
                    features: [
                      {
                        // Leaflet references some pubs by their pub.leaflet
                        // twin — must normalize to the site.standard AT-URI.
                        $type: "pub.leaflet.richtext.facet#atMention",
                        atURI: LEAFLET_BLOG_URI,
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const refs = collectInlineMentionRefs(content);
    // The pub.leaflet twin is normalized to its site.standard AT-URI.
    expect(refs.publicationAtUris).toEqual([BLOG_STANDARD_URI]);
    expect(refs.publicationUrls).toContain("https://news.atproto.com.br/");
    // A `#link` to a Bluesky profile is a user reference, not a publication
    // homepage — it lands in actorLinks (by ident), not publicationUrls.
    expect(refs.publicationUrls).not.toContain(
      "https://bsky.app/profile/atproto.com.br",
    );
    expect(refs.actorLinks).toContain("atproto.com.br");
  });

  it("collects actor DIDs from didMention facets", () => {
    const refs = collectInlineMentionRefs({
      features: [
        {
          $type: "pub.leaflet.richtext.facet#didMention",
          did: "did:plc:actor1",
        },
      ],
    });
    expect(refs.actorDids).toEqual(["did:plc:actor1"]);
  });

  it("ignores atMentions that are not publications", () => {
    const refs = collectInlineMentionRefs({
      features: [
        {
          $type: "pub.leaflet.richtext.facet#atMention",
          atURI: "at://did:plc:x/app.bsky.feed.post/abc",
        },
      ],
    });
    expect(refs.publicationAtUris).toEqual([]);
    expect(refs.documentAtUris).toEqual([]);
  });

  it("collects document atMentions, normalizing the pub.leaflet twin", () => {
    const refs = collectInlineMentionRefs({
      features: [
        {
          $type: "pub.leaflet.richtext.facet#atMention",
          atURI: "at://did:plc:auth/pub.leaflet.document/3lzdlwt2i2s2i",
        },
      ],
    });
    expect(refs.documentAtUris).toEqual([
      "at://did:plc:auth/site.standard.document/3lzdlwt2i2s2i",
    ]);
    // A document atMention is not a publication.
    expect(refs.publicationAtUris).toEqual([]);
  });
});

describe("documentMentionKey", () => {
  it("normalizes pub.leaflet and site.standard document URIs to the canonical key", () => {
    const canonical = "at://did:plc:auth/site.standard.document/3lzdlwt2i2s2i";
    expect(
      documentMentionKey(
        "at://did:plc:auth/pub.leaflet.document/3lzdlwt2i2s2i",
      ),
    ).toBe(canonical);
    expect(documentMentionKey(canonical)).toBe(canonical);
  });

  it("returns null for non-document collections", () => {
    expect(
      documentMentionKey("at://did:plc:auth/site.standard.publication/x"),
    ).toBeNull();
    expect(documentMentionKey("https://example.com")).toBeNull();
  });
});

describe("lookupDocumentMention", () => {
  it("resolves an atMention against the document map", () => {
    const canonical = "at://did:plc:auth/site.standard.document/3lzdlwt2i2s2i";
    const documents = {
      [canonical]: {
        atUri: canonical,
        did: "did:plc:auth",
        rkey: "3lzdlwt2i2s2i",
        title: "Tutorial: Migrando de PDS",
        iconUrl: null,
      },
    };
    const hit = lookupDocumentMention(
      [
        {
          $type: "pub.leaflet.richtext.facet#atMention",
          atURI: "at://did:plc:auth/pub.leaflet.document/3lzdlwt2i2s2i",
        },
      ],
      documents,
    );
    expect(hit?.title).toBe("Tutorial: Migrando de PDS");
    expect(lookupDocumentMention([], documents)).toBeNull();
  });
});

describe("lookupActorMention", () => {
  it("resolves a didMention against the actor map", () => {
    const hit = lookupActorMention(
      [
        {
          $type: "pub.leaflet.richtext.facet#didMention",
          did: "did:plc:actor1",
        },
      ],
      {
        "did:plc:actor1": {
          did: "did:plc:actor1",
          handle: "alice.test",
          avatarUrl: "https://cdn.example/a.jpg",
        },
      },
    );
    expect(hit?.handle).toBe("alice.test");
  });
});

describe("publicationMentionKey", () => {
  it("normalizes a pub.leaflet.publication AT-URI to its site.standard twin", () => {
    expect(publicationMentionKey(LEAFLET_BLOG_URI)).toBe(BLOG_STANDARD_URI);
  });

  it("passes through a site.standard.publication AT-URI unchanged", () => {
    expect(publicationMentionKey(NEWS_URI)).toBe(NEWS_URI);
  });

  it("returns null for non-publication AT-URIs", () => {
    expect(
      publicationMentionKey("at://did:plc:x/app.bsky.feed.post/abc"),
    ).toBeNull();
  });
});

describe("lookupPublicationMention", () => {
  it("resolves a publication homepage link", () => {
    const hit = lookupPublicationMention(
      [
        { $type: "pub.leaflet.richtext.facet#bold" },
        {
          $type: "pub.leaflet.richtext.facet#link",
          uri: "https://news.atproto.com.br/",
        },
      ],
      mentions,
    );
    expect(hit?.name).toBe("Novidades ATBrasil");
  });

  it("resolves an atMention publication reference", () => {
    const hit = lookupPublicationMention(
      [{ $type: "pub.leaflet.richtext.facet#atMention", atURI: NEWS_URI }],
      mentions,
    );
    expect(hit?.atUri).toBe(NEWS_URI);
  });

  it("resolves an atMention that targets the pub.leaflet twin", () => {
    const map: PublicationMentionMap = {
      [BLOG_STANDARD_URI]: {
        atUri: BLOG_STANDARD_URI,
        did: "did:plc:b5qihcej3titzzr2iauzvrer",
        rkey: "3lzczm4obbc23",
        name: "Desmitificando ATProto",
        iconUrl: null,
      },
    };
    const hit = lookupPublicationMention(
      [
        {
          $type: "pub.leaflet.richtext.facet#atMention",
          atURI: LEAFLET_BLOG_URI,
        },
      ],
      map,
    );
    expect(hit?.name).toBe("Desmitificando ATProto");
  });

  it("returns null for links to unknown hosts", () => {
    const hit = lookupPublicationMention(
      [
        {
          $type: "pub.leaflet.richtext.facet#link",
          uri: "https://bsky.app/profile/atproto.com.br",
        },
      ],
      mentions,
    );
    expect(hit).toBeNull();
  });
});

describe("actorLinkIdent", () => {
  it("resolves a bare Bluesky profile link to the actor ident", () => {
    expect(actorLinkIdent("https://bsky.app/profile/alice.bsky.social")).toBe(
      "alice.bsky.social",
    );
    expect(actorLinkIdent("https://bsky.app/profile/did:plc:abc123")).toBe(
      "did:plc:abc123",
    );
  });

  it("keeps a Bluesky post link as-is (not a mention of its author)", () => {
    expect(
      actorLinkIdent("https://bsky.app/profile/alice.bsky.social/post/3abc123"),
    ).toBeNull();
    expect(
      actorLinkIdent("https://bsky.app/profile/did:plc:abc123/post/3abc123"),
    ).toBeNull();
  });

  it("ignores other profile sub-resources (lists, feeds)", () => {
    expect(
      actorLinkIdent("https://bsky.app/profile/alice.bsky.social/lists/xyz"),
    ).toBeNull();
    expect(
      actorLinkIdent("https://bsky.app/profile/alice.bsky.social/feed/xyz"),
    ).toBeNull();
  });

  it("resolves a relative in-app author path", () => {
    expect(actorLinkIdent("/u/did:plc:abc123")).toBe("did:plc:abc123");
    expect(actorLinkIdent("/u/alice.bsky.social")).toBe("alice.bsky.social");
  });
});
