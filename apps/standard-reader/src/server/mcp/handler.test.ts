import { beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit, RATE_LIMITS } from "#/server/rate-limit-policy";

import { handleMcpRequest } from "./handler";

beforeEach(() => {
  // The discovery pointer is built from the public URL, and the assertions
  // below check its exact value.
  process.env.PUBLIC_URL = "http://127.0.0.1:3000";
});

function mcpRequest(ip: string, method = "POST"): Request {
  return new Request("http://127.0.0.1:3000/mcp", {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    ...(method === "POST"
      ? { body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }
      : {}),
  });
}

describe("/mcp", () => {
  it("challenges an unauthenticated request with a discovery pointer", async () => {
    const response = await handleMcpRequest(mcpRequest("203.0.113.20"));

    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    // This header is the whole discovery entry point — without the
    // `resource_metadata` pointer a client has nothing to go on.
    expect(challenge).toContain("Bearer");
    expect(challenge).toContain(
      'resource_metadata="http://127.0.0.1:3000/.well-known/' +
        'oauth-protected-resource/mcp"',
    );
  });

  it("answers preflight with the headers the MCP transport needs", async () => {
    const response = await handleMcpRequest(
      mcpRequest("203.0.113.21", "OPTIONS"),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "Mcp-Session-Id",
    );
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "WWW-Authenticate",
    );
  });

  it("explains that GET and DELETE have nothing to do in stateless mode", async () => {
    const response = await handleMcpRequest(mcpRequest("203.0.113.22", "GET"));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("refuses a flood before looking the token up", async () => {
    const ip = "203.0.113.23";
    for (let index = 0; index < RATE_LIMITS.mcpIp.limit; index += 1) {
      checkRateLimit("mcpIp", `ip:${ip}`);
    }

    // No Authorization header, so reaching a 401 would mean the guard ran too
    // late; the point is that it runs before any database work.
    const response = await handleMcpRequest(mcpRequest(ip));

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/rate limit/i);
  });
});
