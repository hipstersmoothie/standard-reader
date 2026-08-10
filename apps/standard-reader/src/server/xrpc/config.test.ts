import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { APPVIEW_SERVICE_ID, appviewAudience, appviewDid } from "./config";

const originalPublicUrl = process.env.PUBLIC_URL;

beforeEach(() => {
  process.env.PUBLIC_URL = "https://standard-reader.app";
});

afterEach(() => {
  if (originalPublicUrl === undefined) {
    delete process.env.PUBLIC_URL;
  } else {
    process.env.PUBLIC_URL = originalPublicUrl;
  }
});

describe("appviewDid", () => {
  it("embeds the host with its dots intact", () => {
    // Regression: the host used to be spelled `standard-reader:app`, which per
    // the did:web spec names the host `standard-reader` with a path segment
    // `app`. Every PDS-proxied call failed to resolve us.
    expect(appviewDid()).toBe("did:web:standard-reader.app");
  });

  it("matches the DID document's own location", () => {
    // Self-consistency is what resolvers check: fetching the document named by
    // this DID must yield a document whose `id` is this DID.
    const host = appviewDid().slice("did:web:".length);
    expect(`https://${host}/.well-known/did.json`).toBe(
      "https://standard-reader.app/.well-known/did.json",
    );
  });

  it("tracks a non-production public URL", () => {
    process.env.PUBLIC_URL = "https://pr-42.up.railway.app";
    expect(appviewDid()).toBe("did:web:pr-42.up.railway.app");
  });
});

describe("appviewAudience", () => {
  it("is the did#fragment service reference", () => {
    expect(appviewAudience()).toBe(
      `did:web:standard-reader.app#${APPVIEW_SERVICE_ID}`,
    );
  });
});
