import type { StandardSiteDocument } from "@standard-reader/renderer-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h } from "vue";

import { StandardDocument } from "../element";

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

function mountDoc(
  document: StandardSiteDocument,
  props?: { components?: unknown; options?: unknown },
) {
  return mount(StandardDocument, {
    props: { document, ...props } as never,
  });
}

describe("StandardDocument (vue)", () => {
  it("renders unstyled semantic HTML by default", () => {
    const wrapper = mountDoc(
      leafletDoc([lf.header("Title", 1), lf.text("Body")]),
    );
    expect(wrapper.find("div[dir='auto']").exists()).toBe(true);
    expect(wrapper.find("h1").text()).toBe("Title");
    expect(wrapper.find("p").text()).toBe("Body");
  });

  it("applies inline marks from facets", () => {
    const wrapper = mountDoc(
      leafletDoc([
        lf.text("Hello bold world", [
          facet(6, 10, { $type: "pub.leaflet.richtext.facet#bold" }),
        ]),
      ]),
    );
    expect(wrapper.find("strong").text()).toBe("bold");
    expect(wrapper.find("p").text().replaceAll(/\s+/g, " ").trim()).toBe(
      "Hello bold world",
    );
  });

  it("resolves blob images to CDN URLs", () => {
    const wrapper = mountDoc(leafletDoc([lf.image("bafycid", "Alt")]));
    const img = wrapper.find("img");
    expect(img.attributes("src")).toBe(
      `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(
        AUTHOR,
      )}/bafycid@png`,
    );
    expect(img.attributes("alt")).toBe("Alt");
  });

  it("numbers footnotes and renders an endnotes section", () => {
    const wrapper = mountDoc(
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
    expect(wrapper.find("sup a").text()).toBe("1");
    expect(wrapper.find("li#fn-fn1").text()).toContain("Evidence.");
  });

  it("uses an overridden shared component", () => {
    const wrapper = mountDoc(leafletDoc([lf.image("cid", "x")]), {
      components: {
        shared: {
          image: ({ src }: { src: string }) =>
            h("figure", { class: "custom" }, [h("img", { src })]),
        },
      },
    });
    expect(wrapper.find("figure.custom").exists()).toBe(true);
  });

  it("renders data-backed platform blocks as nothing by default", () => {
    const wrapper = mountDoc(leafletDoc([lf.poll("at://p/1")]));
    expect(wrapper.find("div[dir='auto']").text()).toBe("");
  });

  it("uses the platform component for poll blocks", () => {
    const wrapper = mountDoc(leafletDoc([lf.poll("at://p/1")]), {
      components: {
        leaflet: {
          poll: ({ pollUri }: { pollUri: string }) =>
            h("div", { "data-poll": pollUri }),
        },
      },
    });
    expect(wrapper.find("[data-poll]").attributes("data-poll")).toBe(
      "at://p/1",
    );
  });

  it("renders nothing for an unknown format", () => {
    const wrapper = mountDoc({ content: { $type: "com.unknown/x" } });
    expect(wrapper.find("div[dir='auto']").exists()).toBe(false);
  });
});
