import { describe, expect, it } from "vitest";

import { setCapped } from "#/lib/capped-map";

describe("setCapped", () => {
  it("evicts the oldest entries past the cap", () => {
    const cache = new Map<string, number>();
    for (let index = 0; index < 10; index++) {
      setCapped(cache, `key-${index}`, index, 3);
    }
    expect([...cache.keys()]).toEqual(["key-7", "key-8", "key-9"]);
  });

  it("moves a re-set key to the newest slot", () => {
    const cache = new Map<string, number>();
    setCapped(cache, "a", 1, 2);
    setCapped(cache, "b", 2, 2);
    setCapped(cache, "a", 3, 2);
    setCapped(cache, "c", 4, 2);
    expect([...cache.entries()]).toEqual([
      ["a", 3],
      ["c", 4],
    ]);
  });
});
