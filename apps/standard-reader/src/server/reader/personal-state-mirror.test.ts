import { describe, expect, it } from "vitest";

import * as schema from "#/db/schema";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import { COLLECTION } from "#/lib/atproto/nsids";
import { subjectRkey } from "#/server/atproto/repo-records";
import {
  bookmarkRecordUri,
  mirrorBookmarkRemoved,
  mirrorBookmarkSaved,
  mirrorReadRemoved,
  mirrorReadsMarked,
  mirrorRecommendAdded,
  mirrorRecommendRemoved,
  readRecordUri,
  recommendRecordUri,
} from "#/server/reader/personal-state-mirror";

const READER = "did:plc:reader";
const DOC = "at://did:plc:pub/site.standard.document/doc1";
const CREATED_AT = "2026-08-01T12:00:00.000Z";

function capturingDb(): {
  db: Db;
  inserted: Array<Array<Record<string, unknown>>>;
  deletes: number;
} {
  const inserted: Array<Array<Record<string, unknown>>> = [];
  const state = { deletes: 0 };
  const db = {
    delete: () => ({
      where: async () => {
        state.deletes += 1;
      },
    }),
    insert: () => ({
      values: (
        rows: Array<Record<string, unknown>> | Record<string, unknown>,
      ) => ({
        onConflictDoUpdate: async () => {
          inserted.push(Array.isArray(rows) ? rows : [rows]);
        },
      }),
    }),
  };
  return {
    db: db as unknown as Db,
    get deletes() {
      return state.deletes;
    },
    inserted,
  };
}

async function boom(): Promise<never> {
  throw new Error("connection terminated");
}

function throwingDb(): Db {
  return {
    delete: () => ({ where: boom }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: boom }) }),
  } as unknown as Db;
}

describe("record URIs", () => {
  it("match the AT-URIs the PDS assigns, so ingest's replay collides", () => {
    // Same `(repo, collection, subject-hash rkey)` the write path sends to
    // `putRecord`/`applyWrites` — and therefore the URI on the firehose event.
    const rkey = subjectRkey(DOC);
    expect(readRecordUri(READER, DOC)).toBe(
      `at://${READER}/${COLLECTION.read}/${rkey}`,
    );
    expect(bookmarkRecordUri(READER, DOC)).toBe(
      `at://${READER}/${COLLECTION.bookmark}/${rkey}`,
    );
    expect(recommendRecordUri(READER, DOC)).toBe(
      `at://${READER}/${COLLECTION.recommend}/${rkey}`,
    );
  });
});

describe("mirrorReadsMarked", () => {
  it("writes the same columns ingest's upsertRead would", async () => {
    const { db, inserted } = capturingDb();

    await mirrorReadsMarked(db, schema as Schema, {
      createdAt: CREATED_AT,
      ownerDid: READER,
      reads: [{ cid: "bafyreiread", documentUri: DOC }],
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.[0]).toEqual({
      cid: "bafyreiread",
      createdAt: new Date(CREATED_AT),
      deleted: false,
      documentDid: "did:plc:pub",
      documentUri: DOC,
      ownerDid: READER,
      rkey: subjectRkey(DOC),
      uri: readRecordUri(READER, DOC),
    });
  });

  it("tolerates a PDS that returned no CID", async () => {
    const { db, inserted } = capturingDb();

    await mirrorReadsMarked(db, schema as Schema, {
      createdAt: CREATED_AT,
      ownerDid: READER,
      reads: [{ documentUri: DOC }],
    });

    expect(inserted[0]?.[0]?.cid).toBeNull();
  });

  it("does nothing for an empty batch", async () => {
    const { db, inserted } = capturingDb();

    await mirrorReadsMarked(db, schema as Schema, {
      createdAt: CREATED_AT,
      ownerDid: READER,
      reads: [],
    });

    expect(inserted).toHaveLength(0);
  });

  it("swallows a read-model failure — the PDS write already committed", async () => {
    await expect(
      mirrorReadsMarked(throwingDb(), schema as Schema, {
        createdAt: CREATED_AT,
        ownerDid: READER,
        reads: [{ documentUri: DOC }],
      }),
    ).resolves.toBeUndefined();
  });
});

describe("mirrorBookmarkSaved", () => {
  it("writes the same columns ingest's upsertBookmark would", async () => {
    const { db, inserted } = capturingDb();

    await mirrorBookmarkSaved(db, schema as Schema, {
      cid: "bafyreibookmark",
      createdAt: CREATED_AT,
      documentUri: DOC,
      ownerDid: READER,
    });

    expect(inserted[0]?.[0]).toEqual({
      cid: "bafyreibookmark",
      createdAt: new Date(CREATED_AT),
      deleted: false,
      documentDid: "did:plc:pub",
      documentUri: DOC,
      ownerDid: READER,
      rkey: subjectRkey(DOC),
      uri: bookmarkRecordUri(READER, DOC),
    });
  });

  it("swallows a read-model failure", async () => {
    await expect(
      mirrorBookmarkSaved(throwingDb(), schema as Schema, {
        createdAt: CREATED_AT,
        documentUri: DOC,
        ownerDid: READER,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("mirrorRecommendAdded", () => {
  it("writes the same columns ingest's upsertRecommend would", async () => {
    const { db, inserted } = capturingDb();

    await mirrorRecommendAdded(db, schema as Schema, {
      cid: "bafyreirecommend",
      createdAt: CREATED_AT,
      documentUri: DOC,
      recommenderDid: READER,
    });

    // `recommends` keys the owner as `recommender_did`, not `owner_did`.
    expect(inserted[0]?.[0]).toEqual({
      cid: "bafyreirecommend",
      createdAt: new Date(CREATED_AT),
      deleted: false,
      documentDid: "did:plc:pub",
      documentUri: DOC,
      recommenderDid: READER,
      rkey: subjectRkey(DOC),
      uri: recommendRecordUri(READER, DOC),
    });
  });

  it("swallows a read-model failure", async () => {
    await expect(
      mirrorRecommendAdded(throwingDb(), schema as Schema, {
        createdAt: CREATED_AT,
        documentUri: DOC,
        recommenderDid: READER,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("removals", () => {
  it("delete the mirrored row for each collection", async () => {
    const capture = capturingDb();

    await mirrorReadRemoved(capture.db, schema as Schema, {
      documentUri: DOC,
      ownerDid: READER,
    });
    await mirrorBookmarkRemoved(capture.db, schema as Schema, {
      documentUri: DOC,
      ownerDid: READER,
    });
    await mirrorRecommendRemoved(capture.db, schema as Schema, {
      documentUri: DOC,
      recommenderDid: READER,
    });

    expect(capture.deletes).toBe(3);
  });

  it("swallow a read-model failure", async () => {
    await expect(
      mirrorReadRemoved(throwingDb(), schema as Schema, {
        documentUri: DOC,
        ownerDid: READER,
      }),
    ).resolves.toBeUndefined();
    await expect(
      mirrorBookmarkRemoved(throwingDb(), schema as Schema, {
        documentUri: DOC,
        ownerDid: READER,
      }),
    ).resolves.toBeUndefined();
    await expect(
      mirrorRecommendRemoved(throwingDb(), schema as Schema, {
        documentUri: DOC,
        recommenderDid: READER,
      }),
    ).resolves.toBeUndefined();
  });
});
