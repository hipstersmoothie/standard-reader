import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as LedgerModule from "./ledger.ts";
import type { ClaimResult } from "./ledger.ts";
import type * as ThreadModule from "./thread.ts";
import type { PostThreadOptions, StrongRef } from "./thread.ts";

vi.mock("../../db/index.ts", () => ({ db: {} }));
vi.mock("../../db/schema.ts", () => ({}));
vi.mock("#/lib/public-url", () => ({
  getPublicUrl: () => "https://standard-reader.app",
}));

const weekInReviewArticles = vi.fn();
vi.mock("#/server/reader/queries", () => ({
  weekInReviewArticles: (...args: Array<unknown>) =>
    weekInReviewArticles(...args),
}));

const loginAsReaderBot = vi.fn(async () => ({
  client: {},
  handle: "reader.bot",
  repo: "did:plc:bot",
}));
vi.mock("./client.ts", () => ({
  loginAsReaderBot: () => loginAsReaderBot(),
}));

const postThread = vi.fn();
const findWeekThreadRoot = vi.fn(
  async (
    _client: unknown,
    _repo: string,
    _periodKey: string,
  ): Promise<string | null> => null,
);
vi.mock("./thread.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof ThreadModule>()),
  fetchThumbBlob: async () => null,
  findWeekThreadRoot: (client: unknown, repo: string, periodKey: string) =>
    findWeekThreadRoot(client, repo, periodKey),
  postThread: (
    client: unknown,
    repo: string,
    specs: Array<unknown>,
    options: PostThreadOptions,
  ) => postThread(client, repo, specs, options),
}));

const claimWeek = vi.fn();
const markRootPosted = vi.fn(
  async (_periodKey: string, _rootUri: string) => {},
);
const markThreadComplete = vi.fn(
  async (_periodKey: string, _postCount: number) => {},
);
const releaseWeek = vi.fn(
  async (
    _periodKey: string,
    _state: "skipped" | "failed",
    _lastError?: string | null,
  ) => {},
);
vi.mock("./ledger.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof LedgerModule>()),
  claimWeek: (periodKey: string, options?: { force?: boolean }) =>
    claimWeek(periodKey, options),
  markRootPosted: (periodKey: string, rootUri: string) =>
    markRootPosted(periodKey, rootUri),
  markThreadComplete: (periodKey: string, postCount: number) =>
    markThreadComplete(periodKey, postCount),
  releaseWeek: (
    periodKey: string,
    state: "skipped" | "failed",
    lastError?: string | null,
  ) => releaseWeek(periodKey, state, lastError),
}));

const { runWeeklyThread } = await import("./run.ts");

function card(index: number) {
  return {
    authorDisplayName: "Ada",
    authorHandle: "ada.example",
    canonicalUrl: `https://example.com/${index}`,
    coverImageUrl: null,
    description: "",
    did: "did:plc:ada",
    publicationName: "Example",
    publishedAt: "2026-08-12T00:00:00.000Z",
    title: `Article ${index}`,
    uri: `at://did:plc:ada/site.standard.document/${index}`,
  };
}

const granted: ClaimResult = {
  attempts: 1,
  claimed: true,
  periodKey: "2026-W33",
};

function refs(n: number): Array<StrongRef> {
  return Array.from({ length: n }, (_, i) => ({
    cid: `cid-${i}`,
    uri: `at://did:plc:bot/app.bsky.feed.post/${i}`,
  }));
}

// Pin the clock to the Friday of 2026-W33 so the expected period key is fixed.
const FRIDAY = new Date("2026-08-14T16:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FRIDAY);
  delete process.env.THREAD_DRY_RUN;
  delete process.env.THREAD_FORCE;
  weekInReviewArticles.mockResolvedValue([card(1), card(2)]);
  claimWeek.mockResolvedValue(granted);
  findWeekThreadRoot.mockResolvedValue(null);
  postThread.mockImplementation(
    async (
      _client: unknown,
      _repo: string,
      specs: Array<unknown>,
      options: PostThreadOptions,
    ) => {
      const created = refs(specs.length);
      await options.onRoot?.(created[0]);
      return created;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runWeeklyThread once-a-week guard", () => {
  it("posts when it wins the week's claim", async () => {
    const summary = await runWeeklyThread();

    expect(claimWeek).toHaveBeenCalledWith("2026-W33", { force: false });
    expect(postThread).toHaveBeenCalledTimes(1);
    expect(summary.posted).toBe(3); // 2 articles + the CTA post
    expect(summary.skipped).toBeUndefined();
  });

  it("never hands postThread record keys to write over", async () => {
    await runWeeklyThread();

    const options = postThread.mock.calls[0][3] as PostThreadOptions;
    expect(options).not.toHaveProperty("rkeys");
  });

  it("stamps the real posting time, not a backdated week anchor", async () => {
    vi.setSystemTime(new Date("2026-08-16T09:30:00.000Z")); // Sunday catch-up

    await runWeeklyThread();

    const options = postThread.mock.calls[0][3] as PostThreadOptions;
    expect(options.createdAt).toBe("2026-08-16T09:30:00.000Z");
  });

  it("checks the repo for this week's thread before composing anything", async () => {
    await runWeeklyThread();

    expect(findWeekThreadRoot).toHaveBeenCalledWith(
      expect.anything(),
      "did:plc:bot",
      "2026-W33",
    );
    expect(findWeekThreadRoot.mock.invocationCallOrder[0]).toBeLessThan(
      postThread.mock.invocationCallOrder[0],
    );
  });

  it("stands down and repairs the ledger when the repo already has the thread", async () => {
    // The claim was granted — a wiped row, a different DB, a hand-run — but the
    // thread is demonstrably already out. Posting a second one is unfixable, so
    // the repo wins over the ledger.
    findWeekThreadRoot.mockResolvedValue(
      "at://did:plc:bot/app.bsky.feed.post/existing",
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const summary = await runWeeklyThread();

    expect(postThread).not.toHaveBeenCalled();
    expect(markRootPosted).toHaveBeenCalledWith(
      "2026-W33",
      "at://did:plc:bot/app.bsky.feed.post/existing",
    );
    expect(summary.skipped).toBe("already-posted");
    expect(summary.rootUri).toBe(
      "at://did:plc:bot/app.bsky.feed.post/existing",
    );
  });

  it("does not post when it cannot tell whether the thread already exists", async () => {
    findWeekThreadRoot.mockRejectedValue(new Error("PDS down"));

    await expect(runWeeklyThread()).rejects.toThrow("PDS down");

    expect(postThread).not.toHaveBeenCalled();
    expect(releaseWeek).toHaveBeenCalledWith("2026-W33", "failed", "PDS down");
  });

  it("posts nothing when this week's thread already went out", async () => {
    claimWeek.mockResolvedValue({
      claimed: false,
      periodKey: "2026-W33",
      reason: "already-posted",
      rootUri: "at://did:plc:bot/app.bsky.feed.post/root",
    });

    const summary = await runWeeklyThread();

    expect(loginAsReaderBot).not.toHaveBeenCalled();
    expect(postThread).not.toHaveBeenCalled();
    expect(summary.posted).toBe(0);
    expect(summary.skipped).toBe("already-posted");
    expect(summary.rootUri).toBe("at://did:plc:bot/app.bsky.feed.post/root");
  });

  it("posts nothing while another run holds the week", async () => {
    claimWeek.mockResolvedValue({
      claimed: false,
      periodKey: "2026-W33",
      reason: "in-progress",
      rootUri: null,
    });

    const summary = await runWeeklyThread();

    expect(postThread).not.toHaveBeenCalled();
    expect(summary.skipped).toBe("in-progress");
  });

  it("records the root before any reply is posted", async () => {
    const order: Array<string> = [];
    markRootPosted.mockImplementation(async () => {
      order.push("ledger");
    });
    postThread.mockImplementation(
      async (
        _client: unknown,
        _repo: string,
        specs: Array<unknown>,
        options: PostThreadOptions,
      ) => {
        const created = refs(specs.length);
        order.push("root-post");
        await options.onRoot?.(created[0]);
        order.push("replies");
        return created;
      },
    );

    await runWeeklyThread();

    expect(order).toEqual(["root-post", "ledger", "replies"]);
    expect(markRootPosted).toHaveBeenCalledWith(
      "2026-W33",
      "at://did:plc:bot/app.bsky.feed.post/0",
    );
    expect(markThreadComplete).toHaveBeenCalledWith("2026-W33", 3);
  });

  it("hands the week back when the run fails before posting", async () => {
    loginAsReaderBot.mockRejectedValueOnce(new Error("PDS down"));

    await expect(runWeeklyThread()).rejects.toThrow("PDS down");

    expect(releaseWeek).toHaveBeenCalledWith("2026-W33", "failed", "PDS down");
  });

  it("hands the week back when there is nothing to post", async () => {
    weekInReviewArticles.mockResolvedValue([]);

    const summary = await runWeeklyThread();

    expect(releaseWeek).toHaveBeenCalledWith("2026-W33", "skipped", undefined);
    expect(postThread).not.toHaveBeenCalled();
    expect(summary.posted).toBe(0);
  });

  it("reports the original failure even if releasing the week also fails", async () => {
    loginAsReaderBot.mockRejectedValueOnce(new Error("PDS down"));
    releaseWeek.mockRejectedValueOnce(new Error("DB down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runWeeklyThread()).rejects.toThrow("PDS down");
  });

  it("does not fail a run that posted just because bookkeeping failed", async () => {
    markThreadComplete.mockRejectedValueOnce(new Error("DB down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await runWeeklyThread();

    expect(summary.posted).toBe(3);
  });

  it("neither claims nor posts on a dry run", async () => {
    process.env.THREAD_DRY_RUN = "1";

    const summary = await runWeeklyThread();

    expect(claimWeek).not.toHaveBeenCalled();
    expect(postThread).not.toHaveBeenCalled();
    expect(summary.dryRun).toBe(true);
    expect(summary.periodKey).toBeNull();
  });

  it("overrides both guards when THREAD_FORCE is set", async () => {
    process.env.THREAD_FORCE = "1";
    findWeekThreadRoot.mockResolvedValue(
      "at://did:plc:bot/app.bsky.feed.post/existing",
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await runWeeklyThread();

    expect(claimWeek).toHaveBeenCalledWith("2026-W33", { force: true });
    // A forced run posts a genuinely new second thread — it does not reach for
    // the first one's records to rewrite them.
    expect(findWeekThreadRoot).not.toHaveBeenCalled();
    expect(postThread).toHaveBeenCalledTimes(1);
  });
});
