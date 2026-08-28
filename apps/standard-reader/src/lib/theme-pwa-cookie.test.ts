// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  PWA_BACKGROUND_COLOR_BY_SCHEME,
  PWA_THEME_COOKIE,
  RESOLVED_SCHEME_SCRIPT,
  THEME_COLOR_BY_SCHEME,
  parsePwaThemeCookie,
  writePwaThemeCookie,
} from "./theme.ts";

/**
 * The pre-paint script is shipped as a raw string into `<head>`, so it is the
 * one piece of the theme-color path no type checker or bundler ever looks at.
 * Run it for real against a DOM and read back what it produced.
 */
function runPrePaintScript(attributes: {
  theme: string;
  paletteScheme?: string;
  themeColor?: string;
  prefersDark?: boolean;
}): { meta: string | null; cookie: ReturnType<typeof parsePwaThemeCookie> } {
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff" />';
  const root = document.documentElement;
  root.dataset.theme = attributes.theme;
  if (attributes.paletteScheme) {
    root.dataset.paletteScheme = attributes.paletteScheme;
  }
  if (attributes.themeColor) root.dataset.themeColor = attributes.themeColor;

  globalThis.matchMedia = ((query: string) => ({
    matches: query.includes("dark") && attributes.prefersDark === true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof globalThis.matchMedia;

  // eslint-disable-next-line no-new-func
  new Function(RESOLVED_SCHEME_SCRIPT)();

  const raw = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${PWA_THEME_COOKIE}=`))
    ?.slice(PWA_THEME_COOKIE.length + 1);
  return {
    meta:
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content") ?? null,
    cookie: parsePwaThemeCookie(raw),
  };
}

beforeEach(() => {
  // jsdom keeps cookies across tests within a file.
  // eslint-disable-next-line unicorn/no-document-cookie
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0];
    // eslint-disable-next-line unicorn/no-document-cookie
    if (name) document.cookie = `${name}=;path=/;max-age=0`;
  }
  const { dataset } = document.documentElement;
  delete dataset.theme;
  delete dataset.paletteScheme;
  delete dataset.themeColor;
  delete dataset.resolvedScheme;
});

describe("RESOLVED_SCHEME_SCRIPT", () => {
  it("publishes the dark pair when the reader pinned dark", () => {
    const { meta, cookie } = runPrePaintScript({ theme: "dark" });
    expect(meta).toBe(THEME_COLOR_BY_SCHEME.dark);
    expect(cookie).toEqual({
      themeColor: THEME_COLOR_BY_SCHEME.dark,
      backgroundColor: PWA_BACKGROUND_COLOR_BY_SCHEME.dark,
    });
  });

  it("follows the OS in system mode — the case that produced the light bands", () => {
    const { meta, cookie } = runPrePaintScript({
      theme: "system",
      prefersDark: true,
    });
    expect(meta).toBe(THEME_COLOR_BY_SCHEME.dark);
    expect(cookie.themeColor).toBe(THEME_COLOR_BY_SCHEME.dark);
    expect(cookie.backgroundColor).toBe(PWA_BACKGROUND_COLOR_BY_SCHEME.dark);
  });

  it("keeps an explicit light override even when the OS is dark", () => {
    const { cookie } = runPrePaintScript({
      theme: "light",
      prefersDark: true,
    });
    expect(cookie.themeColor).toBe(THEME_COLOR_BY_SCHEME.light);
  });

  it("uses a custom palette's paper for both the bar and the splash", () => {
    const { meta, cookie } = runPrePaintScript({
      theme: "custom",
      paletteScheme: "dark",
      themeColor: "#1b1512",
    });
    expect(meta).toBe("#1b1512");
    expect(cookie).toEqual({
      themeColor: "#1b1512",
      backgroundColor: "#1b1512",
    });
  });

  it("marks the resolved scheme on the root element", () => {
    runPrePaintScript({ theme: "system", prefersDark: true });
    expect(document.documentElement.dataset.resolvedScheme).toBe("dark");
  });
});

describe("writePwaThemeCookie", () => {
  it("round-trips through the cookie jar", () => {
    writePwaThemeCookie({ themeColor: "#28211d", backgroundColor: "#110c08" });
    const raw = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${PWA_THEME_COOKIE}=`))
      ?.slice(PWA_THEME_COOKIE.length + 1);
    expect(parsePwaThemeCookie(raw)).toEqual({
      themeColor: "#28211d",
      backgroundColor: "#110c08",
    });
  });

  it("replaces the previous pair when the reader switches theme", () => {
    writePwaThemeCookie({ themeColor: "#f6eee7", backgroundColor: "#fcfbf6" });
    writePwaThemeCookie({ themeColor: "#28211d", backgroundColor: "#110c08" });
    const matches = document.cookie
      .split("; ")
      .filter((part) => part.startsWith(`${PWA_THEME_COOKIE}=`));
    expect(matches).toHaveLength(1);
    expect(
      parsePwaThemeCookie(matches[0]?.slice(PWA_THEME_COOKIE.length + 1)),
    ).toEqual({ themeColor: "#28211d", backgroundColor: "#110c08" });
  });
});
