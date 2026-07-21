import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { createEditor } from "lexical";
import { describe, expect, it } from "vitest";

import { markdownFromMarkpub, toMarkpubRecord } from "./markpub";
import { EDITOR_NODES } from "./nodes";
import { MARKPUB_TRANSFORMERS } from "./transformers";

/** Import markdown into a headless editor, then serialize it back out. */
function roundTrip(markdown: string): string {
  const editor = createEditor({
    nodes: EDITOR_NODES,
    onError: (error) => {
      throw error;
    },
  });
  let output = "";
  editor.update(
    () => {
      $convertFromMarkdownString(
        markdown,
        MARKPUB_TRANSFORMERS,
        undefined,
        true,
      );
    },
    { discrete: true },
  );
  editor.getEditorState().read(() => {
    output = $convertToMarkdownString(MARKPUB_TRANSFORMERS);
  });
  return output;
}

describe("markpub round-trip", () => {
  it("preserves headings", () => {
    const md = "# One\n\n## Two\n\n### Three";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves inline formatting", () => {
    const md = "**bold** and *italic* and ~~strike~~ and `code`";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves links", () => {
    const md = "A [link](https://example.com) here";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves blockquotes", () => {
    const md = "> quoted text";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves bullet lists", () => {
    const md = "- one\n- two\n- three";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves ordered lists", () => {
    const md = "1. one\n2. two\n3. three";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves task lists", () => {
    const md = "- [x] done\n- [ ] todo";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves fenced code blocks", () => {
    const md = "```js\nconst a = 1;\n```";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves horizontal rules", () => {
    const md = "before\n\n---\n\nafter";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves images", () => {
    const md = "![alt text](https://example.com/i.png)";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves GFM tables", () => {
    const md = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves inline math", () => {
    const md = String.raw`Euler: $e^{i\pi}$`;
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves block math", () => {
    const md = String.raw`$$\int_0^1 x\,dx$$`;
    expect(roundTrip(md)).toBe(md);
  });
});

describe("markpub record helpers", () => {
  it("wraps markdown into an at.markpub.markdown record", () => {
    const record = toMarkpubRecord("hello");
    expect(record.$type).toBe("at.markpub.markdown");
    expect(record.text.$type).toBe("at.markpub.text");
    expect(record.text.markdown).toBe("hello");
    expect(record.flavor).toBe("gfm");
    expect(record.extensions).toBeUndefined();
  });

  it("flags the latex extension when math is present", () => {
    expect(toMarkpubRecord("$$x$$").extensions).toEqual(["latex"]);
  });

  it("reads markdown from string, text value, and full record", () => {
    expect(markdownFromMarkpub("raw")).toBe("raw");
    expect(markdownFromMarkpub({ markdown: "t" })).toBe("t");
    expect(markdownFromMarkpub(toMarkpubRecord("full"))).toBe("full");
  });
});
