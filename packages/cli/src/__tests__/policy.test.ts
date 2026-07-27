import type {
  ConversionIssue,
  ConversionResult,
} from "@standard-reader/converter";
import { describe, expect, it } from "vitest";

import { autoDecide } from "../policy.js";
import type { Policy } from "../policy.js";

function result(overrides: Partial<ConversionResult> = {}): ConversionResult {
  return {
    blockCount: 3,
    content: { $type: "blog.pckt.content", items: [] },
    contentType: "blog.pckt.content",
    issues: [],
    lossless: true,
    sourceFormat: "pub.leaflet.content",
    target: "pckt",
    unchanged: false,
    ...overrides,
  };
}

const issue = (severity: ConversionIssue["severity"]): ConversionIssue => ({
  blockIndex: 0,
  blockType: "table",
  code: "block-unsupported",
  message: "no table block",
  severity,
});

const policy = (overrides: Partial<Policy> = {}): Policy => ({
  force: false,
  interactive: false,
  strict: false,
  ...overrides,
});

describe("autoDecide", () => {
  it("converts a clean result without asking", () => {
    expect(autoDecide(result(), policy({ interactive: true }))).toBe("convert");
  });

  it("skips a document already in the target format", () => {
    expect(autoDecide(result({ unchanged: true }), policy())).toBe("skip");
  });

  it("skips a document that produced no content", () => {
    expect(autoDecide(result({ content: null }), policy())).toBe("skip");
  });

  it("asks about any warning when it can", () => {
    const lossy = result({ issues: [issue("lossy")] });
    expect(autoDecide(lossy, policy({ interactive: true }))).toBe("ask");
  });

  it("converts lossy-only results unattended, since the words survive", () => {
    const lossy = result({ issues: [issue("lossy")] });
    expect(autoDecide(lossy, policy())).toBe("convert");
  });

  it("leaves a record alone unattended when blocks would be dropped", () => {
    const dropped = result({ issues: [issue("unsupported")], lossless: false });
    expect(autoDecide(dropped, policy())).toBe("skip");
  });

  it("stops for any change at all under --strict", () => {
    const lossy = result({ issues: [issue("lossy")] });
    expect(autoDecide(lossy, policy({ strict: true }))).toBe("skip");
  });

  it("converts everything under --force, warnings and all", () => {
    const dropped = result({ issues: [issue("unsupported")], lossless: false });
    expect(autoDecide(dropped, policy({ force: true }))).toBe("convert");
    expect(
      autoDecide(dropped, policy({ force: true, interactive: true })),
    ).toBe("convert");
  });

  it("still refuses to write when --force has nothing to write", () => {
    expect(autoDecide(result({ content: null }), policy({ force: true }))).toBe(
      "skip",
    );
  });
});
