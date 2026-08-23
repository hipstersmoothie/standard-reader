import { describe, expect, it } from "vitest";

import {
  buildFollowAnchorSnippet,
  buildFollowEmbedSnippet,
  estimateFollowEmbedHeight,
  followEmbedIframeId,
  followEmbedUrl,
  followLoginUrl,
  followPageUrl,
  followSubjectName,
} from "./author-embed";
import { EMBED_RESIZE_MESSAGE } from "./embed-snippet";

const BASE = "https://example.test";
const DID = "did:plc:abc123";

describe("followEmbedUrl", () => {
  it("defaults to landscape and opts into portrait by search param", () => {
    expect(followEmbedUrl({ did: DID, baseUrl: BASE })).toBe(
      `${BASE}/embed/follow/${DID}`,
    );
    expect(
      followEmbedUrl({ did: DID, layout: "portrait", baseUrl: BASE }),
    ).toBe(`${BASE}/embed/follow/${DID}?layout=portrait`);
  });

  it("tolerates a trailing slash on the base url", () => {
    expect(followEmbedUrl({ did: DID, baseUrl: `${BASE}/` })).toBe(
      `${BASE}/embed/follow/${DID}`,
    );
  });
});

describe("followPageUrl / followLoginUrl", () => {
  it("points the login at the follow page with the follow scope intent", () => {
    expect(followPageUrl({ did: DID, baseUrl: BASE })).toBe(
      `${BASE}/follow/${DID}`,
    );

    const login = new URL(followLoginUrl({ did: DID, baseUrl: BASE }));
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("redirect")).toBe(`/follow/${DID}`);
    expect(login.searchParams.get("intent")).toBe("follow");
  });
});

describe("followEmbedIframeId", () => {
  it("strips a DID down to id-safe characters", () => {
    expect(followEmbedIframeId(DID)).toBe("sr-follow-didplcabc123");
  });

  it("falls back rather than emitting a dangling id", () => {
    expect(followEmbedIframeId(":::")).toBe("sr-follow-embed");
  });
});

describe("followSubjectName", () => {
  it("prefers the display name, then the handle", () => {
    expect(followSubjectName({ displayName: "Ada", handle: "ada.test" })).toBe(
      "Ada",
    );
    expect(followSubjectName({ displayName: "  ", handle: "ada.test" })).toBe(
      "ada.test",
    );
    expect(followSubjectName({})).toBe("this author");
  });
});

describe("estimateFollowEmbedHeight", () => {
  it("gives portrait more room than landscape for the same account", () => {
    const subject = { displayName: "Ada", handle: "ada.test" };
    expect(estimateFollowEmbedHeight(subject, "portrait")).toBeGreaterThan(
      estimateFollowEmbedHeight(subject, "landscape"),
    );
  });

  it("adds room for the bio, which only portrait renders", () => {
    const bare = { displayName: "Ada", handle: "ada.test" };
    const withBio = { ...bare, description: "Writes about looms." };
    expect(estimateFollowEmbedHeight(withBio, "portrait")).toBeGreaterThan(
      estimateFollowEmbedHeight(bare, "portrait"),
    );
    // Landscape hides the dek, so the bio must not change its height.
    expect(estimateFollowEmbedHeight(withBio, "landscape")).toBe(
      estimateFollowEmbedHeight(bare, "landscape"),
    );
  });
});

describe("buildFollowEmbedSnippet", () => {
  const snippet = buildFollowEmbedSnippet({
    did: DID,
    displayName: "Ada",
    handle: "ada.test",
    baseUrl: BASE,
  });

  it("wires the resize script to the iframe it ships with", () => {
    const iframeId = followEmbedIframeId(DID);
    expect(snippet).toContain(`id="${iframeId}"`);
    expect(snippet).toContain(`getElementById("${iframeId}")`);
    expect(snippet).toContain(EMBED_RESIZE_MESSAGE);
  });

  it("points at the embed route and titles the frame", () => {
    expect(snippet).toContain(`src="${BASE}/embed/follow/${DID}"`);
    expect(snippet).toContain('title="Follow Ada"');
  });

  it("escapes a display name that would otherwise break the title attribute", () => {
    expect(
      buildFollowEmbedSnippet({
        did: DID,
        displayName: '"><script>alert(1)</script>',
        baseUrl: BASE,
      }),
    ).not.toContain("<script>alert(1)</script>");
  });
});

describe("buildFollowAnchorSnippet", () => {
  it("links to the follow flow with a readable label", () => {
    expect(
      buildFollowAnchorSnippet({
        did: DID,
        displayName: "Ada",
        handle: "ada.test",
        baseUrl: BASE,
      }),
    ).toBe(`<a href="${BASE}/follow/${DID}">Follow Ada</a>`);
  });

  it("escapes the label", () => {
    expect(
      buildFollowAnchorSnippet({
        did: DID,
        displayName: "A & B",
        baseUrl: BASE,
      }),
    ).toBe(`<a href="${BASE}/follow/${DID}">Follow A &amp; B</a>`);
  });
});
