import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BSKY_POST_LINK_SOURCES,
  getBacklinkCountForTarget,
} from "./constellation";

const TARGET = "https://example.com/some-article";

function mockCountResponse(body: string) {
  return {
    ok: true,
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
  } as Response;
}

describe("getBacklinkCountForTarget", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Regression test: Constellation's `/links/count` switched from answering
  // with a bare integer to `{"total":N}`. Parsing only the integer form made
  // every http(s) backlink total silently 0 — which zeroed the Bluesky share of
  // article comment counts and `documents.backlink_count` (a trending input).
  it("parses the JSON `/links/count` body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockCountResponse('{"total":7}')),
    );

    await expect(getBacklinkCountForTarget(TARGET)).resolves.toBe(
      7 * BSKY_POST_LINK_SOURCES.length,
    );
  });

  it("still parses a bare-integer `/links/count` body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockCountResponse("7\n")));

    await expect(getBacklinkCountForTarget(TARGET)).resolves.toBe(
      7 * BSKY_POST_LINK_SOURCES.length,
    );
  });

  it("treats an unparseable body as zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockCountResponse("not a count")),
    );

    await expect(getBacklinkCountForTarget(TARGET)).resolves.toBe(0);
  });
});
