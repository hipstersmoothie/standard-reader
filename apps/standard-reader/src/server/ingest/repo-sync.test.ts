import { beforeEach, describe, expect, it, vi } from "vitest";

import { trackedRepos } from "../../db/schema.ts";

const { updateCalls, fakeRepos, trackedRow } = vi.hoisted(() => ({
  updateCalls: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  fakeRepos: [] as Array<{ did: string }>,
  trackedRow: [{ lastSeenRev: null as string | null }],
}));

vi.mock("../../db/index.ts", () => {
  return {
    db: {
      select: () => ({
        from: (table: unknown) => {
          if (table === trackedRepos) {
            return {
              where: () => ({
                // The round-robin batch query...
                orderBy: () => ({
                  limit: async () => fakeRepos,
                }),
                // ...and the single-row `last_seen_rev` lookup.
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

vi.mock("../atproto/identity.ts", () => ({
  resolveIdentity: vi.fn(),
}));

class MockRepoGoneError extends Error {
  constructor(
    public readonly did: string,
    public readonly pds: string,
    message: string,
    public readonly triedFreshIdentity = false,
  ) {
    super(message);
    this.name = "RepoGoneError";
  }
}

vi.mock("../atproto/fetch-record.ts", () => ({
  RepoGoneError: MockRepoGoneError,
  fetchRepoHeadRev: vi.fn(),
  listRepoRecords: vi.fn(),
}));

const { resolveIdentity } = await import("../atproto/identity.ts");
const { fetchRepoHeadRev, listRepoRecords } =
  await import("../atproto/fetch-record.ts");
const { reconcilePublisherReposBatch } = await import("./repo-sync.ts");

describe("reconcilePublisherReposBatch backoff", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    fakeRepos.length = 0;
    trackedRow[0].lastSeenRev = null;
    vi.mocked(resolveIdentity).mockReset();
    vi.mocked(listRepoRecords).mockReset();
    vi.mocked(fetchRepoHeadRev).mockReset();
    vi.mocked(fetchRepoHeadRev).mockResolvedValue(null);
  });

  it("backs off a DID with no resolvable PDS instead of retrying every tick", async () => {
    fakeRepos.push({ did: "did:plc:no-pds" });
    vi.mocked(resolveIdentity).mockResolvedValue({
      did: "did:plc:no-pds",
      pds: null,
      handle: null,
    });

    const result = await reconcilePublisherReposBatch(1);

    expect(result.attempted).toBe(1);
    // one update to bump the fail count, one to set the retry-after cooldown.
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1].values.reconcileRetryAfter).toBeInstanceOf(Date);
    expect(
      (updateCalls[1].values.reconcileRetryAfter as Date).getTime(),
    ).toBeGreaterThan(Date.now());
  });

  it("backs off a DID whose PDS fetch throws a transient error", async () => {
    fakeRepos.push({ did: "did:plc:transient-error" });
    vi.mocked(resolveIdentity).mockResolvedValue({
      did: "did:plc:transient-error",
      pds: "https://pds.example.com",
      handle: null,
    });
    vi.mocked(listRepoRecords).mockRejectedValue(new Error("fetch failed"));

    const result = await reconcilePublisherReposBatch(1);

    expect(result.attempted).toBe(1);
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1].values.reconcileRetryAfter).toBeInstanceOf(Date);
  });

  it("clears backoff state on a successful reconcile", async () => {
    fakeRepos.push({ did: "did:plc:healthy" });
    vi.mocked(resolveIdentity).mockResolvedValue({
      did: "did:plc:healthy",
      pds: "https://pds.example.com",
      handle: null,
    });
    vi.mocked(listRepoRecords).mockResolvedValue({
      records: [],
      servedBy: "https://pds.example.com",
    });

    const result = await reconcilePublisherReposBatch(1);

    expect(result.attempted).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({
      reconcileFailCount: 0,
      reconcileRetryAfter: null,
    });
  });
});

describe("repair gating on the repo head rev", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    fakeRepos.length = 0;
    trackedRow[0].lastSeenRev = null;
    vi.mocked(resolveIdentity).mockReset();
    vi.mocked(listRepoRecords).mockReset();
    vi.mocked(fetchRepoHeadRev).mockReset();
    vi.mocked(resolveIdentity).mockResolvedValue({
      did: "did:plc:gated",
      pds: "https://pds.example.com",
      handle: null,
    });
    vi.mocked(listRepoRecords).mockResolvedValue({
      records: [],
      servedBy: "https://pds.example.com",
    });
  });

  it("skips a repo whose head still matches the last mirrored rev", async () => {
    fakeRepos.push({ did: "did:plc:gated" });
    trackedRow[0].lastSeenRev = "3mrxucaa6v32m";
    vi.mocked(fetchRepoHeadRev).mockResolvedValue("3mrxucaa6v32m");

    const result = await reconcilePublisherReposBatch(1);

    expect(result.attempted).toBe(1);
    // Nothing has been committed since we mirrored it — no enumeration at all.
    expect(listRepoRecords).not.toHaveBeenCalled();
    expect(result.results).toHaveLength(0);
  });

  it("reconciles a repo whose head has moved past the mirrored rev", async () => {
    fakeRepos.push({ did: "did:plc:gated" });
    trackedRow[0].lastSeenRev = "3mpx46g3rfk2v";
    vi.mocked(fetchRepoHeadRev).mockResolvedValue("3mrxucaa6v32m");

    const result = await reconcilePublisherReposBatch(1);

    expect(listRepoRecords).toHaveBeenCalled();
    expect(result.results).toHaveLength(1);
    // The new head is recorded only after the repair completes.
    expect(
      updateCalls.some((call) => call.values.lastSeenRev === "3mrxucaa6v32m"),
    ).toBe(true);
  });

  it("reconciles when the head can't be read, rather than assuming unchanged", async () => {
    // An unreadable head is exactly the situation this sweep exists to catch;
    // treating it as "nothing changed" would reproduce the silence.
    fakeRepos.push({ did: "did:plc:gated" });
    trackedRow[0].lastSeenRev = "3mpx46g3rfk2v";
    vi.mocked(fetchRepoHeadRev).mockResolvedValue(null);

    const result = await reconcilePublisherReposBatch(1);

    expect(listRepoRecords).toHaveBeenCalled();
    expect(result.results).toHaveLength(1);
    // Nothing to record — a null head must not be stored as a clean sync.
    expect(updateCalls.some((call) => "lastSeenRev" in call.values)).toBe(
      false,
    );
  });
});
