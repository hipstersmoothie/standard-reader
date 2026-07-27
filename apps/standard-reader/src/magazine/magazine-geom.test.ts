import { describe, expect, it } from "vitest";

import {
  SPREAD_ENTER_WIDTH,
  SPREAD_EXIT_WIDTH,
  readGeom,
  resolveSpreadMode,
} from "./magazine-geom";

describe("resolveSpreadMode", () => {
  it("enters spread only in landscape at or above enter width", () => {
    expect(resolveSpreadMode(SPREAD_ENTER_WIDTH, 600, false)).toBe(true);
    expect(resolveSpreadMode(SPREAD_ENTER_WIDTH - 1, 600, false)).toBe(false);
    expect(resolveSpreadMode(900, 900, false)).toBe(false);
    expect(resolveSpreadMode(900, 899, false)).toBe(true);
  });

  it("stays in spread through square aspect until portrait", () => {
    expect(resolveSpreadMode(900, 900, true)).toBe(true);
    expect(resolveSpreadMode(900, 901, true)).toBe(false);
  });

  it("exits spread below exit width even in landscape", () => {
    expect(resolveSpreadMode(SPREAD_EXIT_WIDTH, 500, true)).toBe(true);
    expect(resolveSpreadMode(SPREAD_EXIT_WIDTH - 1, 500, true)).toBe(false);
  });

  it("does not flicker when width crosses enter threshold during drag", () => {
    let spread = true;
    for (const w of [762, 761, 760, 759, 758, 759, 760, 761]) {
      spread = resolveSpreadMode(w, 600, spread);
    }
    expect(spread).toBe(true);
  });

  it("eventually exits spread when width shrinks far enough", () => {
    let spread = true;
    for (const w of [760, 740, 720, 719]) {
      spread = resolveSpreadMode(w, 600, spread);
    }
    expect(spread).toBe(false);
  });
});

describe("readGeom", () => {
  it("uses two columns in spread mode", () => {
    const geom = readGeom(1200, 800, false);
    expect(geom.spread).toBe(true);
    expect(geom.perView).toBe(2);
    expect(geom.pageW).toBe(600);
  });

  it("uses one column below spread threshold", () => {
    const geom = readGeom(700, 800, false);
    expect(geom.spread).toBe(false);
    expect(geom.perView).toBe(1);
    expect(geom.pageW).toBe(700);
  });
});
