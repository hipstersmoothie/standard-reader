import { describe, expect, it } from "vitest";

import { AUTH_SESSION_TOKEN_COOKIE } from "./constants";
import { readCookie } from "./session.server";

describe("readCookie", () => {
  it("reads a value from a multi-cookie header", () => {
    const header = `theme=dark; ${AUTH_SESSION_TOKEN_COOKIE}=abc123; other=1`;
    expect(readCookie(header, AUTH_SESSION_TOKEN_COOKIE)).toBe("abc123");
  });

  it("url-decodes the value", () => {
    expect(readCookie("t=a%20b%2Fc", "t")).toBe("a b/c");
  });

  it("returns undefined when the cookie is absent", () => {
    expect(readCookie("a=1; b=2", "missing")).toBeUndefined();
  });

  it("returns undefined for a null header", () => {
    expect(readCookie(null, "t")).toBeUndefined();
  });

  it("does not match a cookie name by prefix", () => {
    // `session_token_extra` must not satisfy a lookup for `session_token`.
    expect(
      readCookie("session_token_extra=x", "session_token"),
    ).toBeUndefined();
  });

  it("tolerates whitespace around the pair", () => {
    expect(readCookie("  t = value ", "t")).toBe("value");
  });
});
