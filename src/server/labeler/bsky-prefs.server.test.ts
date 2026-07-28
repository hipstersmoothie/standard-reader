import { describe, expect, it, vi } from "vitest";

import type { BskyLabelerPrefs } from "./bsky-prefs.server.ts";
import { fetchBskyLabelerPrefs, prefsForLabeler } from "./bsky-prefs.server.ts";

const PUB_SEARCH = "did:plc:aywbh7hovtsqpv2pzkldmqdv";
const OTHER = "did:plc:other";

/** A stand-in for the atcute Client, exposing only the handler we call. */
function clientWith(body: unknown, ok = true) {
  return {
    handler: vi.fn().mockResolvedValue({
      ok,
      json: async () => body,
    }),
  } as never;
}

describe("fetchBskyLabelerPrefs", () => {
  it("reads subscribed labelers and per-label visibility", async () => {
    const prefs = await fetchBskyLabelerPrefs(
      clientWith({
        preferences: [
          {
            $type: "app.bsky.actor.defs#labelersPref",
            labelers: [{ did: PUB_SEARCH }, { did: OTHER }],
          },
          {
            $type: "app.bsky.actor.defs#contentLabelPref",
            labelerDid: PUB_SEARCH,
            label: "bulk-generated",
            visibility: "hide",
          },
        ],
      }),
    );

    expect(prefs?.labelerDids).toEqual([PUB_SEARCH, OTHER]);
    expect(prefs?.visibility.get(`${PUB_SEARCH} bulk-generated`)).toBe("hide");
  });

  it("maps Bluesky's four visibilities onto our three", async () => {
    const prefs = await fetchBskyLabelerPrefs(
      clientWith({
        preferences: [
          {
            $type: "app.bsky.actor.defs#contentLabelPref",
            labelerDid: PUB_SEARCH,
            label: "a",
            visibility: "show",
          },
          {
            $type: "app.bsky.actor.defs#contentLabelPref",
            labelerDid: PUB_SEARCH,
            label: "b",
            visibility: "ignore",
          },
          {
            $type: "app.bsky.actor.defs#contentLabelPref",
            labelerDid: PUB_SEARCH,
            label: "c",
            visibility: "warn",
          },
        ],
      }),
    );

    // `show` and `ignore` both mean "no treatment" for us.
    expect(prefs?.visibility.get(`${PUB_SEARCH} a`)).toBe("ignore");
    expect(prefs?.visibility.get(`${PUB_SEARCH} b`)).toBe("ignore");
    expect(prefs?.visibility.get(`${PUB_SEARCH} c`)).toBe("warn");
  });

  it("drops an unrecognized visibility rather than guessing", async () => {
    const prefs = await fetchBskyLabelerPrefs(
      clientWith({
        preferences: [
          {
            $type: "app.bsky.actor.defs#contentLabelPref",
            labelerDid: PUB_SEARCH,
            label: "a",
            visibility: "something-new",
          },
        ],
      }),
    );
    expect(prefs?.visibility.size).toBe(0);
  });

  it("dedupes labeler DIDs", async () => {
    const prefs = await fetchBskyLabelerPrefs(
      clientWith({
        preferences: [
          {
            $type: "app.bsky.actor.defs#labelersPref",
            labelers: [{ did: PUB_SEARCH }, { did: PUB_SEARCH }],
          },
        ],
      }),
    );
    expect(prefs?.labelerDids).toEqual([PUB_SEARCH]);
  });

  it("returns null when preferences can't be read, so login still works", async () => {
    expect(await fetchBskyLabelerPrefs(clientWith({}, false))).toBeNull();
    const throwing = {
      handler: vi.fn().mockRejectedValue(new Error("no scope")),
    } as never;
    expect(await fetchBskyLabelerPrefs(throwing)).toBeNull();
  });

  it("treats an account with no preferences as nothing to import", async () => {
    const prefs = await fetchBskyLabelerPrefs(clientWith({}));
    expect(prefs).toEqual({ labelerDids: [], visibility: new Map() });
  });
});

describe("prefsForLabeler", () => {
  function prefs(entries: Array<[string, "ignore" | "warn" | "hide"]>) {
    return {
      labelerDids: [PUB_SEARCH],
      visibility: new Map(entries),
    } satisfies BskyLabelerPrefs;
  }

  it("carries over a labeler-scoped preference", () => {
    expect(
      prefsForLabeler(
        prefs([[`${PUB_SEARCH} bulk-generated`, "hide"]]),
        PUB_SEARCH,
        ["bulk-generated"],
      ),
    ).toEqual([{ val: "bulk-generated", visibility: "hide" }]);
  });

  it("applies a global preference when the labeler has no scoped one", () => {
    // A contentLabelPref with no labelerDid covers every labeler emitting it.
    expect(
      prefsForLabeler(prefs([["* spam", "warn"]]), PUB_SEARCH, ["spam"]),
    ).toEqual([{ val: "spam", visibility: "warn" }]);
  });

  it("prefers the labeler-scoped preference over the global one", () => {
    expect(
      prefsForLabeler(
        prefs([
          ["* spam", "warn"],
          [`${PUB_SEARCH} spam`, "hide"],
        ]),
        PUB_SEARCH,
        ["spam"],
      ),
    ).toEqual([{ val: "spam", visibility: "hide" }]);
  });

  it("omits label values the reader has no opinion about", () => {
    expect(prefsForLabeler(prefs([]), PUB_SEARCH, ["spam"])).toEqual([]);
  });
});
