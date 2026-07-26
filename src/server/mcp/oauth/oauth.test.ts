import { createHash, randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { isAcceptableResource } from "./config";
import { hashToken, narrowScope, secretsMatch, verifyPkce } from "./crypto";
import { OAuthError, oauthErrorResponse } from "./errors";
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from "./metadata";

beforeEach(() => {
  process.env.PUBLIC_URL = "https://standard-reader.app";
});

describe("PKCE", () => {
  it("accepts the verifier its challenge was derived from", () => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it("rejects any other verifier", () => {
    const challenge = createHash("sha256").update("right").digest("base64url");
    expect(verifyPkce("wrong", challenge)).toBe(false);
  });
});

describe("secret comparison", () => {
  it("matches identical secrets and rejects different ones", () => {
    expect(secretsMatch(hashToken("a"), hashToken("a"))).toBe(true);
    expect(secretsMatch(hashToken("a"), hashToken("b"))).toBe(false);
  });

  it("does not throw on differing lengths", () => {
    expect(secretsMatch("short", "much-longer-value")).toBe(false);
  });
});

describe("scope narrowing", () => {
  const supported = ["mcp:read", "mcp:write"];

  it("falls back to the default when nothing was requested", () => {
    expect(narrowScope(undefined, supported, "mcp:read")).toEqual({
      scope: "mcp:read",
      unsupported: [],
    });
  });

  it("keeps only what was asked for", () => {
    expect(narrowScope("mcp:read", supported, "mcp:read mcp:write")).toEqual({
      scope: "mcp:read",
      unsupported: [],
    });
  });

  it("reports anything it does not recognise", () => {
    const result = narrowScope("mcp:read admin", supported, "mcp:read");
    expect(result.scope).toBe("mcp:read");
    expect(result.unsupported).toEqual(["admin"]);
  });
});

describe("resource audience binding", () => {
  it("accepts this MCP server, with or without a trailing slash", () => {
    expect(isAcceptableResource("https://standard-reader.app/mcp")).toBe(true);
    expect(isAcceptableResource("https://standard-reader.app/mcp/")).toBe(true);
  });

  it("rejects another host's MCP server", () => {
    expect(isAcceptableResource("https://evil.example/mcp")).toBe(false);
  });

  it("rejects another path on this host", () => {
    expect(isAcceptableResource("https://standard-reader.app/xrpc")).toBe(
      false,
    );
  });

  it("rejects garbage", () => {
    expect(isAcceptableResource("not-a-url")).toBe(false);
  });
});

describe("discovery documents", () => {
  it("points the protected resource at this authorization server", () => {
    const prm = protectedResourceMetadata();
    expect(prm.resource).toBe("https://standard-reader.app/mcp");
    expect(prm.authorization_servers).toEqual(["https://standard-reader.app"]);
  });

  it("advertises PKCE-only authorization-code and refresh grants", () => {
    const meta = authorizationServerMetadata();
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(meta.grant_types_supported).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
    expect(meta.response_types_supported).toEqual(["code"]);
    expect(meta.registration_endpoint).toBe(
      "https://standard-reader.app/api/mcp/register",
    );
  });
});

describe("error responses", () => {
  it("renders an OAuth error with its code and status", async () => {
    const response = oauthErrorResponse(
      new OAuthError("invalid_grant", "Code expired."),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_grant",
      error_description: "Code expired.",
    });
  });

  it("challenges with WWW-Authenticate on a 401", () => {
    const response = oauthErrorResponse(
      new OAuthError("invalid_client", "Nope."),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "invalid_client",
    );
  });

  it("never leaks an internal message", async () => {
    const response = oauthErrorResponse(new Error("connection string leaked"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error_description: string };
    expect(body.error_description).toBe("Internal error");
  });

  it("marks token responses uncacheable", () => {
    const response = oauthErrorResponse(
      new OAuthError("invalid_grant", "Nope."),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
