import { describe, expect, it } from "vitest";

import { commentLink } from "./comment-permalink";

const POST_URI = "at://did:plc:example/pub.leaflet.comment/3mqsc4nqyj22u";

describe("commentLink", () => {
  it("uses the platform permalink when the source built one", () => {
    expect(
      commentLink({
        postUri: POST_URI,
        postUrl: "https://bsky.app/profile/did:plc:example/post/abc",
      }),
    ).toEqual({
      href: "https://bsky.app/profile/did:plc:example/post/abc",
      native: true,
    });
  });

  it("falls back to the record viewer so no card renders unlinked", () => {
    expect(commentLink({ postUri: POST_URI, postUrl: "" })).toEqual({
      href: `https://pdsls.dev/${POST_URI}`,
      native: false,
    });
    expect(commentLink({ postUri: POST_URI, postUrl: "   " }).native).toBe(
      false,
    );
  });
});
