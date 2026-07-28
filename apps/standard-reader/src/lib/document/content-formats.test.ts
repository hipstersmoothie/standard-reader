import { describe, expect, it } from "vitest";

import { MARKPUB_MARKDOWN } from "#/lib/markpub/types";
import { MOCHOTT_ARTICLE } from "#/lib/mochott/types";

import {
  isStructuredBlockFormat,
  STRUCTURED_BLOCK_FORMATS,
  structuredFormatBlocks,
} from "./content-formats";
import { STANDARD_MARKDOWN_CONTENT } from "./structured-content/types";

const PROSEMIRROR_CONTENT = "com.wss.content.rich-text";
const GUTENBERG_CONTENT = "blog.skypress.content.gutenberg";

/** A ProseMirror body with a list nested under its first item. */
const nestedListDoc = {
  $type: PROSEMIRROR_CONTENT,
  doc: {
    content: [
      {
        content: [
          {
            content: [
              { content: [{ text: "outer", type: "text" }], type: "paragraph" },
              {
                content: [
                  {
                    content: [
                      {
                        content: [{ text: "inner", type: "text" }],
                        type: "paragraph",
                      },
                    ],
                    type: "listItem",
                  },
                ],
                type: "bulletList",
              },
            ],
            type: "listItem",
          },
        ],
        type: "bulletList",
      },
    ],
    type: "doc",
  },
};

describe("structured block dispatch", () => {
  it("parses the block-based third-party formats", () => {
    expect(isStructuredBlockFormat(PROSEMIRROR_CONTENT)).toBe(true);
    expect(isStructuredBlockFormat(MOCHOTT_ARTICLE)).toBe(true);
    expect(isStructuredBlockFormat("not.a.format")).toBe(false);
    expect(isStructuredBlockFormat(null)).toBe(false);
  });

  it("leaves the markdown-bodied formats to the markdown paths", () => {
    // `renderer-core` can parse these to blocks, but the app renders them
    // through the markdown renderer and takes their plaintext from the
    // markdown itself — so they must not be claimed by the structured path.
    for (const format of [
      STANDARD_MARKDOWN_CONTENT,
      MARKPUB_MARKDOWN,
      "app.wtr.content.markdown",
    ]) {
      expect(STRUCTURED_BLOCK_FORMATS).not.toContain(format);
      expect(structuredFormatBlocks({ $type: format, text: "hi" })).toBeNull();
    }
  });

  it("leaves SkyPress Gutenberg to the HTML path", () => {
    expect(STRUCTURED_BLOCK_FORMATS).not.toContain(GUTENBERG_CONTENT);
    expect(
      structuredFormatBlocks({ $type: GUTENBERG_CONTENT, blocks: [] }),
    ).toBeNull();
  });

  it("keeps lists nested, which the app's old copy of the vocabulary could not", () => {
    // The app's `StructuredListItem` used to be a bare text run, so a parser
    // that found a sub-list had nowhere to put it. Mochott's parser nests.
    const blocks = structuredFormatBlocks({
      $type: MOCHOTT_ARTICLE,
      content: {
        content: [
          {
            content: [
              {
                content: [
                  {
                    content: [{ text: "outer", type: "text" }],
                    type: "paragraph",
                  },
                  {
                    content: [
                      {
                        content: [
                          {
                            content: [{ text: "inner", type: "text" }],
                            type: "paragraph",
                          },
                        ],
                        type: "listItem",
                      },
                    ],
                    type: "bulletList",
                  },
                ],
                type: "listItem",
              },
            ],
            type: "bulletList",
          },
        ],
        type: "doc",
      },
    });
    expect(blocks).toHaveLength(1);
    const list = blocks?.[0];
    if (list?.kind !== "bulletList") throw new Error("expected a bullet list");
    expect(list.items[0]?.text.plaintext).toBe("outer");
    expect(list.items[0]?.children?.[0]?.kind).toBe("bulletList");
  });

  it("reads the format from contentFormat when the payload has no $type", () => {
    const { $type, ...withoutType } = nestedListDoc;
    expect($type).toBe(PROSEMIRROR_CONTENT);
    expect(
      structuredFormatBlocks(withoutType, PROSEMIRROR_CONTENT),
    ).toHaveLength(1);
  });
});
