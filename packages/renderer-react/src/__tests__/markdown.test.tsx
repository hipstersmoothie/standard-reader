/**
 * Markdown rendered through the React renderer.
 *
 * This is the path the Standard Reader app takes now that it no longer runs its
 * own react-markdown stack, so it is worth asserting end to end: markdown in,
 * the app-shaped components out. Anything that regresses here is something a
 * reader would see on a real article.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StandardDocumentRenderer } from "../render/document";
import type { StandardSiteDocument } from "../types";

function markdownDoc(text: string): StandardSiteDocument {
  return {
    authorDid: "did:plc:testauthor",
    content: { $type: "site.standard.content.markdown", text },
  };
}

function renderMarkdown(text: string, components = {}) {
  return render(
    <StandardDocumentRenderer
      document={markdownDoc(text)}
      components={components}
    />,
  );
}

describe("markdown through the React renderer", () => {
  it("renders the everyday blocks", () => {
    const { container } = renderMarkdown(
      [
        "# Title",
        "",
        "Body **bold** text.",
        "",
        "```js",
        "const x = 1;",
        "```",
      ].join("\n"),
    );
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("code")?.textContent).toBe("const x = 1;");
  });

  it("nests lists in the DOM rather than flattening them", () => {
    const { container } = renderMarkdown(
      ["- outer", "  - inner", "    - deepest", "- second"].join("\n"),
    );
    const top = container.querySelector("ul");
    expect(top?.children).toHaveLength(2);
    // The nested list lives inside its parent <li>, which is the whole point.
    const nested = top?.querySelector("li > ul");
    expect(nested?.querySelector("li")?.textContent).toContain("inner");
    expect(container.querySelectorAll("ul")).toHaveLength(3);
  });

  it("renders a [!TYPE] callout with its kind, title and fold", () => {
    const seen: Array<Record<string, unknown>> = [];
    renderMarkdown("> [!caution]- Careful\n> Mind the gap.", {
      shared: {
        Callout: (props: Record<string, unknown>) => {
          seen.push(props);
          return null;
        },
      },
    });
    expect(seen[0]).toMatchObject({
      fold: "closed",
      kind: "danger",
      title: "Careful",
    });
  });

  it("hands raw HTML to the host instead of rendering or dropping it", () => {
    const seen: Array<string> = [];
    const { container } = renderMarkdown(
      'Before\n\n<aside class="x">raw</aside>\n\nAfter',
      {
        shared: {
          Html: ({ html }: { html: string }) => {
            seen.push(html);
            return <div data-html="">{html}</div>;
          },
        },
      },
    );
    expect(seen).toEqual(['<aside class="x">raw</aside>']);
    expect(container.querySelector("[data-html]")).not.toBeNull();
  });

  it("renders nothing for raw HTML when the host supplies no component", () => {
    // The default must not inject untrusted markup; the surrounding prose still
    // renders, so the page is not broken either.
    const { container } = renderMarkdown(
      "Before\n\n<script>alert(1)</script>\n\nAfter",
    );
    expect(container.textContent).toBe("BeforeAfter");
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders footnote references and the endnote list", () => {
    const { container } = renderMarkdown("A claim[^1].\n\n[^1]: The evidence.");
    expect(container.textContent).toContain("A claim");
    // The note body renders once, at the end of the document.
    expect(container.textContent).toContain("The evidence.");
  });

  it("renders a GFM table", () => {
    const { container } = renderMarkdown(
      "| Name | Value |\n| --- | --- |\n| a | 1 |",
    );
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("td")).toHaveLength(2);
  });

  it("keeps an image that sits inside a sentence", () => {
    const { container } = renderMarkdown(
      "Text with an ![a cat](https://x.test/c.png) image.",
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://x.test/c.png");
    expect(img?.getAttribute("alt")).toBe("a cat");
    expect(container.textContent).toContain("Text with an");
    expect(container.textContent).toContain("image.");
  });

  it("routes display math to the math component", () => {
    const seen: Array<string> = [];
    renderMarkdown("$$\nE = mc^2\n$$", {
      shared: {
        Math: ({ tex }: { tex: string }) => {
          seen.push(tex);
          return null;
        },
      },
    });
    expect(seen).toEqual(["E = mc^2"]);
  });

  it("renders Markpub bodies through the same path", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={{
          authorDid: "did:plc:testauthor",
          content: {
            $type: "at.markpub.markdown",
            flavor: "gfm",
            text: { $type: "at.markpub.text", markdown: "## From Markpub" },
          },
        }}
      />,
    );
    expect(container.querySelector("h2")?.textContent).toBe("From Markpub");
  });

  it("renders a hard break as a <br>, and a soft wrap as a space", () => {
    // Markpub / Mochott / GreenGale authors write breaks all three ways; each
    // one has to survive into the DOM, while prose wrapped in the source must
    // not sprout breaks it never asked for.
    const { container } = renderMarkdown(
      ["one  ", "two\\", "three<br>", "four", "", "wrapped", "prose"].join(
        "\n",
      ),
    );
    const [broken, wrapped] = [...container.querySelectorAll("p")];
    expect(broken?.querySelectorAll("br")).toHaveLength(3);
    expect(broken?.textContent).toBe("onetwothreefour");
    expect(wrapped?.querySelectorAll("br")).toHaveLength(0);
    expect(wrapped?.textContent).toBe("wrapped prose");
  });

  it("renders a markdown-in-record third-party lexicon", () => {
    const { container } = render(
      <StandardDocumentRenderer
        document={{
          authorDid: "did:plc:testauthor",
          content: {
            $type: "net.commoninternet.lichen.content.markdown",
            text: "## From lichen",
          },
        }}
      />,
    );
    expect(container.querySelector("h2")?.textContent).toBe("From lichen");
  });
});
