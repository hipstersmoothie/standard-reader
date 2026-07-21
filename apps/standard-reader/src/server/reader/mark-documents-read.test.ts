import type { Client } from "@atcute/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APPLY_WRITES_MAX_BATCH } from "#/server/atproto/repo-records";
import { markDocumentsRead } from "#/server/reader/mark-documents-read";

vi.mock("#/server/ingest/tap-client", () => ({
  ensureTracked: vi.fn(async () => null),
}));

interface RecordedWrite {
  collection: string;
  rkey: string;
  value: { subject: string; createdAt: string };
}

function fakeClient(): {
  client: Client;
  batches: Array<Array<RecordedWrite>>;
} {
  const batches: Array<Array<RecordedWrite>> = [];
  const client = {
    post: async (_nsid: string, options: { input: { writes: unknown } }) => {
      const writes = options.input.writes as Array<RecordedWrite>;
      batches.push(writes);
      return { ok: true as const, data: { results: writes.map(() => ({})) } };
    },
  };
  return { client: client as unknown as Client, batches };
}

function uris(count: number): Array<string> {
  return Array.from(
    { length: count },
    (_, i) => `at://did:plc:pub/site.standard.document/doc${i}`,
  );
}

describe("markDocumentsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("splits a backlog into batches within the applyWrites cap", async () => {
    const { client, batches } = fakeClient();
    const documentUris = uris(450);

    const result = await markDocumentsRead({
      client,
      did: "did:plc:reader",
      documentUris,
      trackReading: true,
    });

    expect(batches.map((batch) => batch.length)).toEqual([200, 200, 50]);
    expect(result.markedCount).toBe(450);
    expect(result.documentUris).toEqual(documentUris);
  });

  it("writes every document exactly once across batches", async () => {
    const { client, batches } = fakeClient();
    const documentUris = uris(450);

    await markDocumentsRead({
      client,
      did: "did:plc:reader",
      documentUris,
      trackReading: true,
    });

    const subjects = batches.flat().map((write) => write.value.subject);
    expect(subjects).toEqual(documentUris);
    expect(new Set(subjects).size).toBe(documentUris.length);
    // Deterministic subject-derived rkeys — a re-mark must collide, not duplicate.
    expect(new Set(batches.flat().map((write) => write.rkey)).size).toBe(
      documentUris.length,
    );
  });

  it("sends a single batch when the backlog fits the cap", async () => {
    const { client, batches } = fakeClient();

    await markDocumentsRead({
      client,
      did: "did:plc:reader",
      documentUris: uris(APPLY_WRITES_MAX_BATCH),
      trackReading: true,
    });

    expect(batches).toHaveLength(1);
  });

  it("keeps a partial failure's earlier batches durable", async () => {
    const batches: Array<number> = [];
    const client = {
      post: async (_nsid: string, options: { input: { writes: unknown } }) => {
        const writes = options.input.writes as Array<RecordedWrite>;
        batches.push(writes.length);
        if (batches.length === 2) {
          // Shape matches @atcute's ClientResponseError input, which `ok()` throws on.
          return {
            ok: false as const,
            status: 429,
            headers: new Headers(),
            data: {
              error: "RateLimitExceeded",
              message: "Rate Limit Exceeded",
            },
          };
        }
        return { ok: true as const, data: { results: writes.map(() => ({})) } };
      },
    };

    await expect(
      markDocumentsRead({
        client: client as unknown as Client,
        did: "did:plc:reader",
        documentUris: uris(450),
        trackReading: true,
      }),
    ).rejects.toThrow(/RateLimitExceeded/);

    // Stopped at the failing batch rather than pressing on into the rate limit.
    expect(batches).toEqual([200, 200]);
  });

  it("writes nothing when read tracking is disabled", async () => {
    const { client, batches } = fakeClient();

    const result = await markDocumentsRead({
      client,
      did: "did:plc:reader",
      documentUris: uris(10),
      trackReading: false,
    });

    expect(batches).toHaveLength(0);
    expect(result.markedCount).toBe(0);
  });
});
