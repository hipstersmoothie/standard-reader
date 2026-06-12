import { describe, expect, it } from "vitest";

import { contrastRatio, resolveQuoteOgColors } from "./theme-colors.ts";

describe("resolveQuoteOgColors", () => {
  it("uses publication theme when contrast is sufficient", () => {
    const colors = resolveQuoteOgColors({
      themeBackground: "rgb(20, 20, 30)",
      themeForeground: "rgb(245, 245, 240)",
      themeAccent: "rgb(189, 86, 51)",
      themeAccentForeground: "rgb(255, 255, 255)",
    });

    expect(colors.background).toBe("#14141e");
    expect(colors.foreground).toBe("#f5f5f0");
    expect(colors.accent).toBe("#bd5633");
  });

  it("falls back to high-contrast foreground on low-contrast themes", () => {
    const colors = resolveQuoteOgColors({
      themeBackground: "rgb(255, 255, 255)",
      themeForeground: "rgb(240, 240, 240)",
      themeAccent: null,
      themeAccentForeground: null,
    });

    expect(colors.foreground).toBe("#000000");
    expect(
      contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back to defaults when theme is absent", () => {
    const colors = resolveQuoteOgColors({
      themeBackground: null,
      themeForeground: null,
      themeAccent: null,
      themeAccentForeground: null,
    });

    expect(colors.background).toBe("#f9f7f2");
    expect(colors.foreground).toBe("#3e3934");
  });

  it("derives readable accent-subtle toggle colors", () => {
    const colors = resolveQuoteOgColors({
      themeBackground: "rgb(20, 20, 30)",
      themeForeground: "rgb(245, 245, 240)",
      themeAccent: "rgb(189, 86, 51)",
      themeAccentForeground: "rgb(255, 255, 255)",
    });

    expect(
      contrastRatio(
        parseRgb(colors.accentSubtleFg),
        parseRgb(colors.accentSubtle),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("derives a surface-tinted hover wash, not a foreground block", () => {
    const colors = resolveQuoteOgColors({
      themeBackground: "rgb(255, 255, 255)",
      themeForeground: "rgb(30, 30, 30)",
      themeAccent: "rgb(189, 86, 51)",
      themeAccentForeground: "rgb(255, 255, 255)",
    });

    const bg = parseRgb(colors.background);
    const hoverBg = parseRgb(colors.hoverBg);
    const fg = parseRgb(colors.foreground);

    expect(
      contrastRatio(parseRgb(colors.hoverFg), hoverBg),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      Math.abs(relativeLuminance(hoverBg) - relativeLuminance(bg)),
    ).toBeLessThan(Math.abs(relativeLuminance(fg) - relativeLuminance(bg)));
  });
});

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const linearize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linearize(color.r) +
    0.7152 * linearize(color.g) +
    0.0722 * linearize(color.b)
  );
}

function parseRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}
