import type { StandardSiteDocument } from "@standard-reader/renderer-core";
import h from "solid-js/h";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";

import { StandardDocument } from "../element";

const AUTHOR = "did:plc:testauthor";
let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
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

function renderDoc(
  document: StandardSiteDocument,
  props?: Record<string, unknown>,
): HTMLElement {
  const container = globalThis.document.createElement("div");
  dispose = render(
    () => StandardDocument({ document, ...props } as never),
    container,
  );
  return container;
}

describe("StandardDocument (solid)", () => {
  it("renders unstyled semantic HTML by default", () => {
    const container = renderDoc(
      leafletDoc([lf.header("Title", 1), lf.text("Body")]),
    );
    expect(container.querySelector("div[dir='auto']")).not.toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("p")?.textContent?.trim()).toBe("Body");
  });

  it("applies inline marks from facets", () => {
    const container = renderDoc(
      leafletDoc([
        lf.text("Hello bold world", [
          facet(6, 10, { $type: "pub.leaflet.richtext.facet#bold" }),
        ]),
      ]),
    );
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });

  it("resolves blob images to CDN URLs", () => {
    const container = renderDoc(leafletDoc([lf.image("bafycid", "Alt")]));
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(
        AUTHOR,
      )}/bafycid@png`,
    );
    expect(img?.getAttribute("alt")).toBe("Alt");
  });

  it("numbers footnotes and renders an endnotes section", () => {
    const container = renderDoc(
      leafletDoc([
        lf.text("A claim.[n]", [
          facet(8, 11, {
            $type: "pub.leaflet.richtext.facet#footnote",
            footnoteId: "fn1",
            contentPlaintext: "Evidence.",
          }),
        ]),
      ]),
    );
    expect(container.querySelector("sup a")?.textContent).toBe("1");
    expect(container.querySelector("li#fn-fn1")?.textContent).toContain(
      "Evidence.",
    );
  });

  it("uses an overridden shared component", () => {
    const container = renderDoc(leafletDoc([lf.image("cid", "x")]), {
      components: {
        shared: {
          image: ({ src }: { src: string }) =>
            h("figure", { class: "custom" }, h("img", { src })),
        },
      },
    });
    expect(container.querySelector("figure.custom")).not.toBeNull();
  });

  it("renders data-backed platform blocks as nothing by default", () => {
    const container = renderDoc(leafletDoc([lf.poll("at://p/1")]));
    expect(
      container.querySelector("div[dir='auto']")?.textContent?.trim(),
    ).toBe("");
  });

  it("uses the platform component for poll blocks", () => {
    const container = renderDoc(leafletDoc([lf.poll("at://p/1")]), {
      components: {
        leaflet: {
          poll: ({ pollUri }: { pollUri: string }) =>
            h("div", { "data-poll": pollUri }),
        },
      },
    });
    expect(
      container.querySelector<HTMLElement>("[data-poll]")?.dataset.poll,
    ).toBe("at://p/1");
  });

  it("renders nothing for an unknown format", () => {
    const container = renderDoc({ content: { $type: "com.unknown/x" } });
    expect(container.querySelector("div[dir='auto']")).toBeNull();
  });
});
