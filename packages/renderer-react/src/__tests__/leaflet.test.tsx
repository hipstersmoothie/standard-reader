import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RendererComponentsInput, RendererOptions } from "../index";
import { StandardDocumentRenderer } from "../render/document";
import type { StandardSiteDocument } from "../types";
import {
  AUTHOR_DID,
  facet,
  LEAFLET_FACETS,
  leaflet,
  leafletDoc,
} from "./fixtures";

function renderDoc(
  document: StandardSiteDocument,
  components?: RendererComponentsInput,
  options?: RendererOptions,
) {
  return render(
    <StandardDocumentRenderer
      document={document}
      components={components}
      options={options}
    />,
  );
}

describe("leaflet rendering", () => {
  it("renders headings at their level", () => {
    const { container } = renderDoc(
      leafletDoc([leaflet.header("Title", 1), leaflet.header("Sub", 2)]),
    );
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("h2")?.textContent).toBe("Sub");
  });

  it("renders a paragraph wrapped by the default Root", () => {
    const { container } = renderDoc(leafletDoc([leaflet.text("Hello world")]));
    const root = container.querySelector("div[dir='auto']");
    expect(root).not.toBeNull();
    expect(root?.querySelector("p")?.textContent).toBe("Hello world");
  });

  it("applies bold/italic/code inline marks from facets", () => {
    const { container } = renderDoc(
      leafletDoc([
        leaflet.text("Hello bold world", [facet(6, 10, LEAFLET_FACETS.bold)]),
        leaflet.text("an italic bit", [facet(3, 9, LEAFLET_FACETS.italic)]),
        leaflet.text("some code here", [facet(5, 9, LEAFLET_FACETS.code)]),
      ]),
    );
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("renders link facets as anchors", () => {
    const { container } = renderDoc(
      leafletDoc([
        leaflet.text("visit here now", [
          facet(6, 10, LEAFLET_FACETS.link("https://example.com")),
        ]),
      ]),
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.textContent).toBe("here");
  });

  it("passes mention targets to the Mention component", () => {
    const seen: Array<string | undefined> = [];
    renderDoc(
      leafletDoc([
        leaflet.text("hi @someone here", [
          facet(3, 11, LEAFLET_FACETS.didMention("did:plc:mentioned")),
        ]),
      ]),
      {
        shared: {
          Mention: ({ did, children }) => {
            seen.push(did);
            return <span data-mention={did}>{children}</span>;
          },
        },
      },
    );
    expect(seen).toContain("did:plc:mentioned");
  });

  it("numbers footnotes and renders an endnotes section", () => {
    const { container } = renderDoc(
      leafletDoc([
        leaflet.text("A claim.[note]", [
          facet(
            8,
            14,
            LEAFLET_FACETS.footnote("fn1", "The supporting evidence."),
          ),
        ]),
      ]),
    );
    // Inline reference
    const sup = container.querySelector("sup a");
    expect(sup?.textContent).toBe("1");
    expect(sup?.getAttribute("href")).toBe("#fn-fn1");
    // Endnote entry
    const item = container.querySelector("li#fn-fn1");
    expect(item?.textContent).toContain("The supporting evidence.");
  });

  it("renders ordered and unordered lists", () => {
    const { container } = renderDoc(
      leafletDoc([
        leaflet.unorderedList(["one", "two"]),
        leaflet.orderedList(["first", "second"], 3),
      ]),
    );
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    const ol = container.querySelector("ol");
    expect(ol?.getAttribute("start")).toBe("3");
    expect(ol?.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders code blocks with a language class", () => {
    const { container } = renderDoc(
      leafletDoc([leaflet.code("const x = 1;", "ts")]),
    );
    const code = container.querySelector("pre code");
    expect(code?.className).toBe("language-ts");
    expect(code?.textContent).toBe("const x = 1;");
  });

  it("builds a CDN image URL from a blob CID by default", () => {
    const { container } = renderDoc(
      leafletDoc([leaflet.image("bafycid123", "A photo")]),
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("A photo");
    expect(img?.getAttribute("src")).toBe(
      `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(
        AUTHOR_DID,
      )}/bafycid123@png`,
    );
  });

  it("honors a custom image resolver", () => {
    const { container } = renderDoc(
      leafletDoc([leaflet.image("cid999", "x")]),
      undefined,
      { resolveImageUrl: () => "https://cdn.example/img.png" },
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example/img.png",
    );
  });

  it("uses the platform component for poll blocks", () => {
    const { container } = renderDoc(
      leafletDoc([leaflet.poll("at://did:plc:x/app.poll/1")]),
      {
        leaflet: {
          Poll: ({ pollUri }) => <div data-poll={pollUri}>poll</div>,
        },
      },
    );
    expect(
      container.querySelector<HTMLElement>("[data-poll]")?.dataset.poll,
    ).toBe("at://did:plc:x/app.poll/1");
  });

  it("renders separators via the leaflet Separator component", () => {
    const { container } = renderDoc(leafletDoc([leaflet.separator()]));
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("returns null for an empty document", () => {
    const { container } = renderDoc(leafletDoc([]));
    expect(container.firstChild).toBeNull();
  });
});
