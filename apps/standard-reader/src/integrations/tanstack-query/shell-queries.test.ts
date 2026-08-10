import { describe, expect, it } from "vitest";

import {
  isShellQuery,
  listsQueryOptions,
  savedListsQueryOptions,
  sidebarPrefQueryOptions,
  sidebarQueryOptions,
} from "./shell-queries";

/**
 * This predicate is the line between "the page" and "the app around it" — it
 * decides what a pull-to-refresh actually refetches. Getting it wrong is
 * invisible in the UI and costs the reader a round trip on every pull, so the
 * boundary is pinned here.
 */
describe("isShellQuery", () => {
  it("claims the shell's own data", () => {
    for (const options of [
      sidebarQueryOptions(),
      listsQueryOptions(),
      savedListsQueryOptions(),
      sidebarPrefQueryOptions(),
    ]) {
      expect(isShellQuery(options.queryKey)).toBe(true);
    }
  });

  it("claims the session and every saved preference", () => {
    expect(isShellQuery(["session"])).toBe(true);
    expect(isShellQuery(["localeHint"])).toBe(true);
    expect(isShellQuery(["savedHandles"])).toBe(true);
    expect(isShellQuery(["themePreference"])).toBe(true);
    expect(isShellQuery(["usePublicationThemePreference"])).toBe(true);
    expect(isShellQuery(["feedPaginationPreference"])).toBe(true);
  });

  it("leaves page data alone", () => {
    expect(isShellQuery(["feed", "home", "all", null])).toBe(false);
    expect(isShellQuery(["feed", "latest", "unread", 20, 0, null])).toBe(false);
    expect(isShellQuery(["article", "at://example/doc"])).toBe(false);
    expect(isShellQuery(["reader", "history", 20])).toBe(false);
    expect(isShellQuery(["discover", "trending", 8])).toBe(false);
  });

  it("does not mistake a page query for a shell one on a shared prefix", () => {
    // Both the sidebar and the feeds live under "feed"; both the reader's
    // lists and their history live under "reader".
    expect(isShellQuery(["feed", "sidebar", "extra"])).toBe(false);
    expect(isShellQuery(["reader", "lists", "of", "someone"])).toBe(false);
    expect(isShellQuery(["feed"])).toBe(false);
  });
});
