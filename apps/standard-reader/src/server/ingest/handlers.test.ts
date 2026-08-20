import { beforeEach, describe, expect, it, vi } from "vitest";

import { documents, publications, subscriptions } from "../../db/schema.ts";

const { updateCalls, selectRows, listRepoRecordsImpl, resolveIdentityImpl } =
  vi.hoisted(() => ({
    updateCalls: [] as Array<{
      table: unknown;
      values: Record<string, unknown>;
    }>,
    selectRows: [] as Array<{ uri: string; rkey: string }>,
    listRepoRecordsImpl: vi.fn(),
    resolveIdentityImpl: vi.fn(),
  }));

vi.mock("../../db/index.ts", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => selectRows,
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updateCalls.push({ table, values });
        return { where: async () => {} };
      },
    }),
  },
}));

vi.mock("../atproto/fetch-record.ts", () => ({
  listRepoRecords: listRepoRecordsImpl,
}));

vi.mock("../atproto/identity.ts", () => ({
  INVALID_HANDLE: "handle.invalid",
  authorPds: vi.fn(),
  getCachedIdentity: vi.fn(() => null),
  isUsableHandle: vi.fn(() => true),
  primeIdentityHandle: vi.fn(),
  refreshIdentity: vi.fn(),
  resolveIdentity: resolveIdentityImpl,
}));

const { reconcilePublicationGroup } = await import("./handlers.ts");

const DID = "did:plc:bpotnohnlgcj3fbmp7ugx4en";
const URL = "https://example.com/site";
const OLD_URI = `at://${DID}/site.standard.publication/aaaaold`;
const NEW_URI = `at://${DID}/site.standard.publication/zzzznew`;

describe("reconcilePublicationGroup", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    selectRows.length = 0;
    listRepoRecordsImpl.mockReset();
    resolveIdentityImpl.mockReset();
    resolveIdentityImpl.mockResolvedValue({
      did: DID,
      handle: "example.bsky.social",
      pds: "https://pds.example.com",
    });
  });

  it("collapses a candidate the PDS confirms is gone", async () => {
    selectRows.push(
      { uri: OLD_URI, rkey: "aaaaold" },
      { uri: NEW_URI, rkey: "zzzznew" },
    );
    // Only the newer record still exists in the repo.
    listRepoRecordsImpl.mockResolvedValue({
      records: [{ uri: NEW_URI }],
      servedBy: "https://pds.example.com",
    });

    await reconcilePublicationGroup(DID, URL);

    const pubDeleteTrue = updateCalls.find(
      (call) => call.table === publications && call.values.deleted === true,
    );
    const pubDeleteFalse = updateCalls.find(
      (call) => call.table === publications && call.values.deleted === false,
    );
    const docRepoint = updateCalls.find((call) => call.table === documents);
    const subRepoint = updateCalls.find((call) => call.table === subscriptions);

    expect(pubDeleteTrue).toBeDefined();
    expect(pubDeleteFalse).toBeDefined();
    expect(docRepoint?.values.publicationUri).toBe(NEW_URI);
    expect(subRepoint?.values.publicationUri).toBe(NEW_URI);
  });

  it("leaves two publications alone when the PDS confirms both are still live", async () => {
    // Regression: two genuinely distinct publications (e.g. a second one left
    // on a platform's un-customized default URL) sharing a `(did, url)` must
    // never be collapsed just because they group together — only a record the
    // repo no longer serves is a "superseded duplicate".
    selectRows.push(
      { uri: OLD_URI, rkey: "aaaaold" },
      { uri: NEW_URI, rkey: "zzzznew" },
    );
    listRepoRecordsImpl.mockResolvedValue({
      records: [{ uri: OLD_URI }, { uri: NEW_URI }],
      servedBy: "https://pds.example.com",
    });

    await reconcilePublicationGroup(DID, URL);

    expect(updateCalls).toHaveLength(0);
  });

  it("touches nothing when the repo can't be checked", async () => {
    selectRows.push(
      { uri: OLD_URI, rkey: "aaaaold" },
      { uri: NEW_URI, rkey: "zzzznew" },
    );
    listRepoRecordsImpl.mockRejectedValue(new Error("network error"));

    await reconcilePublicationGroup(DID, URL);

    expect(updateCalls).toHaveLength(0);
  });

  it("touches nothing when the identity has no resolvable PDS", async () => {
    selectRows.push(
      { uri: OLD_URI, rkey: "aaaaold" },
      { uri: NEW_URI, rkey: "zzzznew" },
    );
    resolveIdentityImpl.mockResolvedValue({
      did: DID,
      handle: null,
      pds: null,
    });

    await reconcilePublicationGroup(DID, URL);

    expect(listRepoRecordsImpl).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });
});
