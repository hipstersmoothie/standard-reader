import { describe, expect, it } from "vitest";

import { rateLimitHeaders } from "./rate-limit";
import {
  checkRateLimit,
  checkRateLimitByIp,
  RATE_LIMITS,
} from "./rate-limit-policy";

/** Unique per test so the module-level limiter's buckets never collide. */
let counter = 0;
function subject(): string {
  counter += 1;
  return `test-subject-${counter}-${process.pid}`;
}

describe("policy budgets", () => {
  it("keeps writes tighter than reads", () => {
    expect(RATE_LIMITS.xrpcProcedure.limit).toBeLessThan(
      RATE_LIMITS.xrpcQuery.limit,
    );
  });

  it("leaves the pre-auth IP guard above the per-caller budgets, so it only catches floods", () => {
    expect(RATE_LIMITS.xrpcIp.limit).toBeGreaterThan(
      RATE_LIMITS.xrpcQuery.limit,
    );
  });

  it("makes client registration the tightest budget on the OAuth surface", () => {
    expect(RATE_LIMITS.oauthRegister.limit).toBeLessThan(
      RATE_LIMITS.oauthToken.limit,
    );
  });
});

describe("checkRateLimit", () => {
  it("allows up to the limit, then refuses with a retry hint", () => {
    const key = subject();
    const limit = RATE_LIMITS.xrpcProcedure.limit;

    for (let index = 0; index < limit; index += 1) {
      expect(checkRateLimit("xrpcProcedure", key).allowed).toBe(true);
    }

    const blocked = checkRateLimit("xrpcProcedure", key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("counts down the remaining budget", () => {
    const key = subject();
    const first = checkRateLimit("xrpcQuery", key);
    const second = checkRateLimit("xrpcQuery", key);

    expect(first.limit).toBe(RATE_LIMITS.xrpcQuery.limit);
    expect(first.remaining).toBe(RATE_LIMITS.xrpcQuery.limit - 1);
    expect(second.remaining).toBe(RATE_LIMITS.xrpcQuery.limit - 2);
  });

  it("keeps each policy's budget separate for the same subject", () => {
    const key = subject();
    for (let index = 0; index < RATE_LIMITS.xrpcProcedure.limit; index += 1) {
      checkRateLimit("xrpcProcedure", key);
    }

    expect(checkRateLimit("xrpcProcedure", key).allowed).toBe(false);
    // Spending the write budget must not touch the read budget.
    expect(checkRateLimit("xrpcQuery", key).allowed).toBe(true);
  });

  it("keeps each subject's budget separate", () => {
    const a = subject();
    const b = subject();
    for (let index = 0; index < RATE_LIMITS.xrpcProcedure.limit; index += 1) {
      checkRateLimit("xrpcProcedure", a);
    }

    expect(checkRateLimit("xrpcProcedure", a).allowed).toBe(false);
    expect(checkRateLimit("xrpcProcedure", b).allowed).toBe(true);
  });
});

function requestFromIp(ip: string): Request {
  return new Request("http://127.0.0.1:3000/xrpc/x", {
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
  });
}

describe("checkRateLimitByIp", () => {
  it("keys on the first x-forwarded-for entry", () => {
    const first = checkRateLimitByIp(
      "oauthRegister",
      requestFromIp("203.0.113.7"),
    );
    const second = checkRateLimitByIp(
      "oauthRegister",
      requestFromIp("203.0.113.7"),
    );
    const other = checkRateLimitByIp(
      "oauthRegister",
      requestFromIp("203.0.113.8"),
    );

    expect(second.remaining).toBe(first.remaining - 1);
    expect(other.remaining).toBe(first.remaining);
  });
});

describe("rateLimitHeaders", () => {
  it("reports the ceiling and what is left on an allowed request", () => {
    const headers = rateLimitHeaders(checkRateLimit("xrpcQuery", subject()));
    expect(headers["RateLimit-Limit"]).toBe(
      String(RATE_LIMITS.xrpcQuery.limit),
    );
    expect(headers["RateLimit-Remaining"]).toBe(
      String(RATE_LIMITS.xrpcQuery.limit - 1),
    );
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("adds Retry-After only once the budget is spent", () => {
    const key = subject();
    for (let index = 0; index < RATE_LIMITS.oauthRegister.limit; index += 1) {
      checkRateLimit("oauthRegister", key);
    }
    const headers = rateLimitHeaders(checkRateLimit("oauthRegister", key));
    expect(Number(headers["Retry-After"])).toBeGreaterThan(0);
    expect(headers["RateLimit-Remaining"]).toBe("0");
  });
});
