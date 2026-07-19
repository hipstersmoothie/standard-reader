import type { Client } from "@atcute/client";
import { describe, expect, it, vi } from "vitest";

import {
  ApplyWritesUnacknowledgedError,
  repoApplyWrites,
} from "#/server/atproto/repo-records";

const logEvent = vi.hoisted(() => vi.fn());
vi.mock("#/server/observability/log", () => ({ logEvent }));

function clientReturning(data: unknown): Client {
  return {
    post: async () => ({ ok: true as const, data }),
  } as unknown as Client;
}

function writes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    $type: "com.atproto.repo.applyWrites#create" as const,
    collection: "app.standard-reader.read",
    rkey: `rkey${i}`,
    value: { subject: `at://did:plc:pub/site.standard.document/doc${i}` },
  }));
}

const result = (i: number) => ({
  uri: `at://did:plc:reader/app.standard-reader.read/rkey${i}`,
  cid: `cid${i}`,
});

describe("repoApplyWrites", () => {
  it("returns a result per acknowledged write", async () => {
    const client = clientReturning({
      results: [0, 1, 2].map((i) => result(i)),
    });

    const results = await repoApplyWrites(client, {
      repo: "did:plc:reader",
      writes: writes(3),
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual(result(0));
  });

  it("throws when the PDS acknowledges fewer writes than we sent", async () => {
    // The observed failure: 2xx, no error, but nothing actually committed.
    const client = clientReturning({ results: [] });

    await expect(
      repoApplyWrites(client, { repo: "did:plc:reader", writes: writes(100) }),
    ).rejects.toThrow(ApplyWritesUnacknowledgedError);
  });

  it("reports how many writes went unacknowledged", async () => {
    const client = clientReturning({ results: [0, 1].map((i) => result(i)) });

    await repoApplyWrites(client, {
      repo: "did:plc:reader",
      writes: writes(5),
    }).catch((error: unknown) => {
      expect(error).toBeInstanceOf(ApplyWritesUnacknowledgedError);
      const failure = error as ApplyWritesUnacknowledgedError;
      expect(failure.requested).toBe(5);
      expect(failure.acknowledged).toBe(2);
    });

    expect.assertions(3);
  });

  it("tolerates a PDS that omits results, but records it as unconfirmed", async () => {
    logEvent.mockClear();
    const client = clientReturning({});

    const results = await repoApplyWrites(client, {
      repo: "did:plc:reader",
      writes: writes(10),
    });

    expect(results).toEqual([]);
    expect(logEvent).toHaveBeenCalledWith("atproto.applyWritesUnconfirmed", {
      repo: "did:plc:reader",
      requested: 10,
    });
  });

  it("maps malformed result rows to null without failing the batch", async () => {
    const client = clientReturning({ results: [result(0), { bogus: true }] });

    const results = await repoApplyWrites(client, {
      repo: "did:plc:reader",
      writes: writes(2),
    });

    expect(results).toEqual([result(0), null]);
  });
});
