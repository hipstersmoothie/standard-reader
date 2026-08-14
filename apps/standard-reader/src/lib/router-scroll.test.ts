import { describe, expect, it } from "vitest";

import { routerOwnsScroll } from "./router-scroll";

const ARTICLE = "/a/did:plc:abc/my-post";

describe("routerOwnsScroll", () => {
  it("keeps the router in charge everywhere but the reader", () => {
    for (const pathname of [
      "/",
      "/latest",
      "/saved",
      "/history",
      "/discover",
      "/p/did:plc:abc/pub",
      "/collection/did:plc:abc/rkey",
      "/comic/did:plc:abc/rkey",
    ]) {
      expect(routerOwnsScroll({ hash: "", pathname })).toBe(true);
    }
  });

  it("hands the article reader its own scroll", () => {
    expect(routerOwnsScroll({ hash: "", pathname: ARTICLE })).toBe(false);
  });

  /**
   * The anchor is the reader naming a destination out loud. The article view
   * declines to restore over one, and on a hard load the router's inline script
   * is what scrolls it into view before hydration — so this is the one case on
   * the reader route where switching the router off would leave nobody holding
   * the scroll.
   */
  it("leaves an anchored article to the router", () => {
    expect(routerOwnsScroll({ hash: "footnote-3", pathname: ARTICLE })).toBe(
      true,
    );
    expect(routerOwnsScroll({ hash: "#footnote-3", pathname: ARTICLE })).toBe(
      true,
    );
  });

  it("does not mistake a path that merely starts with an a", () => {
    for (const pathname of ["/about", "/authors", "/a", "/archive"]) {
      expect(routerOwnsScroll({ hash: "", pathname })).toBe(true);
    }
  });
});
