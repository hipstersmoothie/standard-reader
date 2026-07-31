import { describe, expect, it } from "vitest";

import { parsePixelDimension } from "./iframe-dimensions";

describe("parsePixelDimension", () => {
  it("accepts positive numbers", () => {
    expect(parsePixelDimension(200)).toBe(200);
    expect(parsePixelDimension(315.5)).toBe(315.5);
  });

  it("rejects non-positive and non-finite numbers", () => {
    expect(parsePixelDimension(0)).toBeUndefined();
    expect(parsePixelDimension(-10)).toBeUndefined();
    expect(parsePixelDimension(Number.NaN)).toBeUndefined();
    expect(parsePixelDimension(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("accepts unitless and px strings", () => {
    expect(parsePixelDimension("560")).toBe(560);
    expect(parsePixelDimension(" 315 ")).toBe(315);
    expect(parsePixelDimension("200px")).toBe(200);
    expect(parsePixelDimension("200PX")).toBe(200);
    expect(parsePixelDimension("12.5px")).toBe(12.5);
  });

  it("rejects relative units so responsive embeds keep their pixel height", () => {
    expect(parsePixelDimension("100%")).toBeUndefined();
    expect(parsePixelDimension("50%")).toBeUndefined();
    expect(parsePixelDimension("10em")).toBeUndefined();
    expect(parsePixelDimension("100vw")).toBeUndefined();
    expect(parsePixelDimension("auto")).toBeUndefined();
  });

  it("rejects empty and missing values", () => {
    const missing: string | undefined = undefined;

    expect(parsePixelDimension("")).toBeUndefined();
    expect(parsePixelDimension("   ")).toBeUndefined();
    expect(parsePixelDimension(missing)).toBeUndefined();
    expect(parsePixelDimension(null)).toBeUndefined();
  });
});
