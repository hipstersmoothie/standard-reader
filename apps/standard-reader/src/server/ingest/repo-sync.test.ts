import { beforeEach, describe, expect, it, vi } from "vitest";

import { trackedRepos } from "../../db/schema.ts";

const { updateCalls, fakeRepos, fakeWebBridgeRepos, batchLimits, trackedRow } =
  vi.hoisted(() => ({
    updateCalls: [] as Array<{
      table: unknown;
      values: Record<string, unknown>;
    }>,
    fakeRepos: [] as Array<{ did: string }>,
    fakeWebBridgeRepos: [] as Array<{ did: string }>,
    /** `limit` of each batch select, in order — how the lane split is asserted. */
    batchLimits: [] as Array<number>,
    trackedRow: [{ lastSeenSeq: null as number | null }],
  }));

vi.mock("../../db/index.ts", () => {
  return {
    db: {
      select: () => ({
        from: (table: unknown) => {
          if (table === trackedRepos) {
            return {
              where: () => ({
                // The round-robin batch queries. There are two, and they run
                // in lane order: the main batch first, then the smaller
                // web-bridge quota (see `reconcilePublisherReposBatch`). This
                // stub can't read the lane predicate, so it serves them by
                // arrival — which is also what lets a test assert that the
                // bridge lane asked for far fewer repos than the main one.
                orderBy: () => ({
                  limit: async (take: number) => {
                    batchLimits.push(take);
                    return batchLimits.length === 1
                      ? fakeRepos
                      : fakeWebBridgeRepos;
                  },
                }),
                // ...and the single-row `last_seen_seq` lookup.
                limit: async () => trackedRow,
              }),
            };
          }
          // publications / documents prune + CID lookups — nothing mirrored.
          return { where: async () => [] };
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => {
          updateCalls.push({ table, values });
          return {
            where: () =>
              Object.assign(Promise.resolve(), {
                returning: async () => [{ reconcileFailCount: 1 }],
              }),
          };
        },
      }),
      delete: () => ({ where: async () => {} }),
    },
  };
});

vi.mock("../atproto/fetch-record.ts", () => ({
  fetchRepoRecordWithFallback: vi.fn(),
}));

vi.mock("./archive-replay.ts", () => ({ foldRepoFromArchive: vi.fn() }));

const { foldRepoFromArchive } = await import("./archive-replay.ts");
const { reconcilePublisherReposBatch } = await import("./repo-sync.ts");

/** A fold result: by default a repo the archive holds records for. */
function fold(
  overrides: Partial<{
    applied: number;
    empty: boolean;
    gone: boolean;
    lastSeq: number;
    live: Map<string, Set<string>>;
  }> = {},
) {
  return {
    applied: overrides.applied ?? 0,
    deleted: 0,
    did: "did:plc:any",
    empty: overrides.empty ?? false,
    gone: overrides.gone ?? false,
    lastSeq: overrides.lastSeq ?? 1000,
    live: overrides.live ?? new Map(),
  };
}

describe("reconcilePublisherReposBatch backoff", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    fakeRepos.length = 0;
    fakeWebBridgeRepos.length = 0;
    batchLimits.length = 0;
    trackedRow[0].lastSeenSeq = null;
    vi.mocked(foldRepoFromArchive).mockReset();
    vi.mocked(foldRepoFromArchive).mockResolvedValue(fold());
  });

  it("backs off a repo whose archive fold throws, instead of retrying every tick", async () => {
    fakeRepos.push({ did: "did:plc:transient-error" });
    vi.mocked(foldRepoFromArchive).mockRejectedValue(new Error("fetch failed"));

    const result = await reconcilePublisherReposBatch(1);

    expect(result.attempted).toBe(1);
    // one update to bump the fail count, one to set the retry-after cooldown.
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1].values.reconcileRetryAfter).toBeInstanceOf(Date);
    expect(
      (updateCalls[1].values.reconcileRetryAfter as Date).getTime(),
    ).toBeGreaterThan(Date.now());
  });

  it("leaves a repo alone when the archive plan matched nothing", async () => {
    // An empty plan is not proof of an empty repo — a repo the relay never saw
    // plans to zero blocks exactly like one that has no records. Pruning on
    // that would delete a live publisher's whole catalogue.
    fakeRepos.push({ did: "did:plc:unseen" });
    vi.mocked(foldRepoFromArchive).mockResolvedValue(fold({ empty: true }));

    const result = await reconcilePublisherReposBatch(1);

    expect(result.attempted).toBe(1);
    expect(result.results[0]?.skipped).toBe(true);
    expect(result.prunedDocuments).toBe(0);
    expect(result.prunedPublications).toBe(0);
  });

  it("clears backoff state on a successful reconcile", async () => {
    fakeRepos.push({ did: "did:plc:healthy" });
    vi.mocked(foldRepoFromArchive).mockResolvedValue(fold({ lastSeq: 4242 }));

    const result = await reconcilePublisherReposBatch(1);

    expect(result.attempted).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({
      lastSeenSeq: 4242,
      reconcileFailCount: 0,
      reconcileRetryAfter: null,
    });
  });
});

describe("reconcile backoff climbs gradually", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    fakeRepos.length = 0;
    fakeWebBridgeRepos.length = 0;
    batchLimits.length = 0;
    trackedRow[0].lastSeenSeq = null;
    vi.mocked(foldRepoFromArchive).mockReset();
    vi.mocked(foldRepoFromArchive).mockResolvedValue(fold());
  });

  /** Days until the next retry, from the scheduled `reconcileRetryAfter`. */
  function scheduledDelayDays(): number {
    const at = updateCalls.at(-1)?.values.reconcileRetryAfter as Date;
    return (at.getTime() - Date.now()) / 86_400_000;
  }

  it("keeps a transient failure's first retry well under a day", async () => {
    // There is no "permanent" class any more. That existed for a host that
    // 400s a whole collection over one lexicon-invalid record; the archive
    // serves raw CBOR and validates nothing on read, so those repos are
    // readable again and a network blip must not cost a week of staleness.
    fakeRepos.push({ did: "did:plc:flaky" });
    vi.mocked(foldRepoFromArchive).mockRejectedValue(new Error("fetch failed"));

    await reconcilePublisherReposBatch(1);

    expect(scheduledDelayDays()).toBeLessThan(1);
  });
});

describe("web-bridge lane split", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    fakeRepos.length = 0;
    fakeWebBridgeRepos.length = 0;
    batchLimits.length = 0;
    trackedRow[0].lastSeenSeq = null;
    vi.mocked(foldRepoFromArchive).mockReset();
    vi.mocked(foldRepoFromArchive).mockResolvedValue(fold());
  });

  it("gives bulk web-bridge mirrors a small quota beside the batch, not a share of it", async () => {
    await reconcilePublisherReposBatch(100);

    // The main lane gets the whole batch — bridged mirrors no longer displace
    // publishers and readers from it, which is the point of the split.
    expect(batchLimits[0]).toBe(100);
    // The bridge lane rides alongside on a far smaller quota, so a fleet that
    // is a third Bridgy mirrors doesn't spend a third of every lap on them.
    expect(batchLimits[1]).toBe(5);
    expect(batchLimits[1]).toBeLessThan(batchLimits[0]);
  });

  it("always reconciles at least one mirror, so their lap never stalls entirely", async () => {
    await reconcilePublisherReposBatch(1);

    expect(batchLimits[1]).toBe(1);
  });

  it("reports how much of the batch went to the bridge lane", async () => {
    fakeRepos.push({ did: "did:plc:publisher" });
    fakeWebBridgeRepos.push({ did: "did:plc:mirror" });

    const result = await reconcilePublisherReposBatch(20);

    expect(result.attempted).toBe(2);
    expect(result.webBridgeAttempted).toBe(1);
  });
});

describe("repair gating on the archive seq watermark", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    fakeRepos.length = 0;
    fakeWebBridgeRepos.length = 0;
    batchLimits.length = 0;
    trackedRow[0].lastSeenSeq = null;
    vi.mocked(foldRepoFromArchive).mockReset();
  });

  it("folds only above the watermark for a repo we have swept before", async () => {
    fakeRepos.push({ did: "did:plc:gated" });
    trackedRow[0].lastSeenSeq = 24_710_000_000;
    vi.mocked(foldRepoFromArchive).mockResolvedValue(fold({ empty: true }));

    const result = await reconcilePublisherReposBatch(1);

    // `afterSeq` is the gate: the planner drops every block at or below it
    // before anything is downloaded, so a quiet repo costs one plan.
    expect(foldRepoFromArchive).toHaveBeenCalledWith("did:plc:gated", {
      afterSeq: 24_710_000_000,
    });
    expect(result.results).toHaveLength(0);
  });

  it("rebuilds from zero for a repo it has never folded", async () => {
    // This is what replaces tap's "register the repo and let it backfill":
    // a newly discovered DID has no watermark, so it gets full history.
    fakeRepos.push({ did: "did:plc:fresh" });
    trackedRow[0].lastSeenSeq = null;
    vi.mocked(foldRepoFromArchive).mockResolvedValue(fold({ lastSeq: 99 }));

    const result = await reconcilePublisherReposBatch(1);

    expect(foldRepoFromArchive).toHaveBeenCalledWith(
      "did:plc:fresh",
      expect.objectContaining({ afterSeq: 0 }),
    );
    expect(result.results).toHaveLength(1);
  });

  it("advances the watermark only after the records are in", async () => {
    fakeRepos.push({ did: "did:plc:gated" });
    trackedRow[0].lastSeenSeq = 100;
    vi.mocked(foldRepoFromArchive).mockResolvedValue(
      fold({ applied: 3, lastSeq: 500 }),
    );

    await reconcilePublisherReposBatch(1);

    expect(updateCalls.some((call) => call.values.lastSeenSeq === 500)).toBe(
      true,
    );
  });

  it("does not advance the watermark when the fold failed", async () => {
    // Recording it first would let a mid-way failure be remembered as a clean
    // sync, and the gate would then skip the repo forever.
    fakeRepos.push({ did: "did:plc:gated" });
    trackedRow[0].lastSeenSeq = 100;
    vi.mocked(foldRepoFromArchive).mockRejectedValue(new Error("boom"));

    await reconcilePublisherReposBatch(1);

    expect(updateCalls.some((call) => "lastSeenSeq" in call.values)).toBe(
      false,
    );
  });
});
