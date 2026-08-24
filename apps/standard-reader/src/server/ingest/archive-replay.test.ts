import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `hydrateRepoForRead` is the read path's entry into the archive, and the two
 * things that matter about it are things the raw backfill got wrong: it must
 * not fold a repo the reconcile watermark says we already folded, and it must
 * never propagate a Jetstream failure into the caller. A 503 from the planner
 * used to reject `loadShellSnapshot`, which took every signed-in surface down
 * with it.
 */

const rows: Array<{ lastSeenSeq: number | null }> = [];
const snapshot = vi.fn();

vi.mock("../../db/index.ts", () => {
  const limit = vi.fn(async () => rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const updateWhere = vi.fn(async () => {});
  return {
    db: {
      select: vi.fn(() => ({ from })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) })),
    },
  };
});

vi.mock("../../db/schema.ts", () => ({
  trackedRepos: { did: "did", lastSeenSeq: "last_seen_seq" },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => "eq") }));

vi.mock("../observability/log.ts", () => ({ logEvent: vi.fn() }));

vi.mock("./consumer.ts", () => ({
  handleRecord: vi.fn(async () => {}),
}));

vi.mock("@bsky/jetstream", () => ({
  Jetstream: class {
    snapshot(...args: Array<unknown>) {
      return snapshot(...args) as AsyncIterable<never>;
    }
  },
}));

async function loadModule() {
  vi.resetModules();
  return import("./archive-replay.ts");
}

async function* empty(): AsyncGenerator<never> {
  // No archived events for this repo.
}

beforeEach(() => {
  rows.length = 0;
  snapshot.mockReset();
});

describe("hydrateRepoForRead", () => {
  it("skips the fold when the repo already carries a reconcile watermark", async () => {
    rows.push({ lastSeenSeq: 25_045_926_020 });
    const { hydrateRepoForRead } = await loadModule();

    await hydrateRepoForRead("did:plc:already-folded");

    // The read-model is authoritative for a repo the sweep has seen, so an
    // empty `lists` read means "no lists", not "not hydrated yet".
    expect(snapshot).not.toHaveBeenCalled();
  });

  it("folds once for a repo that has never been reconciled, then never again", async () => {
    snapshot.mockImplementation(() => empty());
    const { hydrateRepoForRead } = await loadModule();

    await hydrateRepoForRead("did:plc:fresh");
    await hydrateRepoForRead("did:plc:fresh");

    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it("resolves instead of throwing when the archive is unreachable", async () => {
    snapshot.mockImplementation(() => {
      throw new Error("Upstream server responded with a 503 error");
    });
    const { hydrateRepoForRead } = await loadModule();

    await expect(hydrateRepoForRead("did:plc:fresh")).resolves.toBeUndefined();
  });

  it("retries on a later request after a failure", async () => {
    snapshot.mockImplementationOnce(() => {
      throw new Error("Upstream server responded with a 503 error");
    });
    snapshot.mockImplementation(() => empty());
    const { hydrateRepoForRead } = await loadModule();

    await hydrateRepoForRead("did:plc:fresh");
    await hydrateRepoForRead("did:plc:fresh");

    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it("coalesces the concurrent calls one shell snapshot makes", async () => {
    snapshot.mockImplementation(() => empty());
    const { hydrateRepoForRead } = await loadModule();

    await Promise.all([
      hydrateRepoForRead("did:plc:fresh"),
      hydrateRepoForRead("did:plc:fresh"),
    ]);

    expect(snapshot).toHaveBeenCalledTimes(1);
  });
});
