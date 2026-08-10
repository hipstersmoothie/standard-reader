import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appviewDid } from "#/server/xrpc/config";

import { appviewDidClient } from "./discovery";

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

describe("appviewDidClient", () => {
  it("keeps the host's dots, like the server-side DID", () => {
    expect(appviewDidClient()).toBe("did:web:standard-reader.app");
  });

  it("agrees with the DID the service actually publishes", () => {
    // The docs page renders this value as the DID callers paste into
    // `atproto-proxy`. If it drifts from `appviewDid()`, we hand developers a
    // DID that does not resolve to us.
    expect(appviewDidClient()).toBe(appviewDid());
  });
});
