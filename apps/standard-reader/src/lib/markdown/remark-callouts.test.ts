import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";

import { articleMarkdownSanitizeSchema } from "./article-sanitize-schema";
import { readCalloutProps } from "./callouts";
import { remarkCallouts } from "./remark-callouts";

/**
 * Render markdown through the exact plugin + sanitize stack the article uses,
 * surfacing the callout metadata the renderer would read (`readCalloutProps`)
 * as plain attributes so the transform can be asserted without pulling in the
 * StyleX-based `Callout` component (StyleX needs build-time compilation).
 */
function render(md: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkCallouts],
        rehypePlugins: [
          rehypeRaw,
          [rehypeSanitize, articleMarkdownSanitizeSchema],
        ],
        components: {
          blockquote: ({ children, node }) => {
            const callout = readCalloutProps(
              node?.properties as Record<string, unknown> | undefined,
            );
            if (!callout) {
              return createElement(
                "blockquote",
                { "data-plain-quote": true },
                children,
              );
            }
            return createElement(
              "blockquote",
              {
                "data-callout-kind": callout.kind,
                "data-callout-title": callout.title,
                "data-callout-fold": callout.fold ?? "none",
              },
              children,
            );
          },
        },
      },
      md,
    ),
  );
}

describe("remarkCallouts pipeline", () => {
  it("annotates a GFM callout and strips the marker from the body", () => {
    const html = render("> [!NOTE]\n> Some text for callouts\n");
    expect(html).toContain('data-callout-kind="note"');
    expect(html).toContain('data-callout-title="Note"');
    expect(html).toContain('data-callout-fold="none"');
    expect(html).toContain("Some text for callouts");
    // The raw marker never reaches the rendered body.
    expect(html).not.toContain("[!NOTE]");
  });

  it("carries an Obsidian custom title and collapsed fold state", () => {
    const html = render(
      "> [!warning]- Custom title and collapsed\n> Body text\n",
    );
    expect(html).toContain('data-callout-kind="warning"');
    expect(html).toContain('data-callout-title="Custom title and collapsed"');
    expect(html).toContain('data-callout-fold="closed"');
  });

  it("marks a `+` callout as an expanded collapsible", () => {
    const html = render("> [!tip]+ Open tip\n> Body\n");
    expect(html).toContain('data-callout-fold="open"');
    expect(html).toContain('data-callout-title="Open tip"');
  });

  it("keeps an ordinary blockquote as a plain quote", () => {
    const html = render("> Just a normal quote\n");
    expect(html).toContain("data-plain-quote");
    expect(html).not.toContain("data-callout-kind");
  });

  it("preserves inline markup inside the callout body", () => {
    const html = render("> [!info]\n> Body with **bold** and a [link](/x)\n");
    expect(html).toContain('data-callout-kind="info"');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<a");
  });

  it("supports a single-line callout with only a title", () => {
    const html = render("> [!success] All done\n");
    expect(html).toContain('data-callout-kind="success"');
    expect(html).toContain('data-callout-title="All done"');
  });
});

describe("readCalloutProps", () => {
  it("returns null without the callout class", () => {
    const missing: Record<string, unknown> | undefined = undefined;
    expect(readCalloutProps(missing)).toBeNull();
    expect(readCalloutProps({ className: ["other"] })).toBeNull();
  });

  it("reads kind, title, and fold from properties", () => {
    expect(
      readCalloutProps({
        className: ["callout"],
        dataCalloutKind: "warning",
        dataCalloutTitle: "Heads up",
        dataCalloutFold: "closed",
      }),
    ).toEqual({ kind: "warning", title: "Heads up", fold: "closed" });
  });

  it("treats a missing fold as a static callout", () => {
    const props = readCalloutProps({
      className: ["callout"],
      dataCalloutKind: "note",
      dataCalloutTitle: "Note",
    });
    expect(props).toMatchObject({ kind: "note", title: "Note" });
    expect(props?.fold).toBeUndefined();
  });
});
