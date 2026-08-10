import { describe, expect, it } from "vitest";

import { buildPayload, notificationTag, truncate } from "./fan-out";

const BASE = {
  did: "did:plc:author",
  title: "The quiet part of the network",
  description: null,
  publicationUri: "at://did:plc:pub/site.standard.publication/abc123",
  publicationName: "The Standard Review",
  authorDisplayName: "Alice Example",
  authorHandle: "alice.example.com",
};

describe("truncate", () => {
  it("leaves short strings alone, trimmed", () => {
    expect(truncate("  Hello  ", 40)).toBe("Hello");
  });

  it("cuts at a word boundary when there is a close one", () => {
    const result = truncate("the quick brown fox jumps over", 20);
    expect(result).toBe("the quick brown fox…");
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("hard-cuts when the only boundary is too far back", () => {
    // No space near the limit, so a word-boundary cut would throw away most of
    // the string. Better to cut mid-word than to show almost nothing.
    const result = truncate("a supercalifragilisticexpialidocious word", 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.startsWith("a supercal")).toBe(true);
  });

  it("never exceeds the limit", () => {
    for (const max of [10, 25, 80, 160]) {
      const result = truncate("x ".repeat(300), max);
      expect(result.length).toBeLessThanOrEqual(max);
    }
  });
});

describe("notificationTag", () => {
  it("keys on the publication when there is one", () => {
    const tag = notificationTag(BASE.publicationUri, BASE.did);
    expect(tag.startsWith("sr:")).toBe(true);
    expect(tag).toContain("abc123");
  });

  it("falls back to the author for a publication-less post", () => {
    expect(notificationTag(null, "did:plc:author")).toBe("sr:did:plc:author");
  });

  it("stays within the push services' tag budget", () => {
    const long = `at://did:plc:${"x".repeat(200)}/site.standard.publication/${"y".repeat(200)}`;
    expect(notificationTag(long, BASE.did).length).toBeLessThanOrEqual(35);
  });

  it("gives two posts from one publication the same tag, so they collapse", () => {
    expect(notificationTag(BASE.publicationUri, "did:plc:a")).toBe(
      notificationTag(BASE.publicationUri, "did:plc:b"),
    );
  });
});

describe("buildPayload", () => {
  const url = "https://standard-reader.app/a/did%3Aplc%3Aauthor/xyz";

  it("labels the source in the title and bodies with the post", () => {
    const payload = buildPayload(BASE, url);
    expect(payload.title).toBe("New Post: The Standard Review");
    expect(payload.body).toBe("The quiet part of the network");
    expect(payload.url).toBe(url);
  });

  it("falls back to the author when the post has no publication", () => {
    const payload = buildPayload(
      { ...BASE, publicationName: null, publicationUri: null },
      url,
    );
    expect(payload.title).toBe("New Post: Alice Example");
  });

  it("falls back to the handle when there is no display name", () => {
    const payload = buildPayload(
      {
        ...BASE,
        authorDisplayName: null,
        publicationName: null,
        publicationUri: null,
      },
      url,
    );
    expect(payload.title).toBe("New Post: @alice.example.com");
  });

  it("still produces something showable with no names at all", () => {
    // The service worker must show a notification on every push — iOS revokes
    // the subscription otherwise — so an empty payload is not an option.
    const payload = buildPayload(
      {
        ...BASE,
        authorDisplayName: null,
        authorHandle: null,
        publicationName: null,
        publicationUri: null,
      },
      url,
    );
    expect(payload.title).toBe("New Post: Standard Reader");
  });

  it("uses the description when a document has no title", () => {
    const payload = buildPayload(
      { ...BASE, title: "", description: "A short note about nothing" },
      url,
    );
    expect(payload.body).toBe("A short note about nothing");
  });

  it("leaves the body to the service worker when the post has no text", () => {
    // An empty body is deliberate: the service worker fills it with generic
    // copy, which is what keeps every push showing something.
    const payload = buildPayload(
      { ...BASE, description: null, title: "" },
      url,
    );
    expect(payload.title).toBe("New Post: The Standard Review");
    expect(payload.body).toBe("");
  });

  it("keeps the prefixed title inside the title budget", () => {
    // The prefix shares the cap with the source, so a very long publication
    // name must not push the whole line past it.
    const payload = buildPayload(
      { ...BASE, publicationName: "p".repeat(200) },
      url,
    );
    expect(payload.title.startsWith("New Post: ")).toBe(true);
    expect(payload.title.length).toBeLessThanOrEqual(80);
  });

  it("keeps the payload small enough to encrypt under the 4KB cap", () => {
    const payload = buildPayload(
      {
        ...BASE,
        description: "d".repeat(5000),
        publicationName: "p".repeat(5000),
        title: "t".repeat(5000),
      },
      url,
    );
    expect(JSON.stringify(payload).length).toBeLessThan(1000);
  });
});
