import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  indexDocumentOnDemand,
  resetOnDemandIndexingForTests,
} from "./on-demand.ts";

const { fetchRecord, upsertDocument } = vi.hoisted(() => ({
  fetchRecord: vi.fn(),
  upsertDocument: vi.fn(),
}));

vi.mock("../atproto/fetch-record.ts", () => ({
  fetchRepoRecordWithFallback: fetchRecord,
}));
vi.mock("../atproto/identity.ts", () => ({
  resolveIdentity: async (did: string) => ({
    did,
    handle: null,
    pds: "https://pds.example",
  }),
}));
vi.mock("../observability/log.ts", () => ({ logEvent: () => {} }));
vi.mock("./handlers.ts", () => ({ upsertDocument }));

const DID = "did:plc:anbhmngzs3exwbq47xxzogk4";
const URI = `at://${DID}/site.standard.document/3mv75ms6rjxky`;
const RECORD = { site: "https://example.com", title: "Hello" };

describe("indexDocumentOnDemand", () => {
  beforeEach(() => {
    resetOnDemandIndexingForTests();
    fetchRecord.mockReset();
    upsertDocument.mockReset();
    fetchRecord.mockResolvedValue({ value: RECORD, cid: "bafy", base: "x" });
  });

  it("fetches the record from the author's PDS and upserts it", async () => {
    await expect(indexDocumentOnDemand(URI)).resolves.toBe(true);
    expect(fetchRecord).toHaveBeenCalledWith(
      URI,
      "https://pds.example",
      expect.any(Number),
      { preferPds: true },
    );
    expect(upsertDocument).toHaveBeenCalledWith(
      URI,
      DID,
      "3mv75ms6rjxky",
      "bafy",
      RECORD,
    );
  });

  it("ignores anything that isn't a site.standard.document", async () => {
    await expect(
      indexDocumentOnDemand(`at://${DID}/app.bsky.feed.post/3mv75ms6rjxky`),
    ).resolves.toBe(false);
    await expect(indexDocumentOnDemand("https://example.com")).resolves.toBe(
      false,
    );
    await expect(
      indexDocumentOnDemand("at://did:plc:nope/site.standard.document/x"),
    ).resolves.toBe(false);
    expect(fetchRecord).not.toHaveBeenCalled();
  });

  it("shares one fetch between concurrent misses", async () => {
    const results = await Promise.all([
      indexDocumentOnDemand(URI),
      indexDocumentOnDemand(URI),
    ]);
    expect(results).toEqual([true, true]);
    expect(fetchRecord).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry a URI inside the retry window", async () => {
    fetchRecord.mockResolvedValue(null);
    await expect(indexDocumentOnDemand(URI)).resolves.toBe(false);
    await expect(indexDocumentOnDemand(URI)).resolves.toBe(false);
    expect(fetchRecord).toHaveBeenCalledTimes(1);
    expect(upsertDocument).not.toHaveBeenCalled();
  });

  it("reports failure instead of throwing", async () => {
    upsertDocument.mockRejectedValue(new Error("db down"));
    await expect(indexDocumentOnDemand(URI)).resolves.toBe(false);
  });
});
