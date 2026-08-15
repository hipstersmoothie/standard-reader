import { Pool } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  APPVIEW_SERVICE_ID,
  appviewAudience,
  appviewDid,
  appviewServiceEndpoint,
} from "./config";

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

describe("appviewServiceEndpoint", () => {
  it("is a bare origin with no path", () => {
    // Regression: publishing `…/xrpc` here made every PDS-proxied call fail
    // with 502 UpstreamFailure — the PDS hands this value verbatim to undici
    // as the dispatch origin (appending /xrpc/<nsid> itself), and undici
    // rejects an origin whose pathname isn't `/`.
    expect(appviewServiceEndpoint()).toBe("https://standard-reader.app");
    expect(new URL(appviewServiceEndpoint()).pathname).toBe("/");
  });

  it("is accepted by undici as a dispatch origin, exactly as a PDS uses it", () => {
    // @atproto/pds `pipethrough` passes the DID document's serviceEndpoint
    // verbatim to its undici agent as the request origin. Run the same
    // constructor a PDS runs so this can never silently regress.
    const pool = new Pool(appviewServiceEndpoint());
    void pool.close();
    expect(() => new Pool("https://standard-reader.app/xrpc")).toThrow(
      "invalid url",
    );
  });
});

describe("appviewAudience", () => {
  it("is the did#fragment service reference", () => {
    expect(appviewAudience()).toBe(
      `did:web:standard-reader.app#${APPVIEW_SERVICE_ID}`,
    );
  });
});
