import type { Client } from "@atcute/client";
import { describe, expect, it, vi } from "vitest";

import { buildPostRecord, findWeekThreadRoot, postThread } from "./thread.ts";

const REPO = "did:plc:bot";
const CREATED_AT = "2026-08-14T16:00:00.000Z";

/** A client that records every `createRecord` call and hands back a strongRef. */
function recordingClient() {
  const calls: Array<{
    collection: string;
    record: Record<string, unknown>;
    repo: string;
  }> = [];
  const client = {
    post: vi.fn(
      async (_nsid: string, init: { input: Record<string, never> }) => {
        const input = init.input as unknown as (typeof calls)[number];
        calls.push(input);
        // The PDS assigns the rkey; stand in a fresh one per call.
        const rkey = `tid${calls.length}`;
        return {
          data: {
            cid: `cid-${rkey}`,
            uri: `at://${input.repo}/${input.collection}/${rkey}`,
          },
          ok: true as const,
        };
      },
    ),
  };
  return { calls, client: client as unknown as Client };
}

const specs = [{ text: "one" }, { text: "two" }, { text: "three" }];

describe("postThread", () => {
  it("creates a record per spec and returns their refs in order", async () => {
    const { calls, client } = recordingClient();

    const refs = await postThread(client, REPO, specs, {
      createdAt: CREATED_AT,
    });

    expect(calls.map((call) => call.record.text)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(refs.map((ref) => ref.uri)).toEqual([
      `at://${REPO}/app.bsky.feed.post/tid1`,
      `at://${REPO}/app.bsky.feed.post/tid2`,
      `at://${REPO}/app.bsky.feed.post/tid3`,
    ]);
  });

  // The whole point of the fix: a published post is immutable, so the job may
  // only ever add records. `putRecord` at a computed rkey is what silently
  // rewrote posts people had already replied to.
  it("never writes with putRecord, and never names an rkey", async () => {
    const { calls, client } = recordingClient();

    await postThread(client, REPO, specs, { createdAt: CREATED_AT });

    for (const [nsid] of (client.post as ReturnType<typeof vi.fn>).mock.calls) {
      expect(nsid).toBe("com.atproto.repo.createRecord");
    }
    for (const call of calls) {
      expect(call).not.toHaveProperty("rkey");
    }
  });

  it("writes a second thread rather than reusing the first one's records", async () => {
    const first = recordingClient();
    const second = recordingClient();

    const a = await postThread(first.client, REPO, specs, {
      createdAt: CREATED_AT,
    });
    const b = await postThread(second.client, REPO, specs, {
      createdAt: CREATED_AT,
    });

    // Same content, but the PDS picks the keys — neither run can land on a
    // record the other already published.
    expect(second.calls.map((c) => c.record)).toEqual(
      first.calls.map((c) => c.record),
    );
    expect(a).toHaveLength(b.length);
  });

  it("chains replies root→parent", async () => {
    const { calls, client } = recordingClient();

    const refs = await postThread(client, REPO, specs, {
      createdAt: CREATED_AT,
    });

    expect(calls[0].record.reply).toBeUndefined();
    for (const [i, call] of calls.slice(1).entries()) {
      const reply = call.record.reply as {
        parent: { cid: string; uri: string };
        root: { cid: string; uri: string };
      };
      expect(reply.root.uri).toBe(refs[0].uri);
      expect(reply.root.cid).toBe(refs[0].cid);
      // Each reply pins the *previous* post, by uri and cid.
      expect(reply.parent.uri).toBe(refs[i].uri);
      expect(reply.parent.cid).toBe(refs[i].cid);
    }
  });

  it("stamps the root before any reply goes out", async () => {
    const { client } = recordingClient();
    const seen: Array<string> = [];

    await postThread(client, REPO, specs, {
      createdAt: CREATED_AT,
      onRoot: async () => {
        seen.push("onRoot");
      },
    });

    const clientCalls = (client.post as ReturnType<typeof vi.fn>).mock.calls;
    expect(clientCalls).toHaveLength(3);
    expect(seen).toEqual(["onRoot"]); // exactly once, and it ran
  });
});

const ROOT_TEXT =
  "🔥 The 5 hottest reads on Standard Reader this week\n\n1. Hi";

/** A client serving canned `listRecords` pages. */
function listingClient(
  pages: Array<{ cursor?: string; records: Array<unknown> }>,
) {
  let page = 0;
  const client = {
    get: vi.fn(async () => {
      const current = pages[Math.min(page, pages.length - 1)];
      page++;
      return { data: current, ok: true as const };
    }),
  };
  return { client: client as unknown as Client, get: client.get };
}

function post(rkey: string, value: Record<string, unknown>) {
  return { uri: `at://${REPO}/app.bsky.feed.post/${rkey}`, value };
}

describe("findWeekThreadRoot", () => {
  it("finds this week's root by marker and createdAt", async () => {
    const { client } = listingClient([
      {
        records: [
          post("r2", {
            createdAt: "2026-08-14T16:00:00.000Z",
            text: ROOT_TEXT,
          }),
        ],
      },
    ]);

    await expect(findWeekThreadRoot(client, REPO, "2026-W33")).resolves.toBe(
      `at://${REPO}/app.bsky.feed.post/r2`,
    );
  });

  it("ignores a root from a different week", async () => {
    const { client } = listingClient([
      {
        records: [
          post("r1", {
            createdAt: "2026-08-07T16:00:00.000Z",
            text: ROOT_TEXT,
          }),
        ],
      },
    ]);

    await expect(
      findWeekThreadRoot(client, REPO, "2026-W33"),
    ).resolves.toBeNull();
  });

  it("ignores replies and unrelated posts in the same week", async () => {
    const { client } = listingClient([
      {
        records: [
          post("a", {
            createdAt: "2026-08-14T17:00:00.000Z",
            text: "Nope! Will get that fixed",
          }),
          post("b", {
            createdAt: "2026-08-14T16:00:01.000Z",
            reply: { parent: {}, root: {} },
            text: ROOT_TEXT,
          }),
        ],
      },
    ]);

    await expect(
      findWeekThreadRoot(client, REPO, "2026-W33"),
    ).resolves.toBeNull();
  });

  // `createdAt` is whatever the writer put there — the old job backdated every
  // post to the week's nominal Friday — so an older-looking record must not end
  // the scan while the root it is looking for is still further down.
  it("keeps scanning past an out-of-order createdAt", async () => {
    const { client } = listingClient([
      {
        cursor: "next",
        records: [
          post("backdated", {
            createdAt: "2026-08-07T16:00:00.000Z",
            text: "backdated by the old job",
          }),
        ],
      },
      {
        records: [
          post("root", {
            createdAt: "2026-08-14T16:00:00.000Z",
            text: ROOT_TEXT,
          }),
        ],
      },
    ]);

    await expect(findWeekThreadRoot(client, REPO, "2026-W33")).resolves.toBe(
      `at://${REPO}/app.bsky.feed.post/root`,
    );
  });

  it("stops at the page cap rather than walking the whole repo", async () => {
    const { client, get } = listingClient([
      {
        cursor: "next",
        records: Array.from({ length: 100 }, (_, i) =>
          post(`p${i}`, {
            createdAt: "2026-08-14T16:00:00.000Z",
            text: "not a root",
          }),
        ),
      },
    ]);

    await expect(
      findWeekThreadRoot(client, REPO, "2026-W33"),
    ).resolves.toBeNull();
    expect(get).toHaveBeenCalledTimes(3);
  });

  // Fail closed: if we cannot tell whether the thread already exists, the
  // caller must not go on to post one.
  it("propagates a transport failure instead of reporting 'no thread'", async () => {
    const client = {
      get: vi.fn(async () => {
        throw new Error("pds unreachable");
      }),
    } as unknown as Client;

    await expect(findWeekThreadRoot(client, REPO, "2026-W33")).rejects.toThrow(
      /pds unreachable/,
    );
  });
});

describe("buildPostRecord", () => {
  it("takes createdAt from the caller, not the clock", () => {
    const record = buildPostRecord({ text: "hi" }, CREATED_AT);
    expect(record.createdAt).toBe("2026-08-14T16:00:00.000Z");
  });
});
