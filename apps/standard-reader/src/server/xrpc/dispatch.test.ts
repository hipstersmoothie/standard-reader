import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit, RATE_LIMITS } from "#/server/rate-limit-policy";

import { dispatchXrpc } from "./dispatch";
import {
  readJsonBody,
  xrpcProcedureRequest,
  xrpcQueryRequest,
} from "./test/helpers";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getXrpcDbContext: vi.fn(async () => ({
      db: {},
      schema: {},
      trackReadingEnabled: false,
    })),
  };
});

function requestFrom(nsid: string, ip: string): Request {
  const url = new URL(`http://127.0.0.1:3000/xrpc/${nsid}`);
  url.searchParams.set("q", "reader");
  return new Request(url, { headers: { "x-forwarded-for": ip } });
}

describe("dispatchXrpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers OPTIONS with CORS preflight", async () => {
    const response = await dispatchXrpc(
      new Request(
        "http://127.0.0.1:3000/xrpc/app.standard-reader.searchPublications",
        {
          method: "OPTIONS",
        },
      ),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "GET",
    );
  });

  it("rejects invalid XRPC paths", async () => {
    const response = await dispatchXrpc(
      new Request("http://127.0.0.1:3000/not-xrpc"),
    );
    expect(response.status).toBe(400);
    const body = await readJsonBody<{ error: string }>(response);
    expect(body.error).toBe("InvalidRequest");
  });

  it("rejects unknown NSIDs", async () => {
    const response = await dispatchXrpc(
      xrpcQueryRequest("app.standard-reader.notReal"),
    );
    expect(response.status).toBe(400);
    const body = await readJsonBody<{ message: string }>(response);
    expect(body.message).toMatch(/not found/i);
  });

  it("requires GET for queries", async () => {
    const response = await dispatchXrpc(
      new Request(
        "http://127.0.0.1:3000/xrpc/app.standard-reader.searchPublications?q=reader",
        { method: "POST" },
      ),
    );
    expect(response.status).toBe(400);
    const body = await readJsonBody<{ message: string }>(response);
    expect(body.message).toMatch(/GET/i);
  });

  it("requires POST for procedures", async () => {
    const response = await dispatchXrpc(
      xrpcQueryRequest("app.standard-reader.markRead", {
        document: "at://did:plc:ex/site.standard.document/abc",
      }),
    );
    expect(response.status).toBe(400);
    const body = await readJsonBody<{ message: string }>(response);
    expect(body.message).toMatch(/POST/i);
  });

  it("returns 401 with WWW-Authenticate when auth is required", async () => {
    const response = await dispatchXrpc(
      xrpcQueryRequest("app.standard-reader.getHomeFeed"),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    const body = await readJsonBody<{ error: string }>(response);
    expect(body.error).toBe("AuthenticationRequired");
  });

  it("returns 401 for write procedures without credentials", async () => {
    const response = await dispatchXrpc(
      xrpcProcedureRequest("app.standard-reader.followPublication", {
        publication: "at://did:plc:ex/site.standard.publication/abc",
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for missing required query params", async () => {
    const response = await dispatchXrpc(
      xrpcQueryRequest("app.standard-reader.searchPublications"),
    );
    expect(response.status).toBe(400);
    const body = await readJsonBody<{ message: string }>(response);
    expect(body.message).toMatch(/Missing required parameter: q/);
  });

  it("returns 401 before validating procedure bodies when auth is required", async () => {
    const response = await dispatchXrpc(
      new Request("http://127.0.0.1:3000/xrpc/app.standard-reader.markRead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "[]",
      }),
    );
    expect(response.status).toBe(401);
  });

  describe("rate limiting", () => {
    /**
     * Spend a policy's whole budget for one IP so the next request through
     * `dispatchXrpc` is the one that trips. Cheaper and far less brittle than
     * firing hundreds of requests at the dispatcher.
     */
    function exhaust(policy: "xrpcIp" | "xrpcQuery", ip: string): void {
      for (let index = 0; index < RATE_LIMITS[policy].limit; index += 1) {
        checkRateLimit(policy, `ip:${ip}`);
      }
    }

    it("refuses a flood from one IP before doing any work", async () => {
      const ip = "198.51.100.10";
      exhaust("xrpcIp", ip);

      const response = await dispatchXrpc(
        requestFrom("app.standard-reader.searchPublications", ip),
      );

      expect(response.status).toBe(429);
      expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(response.headers.get("RateLimit-Remaining")).toBe("0");
      const body = await readJsonBody<{ error: string }>(response);
      expect(body.error).toBe("RateLimitExceeded");
    });

    it("refuses a caller who has spent their per-method budget", async () => {
      const ip = "198.51.100.11";
      exhaust("xrpcQuery", ip);

      const response = await dispatchXrpc(
        requestFrom("app.standard-reader.searchPublications", ip),
      );

      expect(response.status).toBe(429);
      const body = await readJsonBody<{ error: string }>(response);
      expect(body.error).toBe("RateLimitExceeded");
    });

    it("reports the budget on error responses too, so a caller burning it on 400s can see", async () => {
      // Missing `q` — a 400 raised after the budget has been charged.
      const response = await dispatchXrpc(
        new Request(
          "http://127.0.0.1:3000/xrpc/app.standard-reader.searchPublications",
          { headers: { "x-forwarded-for": "198.51.100.13" } },
        ),
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("RateLimit-Limit")).toBe(
        String(RATE_LIMITS.xrpcQuery.limit),
      );
      expect(
        Number(response.headers.get("RateLimit-Remaining")),
      ).toBeGreaterThanOrEqual(0);
    });

    it("does not charge the per-caller budget when auth fails first", async () => {
      // `getHomeFeed` requires auth, so the request is rejected while resolving
      // credentials — before we know who to charge. The per-IP guard is what
      // covers that case, and it has already run.
      const response = await dispatchXrpc(
        requestFrom("app.standard-reader.getHomeFeed", "198.51.100.14"),
      );

      expect(response.status).toBe(401);
      expect(response.headers.get("RateLimit-Limit")).toBeNull();
    });

    it("keeps 429s readable cross-origin", async () => {
      const ip = "198.51.100.12";
      exhaust("xrpcIp", ip);

      const response = await dispatchXrpc(
        requestFrom("app.standard-reader.searchPublications", ip),
      );

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
        "Retry-After",
      );
    });
  });
});
