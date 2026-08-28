import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidateProfile } from "./profile-refresh.ts";

const { fetchRepoRecordWithFallback, refreshIdentity, upsertBskyProfile } =
  vi.hoisted(() => ({
    fetchRepoRecordWithFallback: vi.fn(),
    refreshIdentity: vi.fn(),
    upsertBskyProfile: vi.fn(),
  }));

vi.mock("../../db/index.ts", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => null }) }),
  },
}));

vi.mock("../atproto/fetch-record.ts", () => ({ fetchRepoRecordWithFallback }));

vi.mock("../atproto/identity.ts", () => ({ refreshIdentity }));

vi.mock("./handlers.ts", () => ({
  applyIdentity: vi.fn(),
  upsertBskyProfile,
}));

/** Let the fire-and-forget refresh run to completion. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** A DID nothing else in this file has revalidated — the dedupe memo is
 * process-wide and deliberately has no reset hook. */
let next = 0;
function freshDid(): string {
  next += 1;
  return `did:plc:revalidate${next}`;
}

describe("revalidateProfile", () => {
  beforeEach(() => {
    refreshIdentity.mockReset().mockResolvedValue({ handle: null, pds: null });
    upsertBskyProfile.mockReset().mockResolvedValue(null);
    fetchRepoRecordWithFallback
      .mockReset()
      .mockResolvedValue({ cid: "cid1", value: { displayName: "Vic" } });
  });

  it("re-mirrors a profile the sweep last touched hours ago", async () => {
    revalidateProfile(freshDid(), {
      fetchedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await settle();
    expect(upsertBskyProfile).toHaveBeenCalledTimes(1);
  });

  it("costs nothing for a profile the sweep just covered", async () => {
    revalidateProfile(freshDid(), { fetchedAt: new Date() });
    await settle();
    expect(upsertBskyProfile).not.toHaveBeenCalled();
  });

  it("refreshes a profile we have never fetched", async () => {
    revalidateProfile(freshDid(), { fetchedAt: null });
    await settle();
    expect(upsertBskyProfile).toHaveBeenCalledTimes(1);
  });

  // A profile page and a hovercard over the same author must not each cost a
  // DID-document fetch and a repo read.
  it("refreshes a DID at most once per window", async () => {
    const did = freshDid();
    revalidateProfile(did, { fetchedAt: null });
    await settle();
    revalidateProfile(did, { fetchedAt: null });
    await settle();
    expect(upsertBskyProfile).toHaveBeenCalledTimes(1);
  });

  it("keeps backing off after a failed refresh", async () => {
    const did = freshDid();
    fetchRepoRecordWithFallback.mockRejectedValue(new Error("PDS is down"));
    revalidateProfile(did, { fetchedAt: null });
    await settle();
    fetchRepoRecordWithFallback.mockResolvedValue({ cid: "cid1", value: {} });
    revalidateProfile(did, { fetchedAt: null });
    await settle();
    expect(upsertBskyProfile).not.toHaveBeenCalled();
  });

  // Sign-in knows the reader's identity may have just changed, so it must not
  // be gated on when the sweep last looked.
  it("forces past a freshly-swept row", async () => {
    revalidateProfile(freshDid(), { fetchedAt: new Date(), force: true });
    await settle();
    expect(upsertBskyProfile).toHaveBeenCalledTimes(1);
  });

  it("still dedupes a forced refresh", async () => {
    const did = freshDid();
    revalidateProfile(did, { force: true });
    await settle();
    revalidateProfile(did, { force: true });
    await settle();
    expect(upsertBskyProfile).toHaveBeenCalledTimes(1);
  });
});
