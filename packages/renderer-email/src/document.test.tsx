import { render } from "@react-email/render";
import type { StandardSiteDocument } from "@standard-reader/renderer-core";
import { describe, expect, it } from "vitest";

import { DocumentEmailBody, toStandardSiteDocument } from "./index";

/** A `site.standard.content.markdown` document wrapping raw markdown. */
function markdownDoc(text: string): StandardSiteDocument {
  return {
    authorDid: "did:plc:testauthor",
    content: { $type: "site.standard.content.markdown", text },
    contentFormat: "site.standard.content.markdown",
    description: null,
  };
}

async function renderDoc(doc: StandardSiteDocument): Promise<string> {
  return render(<DocumentEmailBody document={doc} />);
}

describe("toStandardSiteDocument", () => {
  it("maps a stored documents row onto a StandardSiteDocument", () => {
    const content = { $type: "site.standard.content.markdown", text: "hi" };
    const doc = toStandardSiteDocument({
      contentJson: content,
      contentFormat: "site.standard.content.markdown",
      authorDid: "did:plc:abc",
      description: "A short post",
    });
    expect(doc).toEqual({
      content,
      contentFormat: "site.standard.content.markdown",
      authorDid: "did:plc:abc",
      description: "A short post",
    });
  });

  it("defaults nullable fields when the row omits them", () => {
    const doc = toStandardSiteDocument({ contentJson: { text: "x" } });
    expect(doc.contentFormat).toBeNull();
    expect(doc.description).toBeNull();
    expect(doc.authorDid).toBeUndefined();
  });
});

describe("DocumentEmailBody — markdown rendering", () => {
  it("renders headings, paragraphs and inline emphasis", async () => {
    const html = await renderDoc(
      markdownDoc(
        "# Big News\n\nThe **quick** brown fox jumps over the _lazy_ dog.",
      ),
    );
    expect(html).toContain("Big News");
    expect(html).toContain("quick");
    expect(html).toContain("lazy");
    // Emphasis survives as real markup, not literal asterisks.
    expect(html).not.toContain("**quick**");
    expect(html).not.toContain("_lazy_");
    expect(html.toLowerCase()).toMatch(/<(strong|b)[ >]/);
    expect(html.toLowerCase()).toMatch(/<(em|i)[ >]/);
  });

  it("renders links as anchors with their href", async () => {
    const html = await renderDoc(
      markdownDoc("Read [the standard](https://standard.site/docs) today."),
    );
    expect(html).toContain("the standard");
    expect(html).toContain('href="https://standard.site/docs"');
  });

  it("renders images with their src and alt", async () => {
    const html = await renderDoc(
      markdownDoc("![a cat](https://img.example/cat.png)"),
    );
    expect(html).toContain('src="https://img.example/cat.png"');
    expect(html).toContain('alt="a cat"');
  });

  it("renders ordered and unordered lists", async () => {
    const html = await renderDoc(
      markdownDoc("- one\n- two\n\n1. first\n2. second"),
    );
    expect(html).toContain("one");
    expect(html).toContain("two");
    expect(html).toContain("first");
    expect(html).toContain("second");
    expect(html.toLowerCase()).toContain("<ul");
    expect(html.toLowerCase()).toContain("<ol");
  });

  it("renders blockquotes and code", async () => {
    const html = await renderDoc(
      markdownDoc("> a wise quote\n\nUse `pnpm build` to compile."),
    );
    expect(html).toContain("a wise quote");
    expect(html).toContain("pnpm build");
  });

  it("produces a self-contained HTML string (no unresolved React markers)", async () => {
    const html = await renderDoc(markdownDoc("Just a plain paragraph."));
    expect(html).toContain("Just a plain paragraph.");
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("undefined");
  });

  it("renders nothing meaningful for an empty document body", async () => {
    const html = await renderDoc(markdownDoc("   "));
    // No crash, and no stray literal content leaks in.
    expect(html).not.toContain("[object Object]");
  });
});
