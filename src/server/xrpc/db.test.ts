import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor, nextCursor } from "./db";

describe("XRPC cursor pagination", () => {
  it("round-trips offsets through base64url cursors", () => {
    expect(decodeCursor(encodeCursor(24))).toBe(24);
    expect(decodeCursor()).toBe(0);
    expect(decodeCursor("not-a-cursor")).toBe(0);
  });

  it("nextCursor returns null when the page is exhausted", () => {
    expect(nextCursor(0, 20, 15)).toBeNull();
    expect(nextCursor(0, 20, 40)).toBe(encodeCursor(20));
  });
});
