// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAllLocalProgress,
  clearLocalProgress,
  isResumableProgress,
  READING_PROGRESS_DONE,
  READING_PROGRESS_MIN,
  readLocalProgress,
  writeLocalProgress,
} from "./reading-progress";

const URI = "at://did:plc:author/site.standard.document/aaa";

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe("isResumableProgress", () => {
  it("ignores an article the reader barely opened", () => {
    expect(isResumableProgress(0)).toBe(false);
    expect(isResumableProgress(READING_PROGRESS_MIN / 2)).toBe(false);
  });

  it("ignores an article the reader finished", () => {
    expect(isResumableProgress(READING_PROGRESS_DONE)).toBe(false);
    expect(isResumableProgress(1)).toBe(false);
  });

  it("resumes everything in between", () => {
    expect(isResumableProgress(READING_PROGRESS_MIN)).toBe(true);
    expect(isResumableProgress(0.5)).toBe(true);
  });
});

describe("writeLocalProgress", () => {
  it("round-trips a mid-article position", () => {
    writeLocalProgress(URI, 0.42, "2026-08-12T10:00:00.000Z");
    expect(readLocalProgress(URI)).toEqual({
      progress: 0.42,
      updatedAt: "2026-08-12T10:00:00.000Z",
    });
  });

  it("forgets the article once the reader reaches the end", () => {
    writeLocalProgress(URI, 0.42);
    writeLocalProgress(URI, 0.99);
    expect(readLocalProgress(URI)).toBeNull();
  });

  it("forgets the article when the reader scrolls back to the top", () => {
    writeLocalProgress(URI, 0.42);
    writeLocalProgress(URI, 0);
    expect(readLocalProgress(URI)).toBeNull();
  });

  it("never stores an article that was only glanced at", () => {
    writeLocalProgress(URI, 0.001);
    expect(readLocalProgress(URI)).toBeNull();
  });

  it("keeps articles apart", () => {
    const other = "at://did:plc:author/site.standard.document/bbb";
    writeLocalProgress(URI, 0.2);
    writeLocalProgress(other, 0.8);
    expect(readLocalProgress(URI)?.progress).toBe(0.2);
    expect(readLocalProgress(other)?.progress).toBe(0.8);
  });

  it("evicts the oldest positions past the cap, keeping the newest", () => {
    // 120 articles, oldest first, one minute apart — the cap is 100.
    const base = Date.UTC(2026, 0, 1);
    for (let index = 0; index < 120; index++) {
      writeLocalProgress(
        `at://did:plc:author/site.standard.document/${index}`,
        0.5,
        new Date(base + index * 60_000).toISOString(),
      );
    }

    // The most recent write survives; the very first one does not.
    expect(
      readLocalProgress("at://did:plc:author/site.standard.document/119"),
    ).not.toBeNull();
    expect(
      readLocalProgress("at://did:plc:author/site.standard.document/0"),
    ).toBeNull();
  });
});

describe("clearing", () => {
  it("forgets one article", () => {
    writeLocalProgress(URI, 0.42);
    clearLocalProgress(URI);
    expect(readLocalProgress(URI)).toBeNull();
  });

  it("forgets everything", () => {
    writeLocalProgress(URI, 0.42);
    writeLocalProgress("at://did:plc:author/site.standard.document/bbb", 0.6);
    clearAllLocalProgress();
    expect(readLocalProgress(URI)).toBeNull();
  });

  it("survives a corrupt stored value", () => {
    globalThis.localStorage.setItem(
      "standard-reader:reading-progress",
      "not json",
    );
    expect(readLocalProgress(URI)).toBeNull();
    expect(() => writeLocalProgress(URI, 0.42)).not.toThrow();
    expect(readLocalProgress(URI)?.progress).toBe(0.42);
  });
});
