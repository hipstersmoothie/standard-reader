import type { Client } from "@atcute/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "#/db/schema";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import { APPLY_WRITES_MAX_BATCH } from "#/server/atproto/repo-records";
import { markDocumentsRead } from "#/server/reader/mark-documents-read";

vi.mock("#/server/ingest/tracked-repos", () => ({
  ensureTracked: vi.fn(async () => null),
}));

interface RecordedWrite {
  collection: string;
  rkey: string;
  value: { subject: string; createdAt: string };
}

interface MirroredRow {
  documentUri: string;
  ownerDid: string;
  uri: string;
}

/** Minimal stand-in for the read-model handles the mirror writes through. */
function fakeDb(): { db: Db; mirrored: Array<Array<MirroredRow>> } {
  const mirrored: Array<Array<MirroredRow>> = [];
  const db = {
    insert: () => ({
      values: (rows: Array<MirroredRow>) => ({
        onConflictDoUpdate: async () => {
          mirrored.push(rows);
        },
      }),
    }),
  };
  return { db: db as unknown as Db, mirrored };
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
    const { db } = fakeDb();
    const documentUris = uris(450);

    const result = await markDocumentsRead({
      client,
      db,
      did: "did:plc:reader",
      documentUris,
      schema: schema as Schema,
      trackReading: true,
    });

    expect(batches.map((batch) => batch.length)).toEqual([200, 200, 50]);
    expect(result.markedCount).toBe(450);
    expect(result.documentUris).toEqual(documentUris);
  });

  it("mirrors each committed batch into the read-model", async () => {
    const { client } = fakeClient();
    const { db, mirrored } = fakeDb();
    const documentUris = uris(450);

    await markDocumentsRead({
      client,
      db,
      did: "did:plc:reader",
      documentUris,
      schema: schema as Schema,
      trackReading: true,
    });

    // One mirror write per applyWrites batch, covering every document once.
    expect(mirrored.map((rows) => rows.length)).toEqual([200, 200, 50]);
    expect(mirrored.flat().map((row) => row.documentUri)).toEqual(documentUris);
    // Rows are keyed by the record AT-URI ingest will replay, so the tap's
    // later upsert collides with ours instead of duplicating it.
    expect(new Set(mirrored.flat().map((row) => row.uri)).size).toBe(
      documentUris.length,
    );
    expect(
      mirrored.flat().every((row) => row.ownerDid === "did:plc:reader"),
    ).toBe(true);
  });

  it("writes every document exactly once across batches", async () => {
    const { client, batches } = fakeClient();
    const { db } = fakeDb();
    const documentUris = uris(450);

    await markDocumentsRead({
      client,
      db,
      did: "did:plc:reader",
      documentUris,
      schema: schema as Schema,
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
    const { db } = fakeDb();

    await markDocumentsRead({
      client,
      db,
      did: "did:plc:reader",
      documentUris: uris(APPLY_WRITES_MAX_BATCH),
      schema: schema as Schema,
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

    const { db, mirrored } = fakeDb();

    await expect(
      markDocumentsRead({
        client: client as unknown as Client,
        db,
        did: "did:plc:reader",
        documentUris: uris(450),
        schema: schema as Schema,
        trackReading: true,
      }),
    ).rejects.toThrow(/RateLimitExceeded/);

    // Stopped at the failing batch rather than pressing on into the rate limit.
    expect(batches).toEqual([200, 200]);
    // The one batch that did commit is mirrored; the failed one is not.
    expect(mirrored.map((rows) => rows.length)).toEqual([200]);
  });

  it("writes nothing when read tracking is disabled", async () => {
    const { client, batches } = fakeClient();
    const { db, mirrored } = fakeDb();

    const result = await markDocumentsRead({
      client,
      db,
      did: "did:plc:reader",
      documentUris: uris(10),
      schema: schema as Schema,
      trackReading: false,
    });

    expect(batches).toHaveLength(0);
    expect(mirrored).toHaveLength(0);
    expect(result.markedCount).toBe(0);
  });
});
