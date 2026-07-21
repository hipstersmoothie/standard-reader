import type { StandardSiteDocument } from "@standard-reader/renderer-core";
import { html, nothing, render } from "lit";
import { describe, expect, it } from "vitest";

import "../element"; // registers <standard-document>
import type { StandardDocumentElement } from "../element";
import { renderDocument } from "../render";

const AUTHOR = "did:plc:testauthor";

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

function renderToHtml(
  document: StandardSiteDocument,
  opts?: Parameters<typeof renderDocument>[1],
): string {
  const container = globalThis.document.createElement("div");
  render(renderDocument(document, opts), container);
  return container.innerHTML;
}

describe("renderDocument (lit)", () => {
  it("renders unstyled semantic HTML by default", () => {
    const container = globalThis.document.createElement("div");
    render(
      renderDocument(leafletDoc([lf.header("Title", 1), lf.text("Body")])),
      container,
    );
    expect(container.querySelector("div[dir='auto']")).not.toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("p")?.textContent?.trim()).toBe("Body");
  });

  it("applies inline marks from facets", () => {
    const container = globalThis.document.createElement("div");
    render(
      renderDocument(
        leafletDoc([
          lf.text("Hello bold world", [
            facet(6, 10, { $type: "pub.leaflet.richtext.facet#bold" }),
          ]),
        ]),
      ),
      container,
    );
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(
      container.querySelector("p")?.textContent?.replaceAll(/\s+/g, " ").trim(),
    ).toBe("Hello bold world");
  });

  it("resolves blob images to CDN URLs", () => {
    const container = globalThis.document.createElement("div");
    render(renderDocument(leafletDoc([lf.image("bafycid", "Alt")])), container);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(
        AUTHOR,
      )}/bafycid@png`,
    );
    expect(img?.getAttribute("alt")).toBe("Alt");
  });

  it("numbers footnotes and renders an endnotes section", () => {
    const container = globalThis.document.createElement("div");
    render(
      renderDocument(
        leafletDoc([
          lf.text("A claim.[n]", [
            facet(8, 11, {
              $type: "pub.leaflet.richtext.facet#footnote",
              footnoteId: "fn1",
              contentPlaintext: "Evidence.",
            }),
          ]),
        ]),
      ),
      container,
    );
    expect(container.querySelector("sup a")?.textContent).toBe("1");
    expect(container.querySelector("li#fn-fn1")?.textContent).toContain(
      "Evidence.",
    );
  });

  it("uses an overridden shared component", () => {
    const out = renderToHtml(leafletDoc([lf.image("cid", "x")]), {
      components: {
        shared: {
          image: ({ src }) =>
            html`<figure class="custom"><img src=${src} /></figure>`,
        },
      },
    });
    expect(out).toContain('class="custom"');
  });

  it("renders data-backed platform blocks as nothing by default", () => {
    const container = globalThis.document.createElement("div");
    render(renderDocument(leafletDoc([lf.poll("at://p/1")])), container);
    // Only the empty root remains.
    expect(
      container.querySelector("div[dir='auto']")?.textContent?.trim(),
    ).toBe("");
  });

  it("uses the platform component for poll blocks", () => {
    const out = renderToHtml(leafletDoc([lf.poll("at://p/1")]), {
      components: {
        leaflet: {
          poll: ({ pollUri }) => html`<div data-poll=${pollUri}></div>`,
        },
      },
    });
    expect(out).toContain('data-poll="at://p/1"');
  });

  it("returns nothing for an unknown format", () => {
    expect(renderDocument({ content: { $type: "com.unknown/x" } })).toBe(
      nothing,
    );
  });
});

describe("<standard-document> element", () => {
  it("upgrades and renders into light DOM", async () => {
    const el = globalThis.document.createElement(
      "standard-document",
    ) as StandardDocumentElement;
    el.document = leafletDoc([lf.header("Hello", 2), lf.text("World")]);
    globalThis.document.body.append(el);
    await el.updateComplete;

    expect(el.shadowRoot).toBeNull(); // light DOM
    expect(el.querySelector("h2")?.textContent).toBe("Hello");
    expect(el.querySelector("p")?.textContent?.trim()).toBe("World");
    el.remove();
  });
});
