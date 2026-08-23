import { describe, expect, it } from "vitest";

import type { HappyViewConfig } from "./config";
import { buildHappyViewRequest } from "./request";

const config: HappyViewConfig = {
  url: "https://spaces.example",
  clientKey: "hvc_key",
  clientSecret: "hvs_secret",
  spaceType: "app.standard-newsletter.list",
};

describe("buildHappyViewRequest", () => {
  it("builds a DPoP POST with client key and JSON body, flagged for signing", () => {
    const req = buildHappyViewRequest({
      config,
      nsid: "com.atproto.space.createRecord",
      method: "POST",
      body: { space: "at://x", collection: "c", record: { a: 1 } },
      auth: { kind: "dpop" },
    });
    expect(req.url).toBe(
      "https://spaces.example/xrpc/com.atproto.space.createRecord",
    );
    expect(req.method).toBe("POST");
    expect(req.headers["x-client-key"]).toBe("hvc_key");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.headers.authorization).toBeUndefined();
    expect(JSON.parse(req.body ?? "{}")).toEqual({
      space: "at://x",
      collection: "c",
      record: { a: 1 },
    });
    expect(req.needsDpop).toBe(true);
  });

  it("builds a Bearer GET with query params and no body", () => {
    const req = buildHappyViewRequest({
      config,
      nsid: "com.atproto.space.listRepoOps",
      method: "GET",
      params: { space: "at://x/space/t/s", limit: 50, cursor: undefined },
      auth: { kind: "bearer", credential: "cred123" },
    });
    expect(req.url).toBe(
      "https://spaces.example/xrpc/com.atproto.space.listRepoOps?space=at%3A%2F%2Fx%2Fspace%2Ft%2Fs&limit=50",
    );
    expect(req.headers.authorization).toBe("Bearer cred123");
    expect(req.headers["content-type"]).toBeUndefined();
    expect(req.body).toBeUndefined();
    expect(req.needsDpop).toBe(false);
  });

  it("omits undefined/null query params entirely", () => {
    const req = buildHappyViewRequest({
      config,
      nsid: "x.y",
      method: "GET",
      params: { a: undefined, b: null, c: "keep" },
      auth: { kind: "dpop" },
    });
    expect(req.url).toBe("https://spaces.example/xrpc/x.y?c=keep");
  });

  it("attaches X-Client-Secret only when includeSecret is set", () => {
    const without = buildHappyViewRequest({
      config,
      nsid: "x.y",
      method: "POST",
      body: {},
      auth: { kind: "dpop" },
    });
    expect(without.headers["x-client-secret"]).toBeUndefined();

    const withSecret = buildHappyViewRequest({
      config,
      nsid: "x.y",
      method: "POST",
      body: {},
      auth: { kind: "dpop" },
      includeSecret: true,
    });
    expect(withSecret.headers["x-client-secret"]).toBe("hvs_secret");
  });
});
