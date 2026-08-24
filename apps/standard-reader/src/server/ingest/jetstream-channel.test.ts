import { describe, expect, it, vi } from "vitest";

import type { IngestEvent } from "../atproto/types.ts";
import type { ProcessResult } from "./consumer.ts";
import { isStalled } from "./jetstream-channel.ts";

/**
 * The cursor-commit rule, extracted from `startJetstreamChannel`.
 *
 * These are the two invariants that make at-least-once safe, and the soak
 * proved that satisfying only the first one wedges the channel:
 *
 *  1. Never commit past an event that is not durably handled.
 *  2. Always make forward progress — a batch that cannot be committed has to
 *     stop the channel, because nothing re-delivers it while the process lives.
 */
interface PendingBatch {
  lastCursor: number;
  remaining: number;
  unhandled: boolean;
}

function drainCommitted(inflight: Array<PendingBatch>): {
  commit: number | undefined;
  halted: boolean;
} {
  let commit: number | undefined;
  while (inflight.length > 0 && inflight[0].remaining === 0) {
    const head = inflight[0];
    if (head.unhandled) return { commit, halted: true };
    inflight.shift();
    commit = head.lastCursor;
  }
  return { commit, halted: false };
}

describe("cursor commit", () => {
  it("commits the contiguous applied prefix, not the highest finished batch", () => {
    // Batches finish out of order under concurrent appliers. Committing the
    // highest finished one would skip the middle batch on a crash.
    const inflight: Array<PendingBatch> = [
      { lastCursor: 100, remaining: 0, unhandled: false },
      { lastCursor: 200, remaining: 2, unhandled: false },
      { lastCursor: 300, remaining: 0, unhandled: false },
    ];

    expect(drainCommitted(inflight).commit).toBe(100);
    // The unfinished batch and everything behind it stay queued.
    expect(inflight.map((b) => b.lastCursor)).toEqual([200, 300]);
  });

  it("commits through once the blocking batch finishes", () => {
    const inflight: Array<PendingBatch> = [
      { lastCursor: 200, remaining: 0, unhandled: false },
      { lastCursor: 300, remaining: 0, unhandled: false },
    ];

    expect(drainCommitted(inflight).commit).toBe(300);
    expect(inflight).toHaveLength(0);
  });

  it("halts rather than freezing when a batch cannot be handled", () => {
    // The bug this pins: the original code `break`ed here, which held the
    // cursor correctly but never recovered. The batch is already consumed from
    // the stream, so nothing re-delivers it — the cursor stayed frozen while
    // workers kept applying later events and `inflight` grew without bound.
    // Halting lets the process restart and resume from the last good cursor.
    const inflight: Array<PendingBatch> = [
      { lastCursor: 100, remaining: 0, unhandled: false },
      { lastCursor: 200, remaining: 0, unhandled: true },
      { lastCursor: 300, remaining: 0, unhandled: false },
    ];

    const result = drainCommitted(inflight);

    // Everything before the failure still commits...
    expect(result.commit).toBe(100);
    // ...and the channel stops instead of advancing past the gap.
    expect(result.halted).toBe(true);
    expect(inflight[0].lastCursor).toBe(200);
  });

  it("never commits when the very first batch is unhandled", () => {
    const inflight: Array<PendingBatch> = [
      { lastCursor: 200, remaining: 0, unhandled: true },
    ];

    const result = drainCommitted(inflight);

    expect(result.commit).toBeUndefined();
    expect(result.halted).toBe(true);
  });
});

/** The retry budget that keeps a dropped connection from costing a restart. */
async function applyWithRetries(
  event: IngestEvent,
  process_: (event: IngestEvent) => Promise<ProcessResult>,
  attempts: number,
): Promise<ProcessResult> {
  let result: ProcessResult = "unhandled";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = await process_(event);
    if (result !== "unhandled") break;
  }
  return result;
}

describe("unhandled retries", () => {
  const event = { id: 1, record: {}, type: "record" } as unknown as IngestEvent;

  it("recovers from a transient failure without halting the channel", async () => {
    // Every `unhandled` seen in the soak was a dropped Neon connection that the
    // next attempt survived — retrying is far cheaper than a restart.
    const process_ = vi
      .fn<(e: IngestEvent) => Promise<ProcessResult>>()
      .mockResolvedValueOnce("unhandled")
      .mockResolvedValueOnce("applied");

    expect(await applyWithRetries(event, process_, 3)).toBe("applied");
    expect(process_).toHaveBeenCalledTimes(2);
  });

  it("gives up after the budget so a real outage still halts", async () => {
    const process_ = vi
      .fn<(e: IngestEvent) => Promise<ProcessResult>>()
      .mockResolvedValue("unhandled");

    expect(await applyWithRetries(event, process_, 3)).toBe("unhandled");
    expect(process_).toHaveBeenCalledTimes(3);
  });

  it("does not retry a dead-lettered event — it is already durable", async () => {
    const process_ = vi
      .fn<(e: IngestEvent) => Promise<ProcessResult>>()
      .mockResolvedValue("dead-lettered");

    expect(await applyWithRetries(event, process_, 3)).toBe("dead-lettered");
    expect(process_).toHaveBeenCalledTimes(1);
  });
});

/**
 * The stall watchdog, which exists because a wedged iterator is otherwise
 * indistinguishable from a quiet network: the SDK retries downloads forever
 * with no error callback, so the channel yields nothing, logs nothing, and
 * heartbeats `idleMs=-1` — for 22 hours, in the incident this came from.
 */
describe("isStalled", () => {
  const COLD = 5 * 60_000;
  const RUNNING = 60 * 60_000;

  it("halts a cold start that has produced nothing", () => {
    // Every restart resumes from a cursor behind the sealed tip, so the archive
    // phase always has a backlog and yields its first batch in seconds.
    expect(isStalled(0, COLD, COLD, RUNNING)).toBe(true);
  });

  it("gives a cold start time to plan and fetch its first page", () => {
    expect(isStalled(0, 60_000, COLD, RUNNING)).toBe(false);
  });

  it("tolerates an overnight lull once batches are flowing", () => {
    // A midday sample of our collection filter saw six commits in a minute
    // with a 38s gap. Ten minutes of quiet is normal; restarting on it would
    // bounce the worker all night.
    expect(isStalled(1, 10 * 60_000, COLD, RUNNING)).toBe(false);
  });

  it("still halts a running channel that goes silent for an hour", () => {
    expect(isStalled(4210, RUNNING, COLD, RUNNING)).toBe(true);
  });
});
