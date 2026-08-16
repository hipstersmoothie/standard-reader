import { encode as cborEncode } from "@ipld/dag-cbor";
import { describe, expect, it } from "vitest";

import { toIngestRecordPayload } from "./jetstream-event.ts";

/** A Jetstream v2 raw commit, shaped like the SDK's `RawEvent`. */
function commit(
  overrides: Partial<{
    operation: "create" | "update" | "delete";
    record: unknown;
  }> = {},
) {
  const operation = overrides.operation ?? "create";
  return {
    commit: {
      collection: "site.standard.publication",
      operation,
      rev: "3miycvsdxtc2e",
      rkey: "3miycvsdxtc2e",
      ...(operation === "delete"
        ? {}
        : {
            cid: "bafyreiaz3a4wugyjpcbxg22gabsplrv4vvaew2pkvsjh3ns2lbftuzyehi",
            record: overrides.record ?? {
              $type: "site.standard.publication",
              name: "Hayden",
            },
          }),
    },
    did: "did:plc:puvaym5ytsvejx3rwjrnxhvb",
    kind: "commit",
    seq: 1_811_456,
    time: "2026-08-13T06:47:43.959305Z",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("toIngestRecordPayload", () => {
  it("maps a live JSON commit onto the tap payload the dispatcher expects", () => {
    const payload = toIngestRecordPayload(commit(), { live: true });
    expect(payload).toEqual({
      action: "create",
      cid: "bafyreiaz3a4wugyjpcbxg22gabsplrv4vvaew2pkvsjh3ns2lbftuzyehi",
      collection: "site.standard.publication",
      did: "did:plc:puvaym5ytsvejx3rwjrnxhvb",
      live: true,
      record: { $type: "site.standard.publication", name: "Hayden" },
      rev: "3miycvsdxtc2e",
      rkey: "3miycvsdxtc2e",
    });
  });

  it("decodes an archived DAG-CBOR record", () => {
    const record = { $type: "site.standard.publication", name: "Hayden" };
    const payload = toIngestRecordPayload(
      commit({ record: cborEncode(record) }),
      { live: false },
    );
    expect(payload?.record).toEqual(record);
    expect(payload?.live).toBe(false);
  });

  /**
   * The reason this module decodes CBOR itself instead of using the SDK's typed
   * mode: `parseRawRecord` throws on a record with no `$type`, and the SDK
   * responds by reporting the throw and *skipping the event*. Roughly 0.05% of
   * standard.site records on the network are shaped like this, and they are
   * live publications and documents, not junk — our handlers dispatch on the
   * commit's `collection` and never read `$type` at all.
   */
  it("keeps a record that carries no $type", () => {
    const record = { name: "Hayden", url: "https://example.com" };
    const payload = toIngestRecordPayload(
      commit({ record: cborEncode(record) }),
      { live: false },
    );
    expect(payload?.record).toEqual(record);
  });

  it("omits cid and record on a delete", () => {
    const payload = toIngestRecordPayload(commit({ operation: "delete" }), {
      live: true,
    });
    expect(payload).toEqual({
      action: "delete",
      collection: "site.standard.publication",
      did: "did:plc:puvaym5ytsvejx3rwjrnxhvb",
      live: true,
      rev: "3miycvsdxtc2e",
      rkey: "3miycvsdxtc2e",
    });
  });

  it("ignores non-commit kinds", () => {
    const identity = {
      did: "did:plc:puvaym5ytsvejx3rwjrnxhvb",
      identity: {
        did: "did:plc:puvaym5ytsvejx3rwjrnxhvb",
        handle: "a.example",
      },
      kind: "identity",
      seq: 1,
      time: "2026-08-13T06:47:43.959305Z",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(toIngestRecordPayload(identity, { live: true })).toBeNull();
  });
});
