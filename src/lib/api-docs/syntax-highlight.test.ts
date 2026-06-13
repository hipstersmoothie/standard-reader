import { describe, expect, it } from "vitest";

import { tokenizeCurl, tokenizeJson } from "./syntax-highlight";

describe("tokenizeJson", () => {
  it("colors keys, strings, numbers, and booleans", () => {
    const tokens = tokenizeJson('{\n  "ok": true,\n  "count": 2\n}');
    expect(
      tokens.some((t) => t.type === "key" && t.text.includes('"ok"')),
    ).toBe(true);
    expect(tokens.some((t) => t.type === "bool" && t.text === "true")).toBe(
      true,
    );
    expect(tokens.some((t) => t.type === "num" && t.text === "2")).toBe(true);
  });
});

describe("tokenizeCurl", () => {
  it("highlights query curl flags and url", () => {
    const tokens = tokenizeCurl(
      "curl -sS 'https://standard-reader.app/xrpc/app.standard-reader.resolveUrl?url=example'",
    );
    expect(tokens[0]).toEqual({ type: "flag", text: "curl -sS" });
    expect(
      tokens.some((t) => t.type === "url" && t.text.startsWith("https://")),
    ).toBe(true);
  });

  it("highlights POST curl flags", () => {
    const tokens = tokenizeCurl(
      "curl -sS -X POST 'https://standard-reader.app/xrpc/app.standard-reader.follow' -H 'Content-Type: application/json' -d '{\"publication\":\"at://x\"}'",
    );
    expect(
      tokens.some((t) => t.type === "flag" && t.text.includes("-X POST")),
    ).toBe(true);
    expect(
      tokens.some(
        (t) =>
          t.type === "flag" &&
          t.text.includes("Content-Type: application/json"),
      ),
    ).toBe(true);
  });
});
