import type { StandardSiteDocument } from "@standard-reader/renderer-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import StandardDocument from "../StandardDocument.svelte";
import PollOverride from "./PollOverride.svelte";

const AUTHOR = "did:plc:testauthor";
let app: Record<string, unknown> | undefined;
let target: HTMLElement | undefined;

afterEach(() => {
  if (app) unmount(app);
  target?.remove();
  app = undefined;
  target = undefined;
});

function leafletDoc(
  blocks: Array<Record<string, unknown>>,
  extra?: Partial<StandardSiteDocument>,
): StandardSiteDocument {
  return {
    content: {
      $type: "pub.leaflet.content",
      pages: [{ $type: "pub.leaflet.pages.linearDocument", id: "p1", blocks }],
    },
    authorDid: AUTHOR,
    ...extra,
  };
}

const lf = {
  text: (plaintext: string, facets?: Array<unknown>) => ({
    $type: "pub.leaflet.blocks.text",
    plaintext,
    ...(facets ? { facets } : {}),
  }),
  header: (plaintext: string, level = 2) => ({
    $type: "pub.leaflet.blocks.header",
    level,
    plaintext,
  }),
  image: (cid: string, alt = "") => ({
    $type: "pub.leaflet.blocks.image",
    image: { ref: { $link: cid }, mimeType: "image/png" },
    alt,
  }),
  poll: (uri: string) => ({
    $type: "pub.leaflet.blocks.poll",
    pollRef: { uri },
  }),
};

function facet(byteStart: number, byteEnd: number, ...features: Array<object>) {
  return { index: { byteStart, byteEnd }, features };
}

function mountDoc(
  component: typeof StandardDocument | typeof PollOverride,
  props: Record<string, unknown>,
): HTMLElement {
  target = document.createElement("div");
  document.body.append(target);
  app = mount(component, { target, props: props as never }) as Record<
    string,
    unknown
  >;
  flushSync();
  return target;
}

describe("StandardDocument (svelte)", () => {
  it("renders unstyled semantic HTML by default", () => {
    const el = mountDoc(StandardDocument, {
      document: leafletDoc([lf.header("Title", 1), lf.text("Body")]),
    });
    expect(el.querySelector("div[dir='auto']")).not.toBeNull();
    expect(el.querySelector("h1")?.textContent).toBe("Title");
    expect(el.querySelector("p")?.textContent?.trim()).toBe("Body");
  });

  it("applies inline marks from facets", () => {
    const el = mountDoc(StandardDocument, {
      document: leafletDoc([
        lf.text("Hello bold world", [
          facet(6, 10, { $type: "pub.leaflet.richtext.facet#bold" }),
        ]),
      ]),
    });
    expect(el.querySelector("strong")?.textContent).toBe("bold");
  });

  it("resolves blob images to CDN URLs", () => {
    const el = mountDoc(StandardDocument, {
      document: leafletDoc([lf.image("bafycid", "Alt")]),
    });
    const img = el.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(
        AUTHOR,
      )}/bafycid@png`,
    );
    expect(img?.getAttribute("alt")).toBe("Alt");
  });

  it("numbers footnotes and renders an endnotes section", () => {
    const el = mountDoc(StandardDocument, {
      document: leafletDoc([
        lf.text("A claim.[n]", [
          facet(8, 11, {
            $type: "pub.leaflet.richtext.facet#footnote",
            footnoteId: "fn1",
            contentPlaintext: "Evidence.",
          }),
        ]),
      ]),
    });
    expect(el.querySelector("sup a")?.textContent).toBe("1");
    expect(el.querySelector("li#fn-fn1")?.textContent).toContain("Evidence.");
  });

  it("renders data-backed platform blocks as nothing by default", () => {
    const el = mountDoc(StandardDocument, {
      document: leafletDoc([lf.poll("at://p/1")]),
    });
    expect(el.querySelector("div[dir='auto']")?.textContent?.trim()).toBe("");
  });

  it("uses a snippet override for a platform block", () => {
    const el = mountDoc(PollOverride, {
      document: leafletDoc([lf.poll("at://p/1")]),
    });
    expect(el.querySelector<HTMLElement>("[data-poll]")?.dataset.poll).toBe(
      "at://p/1",
    );
  });

  it("renders nothing for an unknown format", () => {
    const el = mountDoc(StandardDocument, {
      document: { content: { $type: "com.unknown/x" } },
    });
    expect(el.querySelector("div[dir='auto']")).toBeNull();
  });
});
