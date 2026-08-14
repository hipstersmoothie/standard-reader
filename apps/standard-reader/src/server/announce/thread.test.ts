import type { Client } from "@atcute/client";
import { describe, expect, it, vi } from "vitest";

import { buildPostRecord, postThread } from "./thread.ts";
import { threadRkeys, weekAnchor } from "./week.ts";

const REPO = "did:plc:bot";
const CREATED_AT = weekAnchor("2026-W33").toISOString();

/** A client that records every `putRecord` call and hands back a strongRef. */
function recordingClient() {
  const calls: Array<{
    collection: string;
    record: Record<string, unknown>;
    repo: string;
    rkey: string;
  }> = [];
  const client = {
    post: vi.fn(
      async (_nsid: string, init: { input: Record<string, never> }) => {
        const input = init.input as unknown as (typeof calls)[number];
        calls.push(input);
        return {
          data: {
            cid: `cid-${input.rkey}`,
            uri: `at://${input.repo}/${input.collection}/${input.rkey}`,
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
  it("upserts each post at the rkey it was given", async () => {
    const { calls, client } = recordingClient();
    const rkeys = threadRkeys("2026-W33", 3);

    const refs = await postThread(client, REPO, specs, {
      createdAt: CREATED_AT,
      rkeys,
    });

    expect(calls.map((call) => call.rkey)).toEqual(rkeys);
    expect(refs.map((ref) => ref.uri)).toEqual(
      rkeys.map((rkey) => `at://${REPO}/app.bsky.feed.post/${rkey}`),
    );
  });

  it("writes with putRecord so a re-run overwrites rather than duplicates", async () => {
    const { client } = recordingClient();

    await postThread(client, REPO, specs, {
      createdAt: CREATED_AT,
      rkeys: threadRkeys("2026-W33", 3),
    });

    for (const [nsid] of (client.post as ReturnType<typeof vi.fn>).mock.calls) {
      expect(nsid).toBe("com.atproto.repo.putRecord");
    }
  });

  it("produces identical records on a second run over the same week", async () => {
    const first = recordingClient();
    const second = recordingClient();
    const options = {
      createdAt: CREATED_AT,
      rkeys: threadRkeys("2026-W33", 3),
    };

    await postThread(first.client, REPO, specs, options);
    await postThread(second.client, REPO, specs, options);

    expect(second.calls).toEqual(first.calls);
  });

  it("chains replies root→parent", async () => {
    const { calls, client } = recordingClient();
    const rkeys = threadRkeys("2026-W33", 3);

    await postThread(client, REPO, specs, { createdAt: CREATED_AT, rkeys });

    const rootUri = `at://${REPO}/app.bsky.feed.post/${rkeys[0]}`;
    expect(calls[0].record.reply).toBeUndefined();
    for (const [i, call] of calls.slice(1).entries()) {
      const reply = call.record.reply as {
        parent: { uri: string };
        root: { uri: string };
      };
      expect(reply.root.uri).toBe(rootUri);
      expect(reply.parent.uri).toBe(
        `at://${REPO}/app.bsky.feed.post/${rkeys[i]}`,
      );
    }
  });

  it("stamps the root before any reply goes out", async () => {
    const { client } = recordingClient();
    const seen: Array<string> = [];

    await postThread(
      client,
      REPO,
      specs.map((spec, i) => ({ ...spec, text: `post-${i}` })),
      {
        createdAt: CREATED_AT,
        onRoot: async () => {
          seen.push("onRoot");
        },
        rkeys: threadRkeys("2026-W33", 3),
      },
    );

    const clientCalls = (client.post as ReturnType<typeof vi.fn>).mock.calls;
    expect(clientCalls).toHaveLength(3);
    expect(seen).toEqual(["onRoot"]); // exactly once, and it ran
  });

  it("refuses to post with fewer rkeys than posts", async () => {
    const { client } = recordingClient();

    await expect(
      postThread(client, REPO, specs, {
        createdAt: CREATED_AT,
        rkeys: threadRkeys("2026-W33", 2),
      }),
    ).rejects.toThrow(/one rkey per post/);
  });
});

describe("buildPostRecord", () => {
  it("takes createdAt from the caller, not the clock", () => {
    const record = buildPostRecord({ text: "hi" }, CREATED_AT);
    expect(record.createdAt).toBe("2026-08-14T16:00:00.000Z");
  });
});
