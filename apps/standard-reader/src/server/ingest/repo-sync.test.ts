import { beforeEach, describe, expect, it, vi } from "vitest";

import { trackedRepos } from "../../db/schema.ts";

const { updateCalls, fakeRepos } = vi.hoisted(() => ({
  updateCalls: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  fakeRepos: [] as Array<{ did: string }>,
}));

vi.mock("../../db/index.ts", () => {
  return {
    db: {
      select: () => ({
        from: (table: unknown) => {
          if (table === trackedRepos) {
            return {
              where: () => ({
                orderBy: () => ({
                  limit: async () => fakeRepos,
                }),
              }),
            };
          }
          // publications / documents prune lookups — no stale rows in these tests.
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
  listRepoRecords: vi.fn(),
}));

const { resolveIdentity } = await import("../atproto/identity.ts");
const { listRepoRecords } = await import("../atproto/fetch-record.ts");
const { reconcilePublisherReposBatch } = await import("./repo-sync.ts");

describe("reconcilePublisherReposBatch backoff", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    fakeRepos.length = 0;
    vi.mocked(resolveIdentity).mockReset();
    vi.mocked(listRepoRecords).mockReset();
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
