import { describe, expect, it } from "vitest";

import {
  BLOCKNOTE_CONTENT,
  blocknoteBlocks,
} from "../document/structured-content/blocknote.js";
import {
  PROSEMIRROR_CONTENT,
  prosemirrorBlocks,
} from "../document/structured-content/prosemirror.js";
import type { StructuredRenderableBlock } from "../document/structured-content/types.js";
import { offprintBlocks } from "../offprint/blocks.js";
import { OFFPRINT_BLOCK, OFFPRINT_CONTENT } from "../offprint/types.js";

/**
 * Nested lists across the block formats.
 *
 * `StructuredListItem` grew `children` when the markdown parser stopped
 * dropping nested branches; these three parsers kept flattening afterwards,
 * each for its own reason — ProseMirror nests a sub-list *inside* the parent
 * item, BlockNote hangs it off the parent block's `children`, and Offprint
 * hangs bare items off the parent *item's* `children`.
 */

function asList(
  block: StructuredRenderableBlock | undefined,
): Extract<StructuredRenderableBlock, { kind: "bulletList" | "orderedList" }> {
  if (block?.kind !== "bulletList" && block?.kind !== "orderedList") {
    throw new Error(`expected a list, got ${block?.kind}`);
  }
  return block;
}

/** A ProseMirror paragraph node. */
const paragraph = (text: string) => ({
  content: [{ text, type: "text" }],
  type: "paragraph",
});

/** A BlockNote block, with the subtree it hangs off `children`. */
const item = (
  text: string,
  type = "bulletListItem",
  children: Array<unknown> = [],
) => ({
  children,
  inlineContent: [{ text, type: "text" }],
  props: {},
  type,
});

const blocknoteDoc = (...blocks: Array<unknown>) => ({
  $type: BLOCKNOTE_CONTENT,
  blocks,
});

/** An Offprint list item: one text run, plus the items nested beneath it. */
const offprintItem = (plaintext: string, children: Array<unknown> = []) => ({
  children,
  content: { $type: OFFPRINT_BLOCK.text, plaintext },
});

const offprintDoc = (...items: Array<unknown>) => ({
  $type: OFFPRINT_CONTENT,
  items,
});

describe("prosemirror — nested lists", () => {
  it("keeps a sub-list under the item it belongs to", () => {
    const blocks = prosemirrorBlocks({
      $type: PROSEMIRROR_CONTENT,
      doc: {
        content: [
          {
            content: [
              {
                content: [
                  paragraph("outer"),
                  {
                    content: [
                      { content: [paragraph("inner")], type: "listItem" },
                    ],
                    type: "bulletList",
                  },
                ],
                type: "listItem",
              },
              { content: [paragraph("sibling")], type: "listItem" },
            ],
            type: "bulletList",
          },
        ],
        type: "doc",
      },
    });

    const list = asList(blocks[0]);
    expect(list.items.map((entry) => entry.text.plaintext)).toEqual([
      "outer",
      "sibling",
    ]);
    const nested = asList(list.items[0]?.children?.[0]);
    expect(nested.items[0]?.text.plaintext).toBe("inner");
    expect(list.items[1]?.children).toBeUndefined();
  });

  it("keeps an item that is only a sub-list", () => {
    const blocks = prosemirrorBlocks({
      $type: PROSEMIRROR_CONTENT,
      doc: {
        content: [
          {
            content: [
              {
                content: [
                  {
                    content: [
                      { content: [paragraph("only child")], type: "listItem" },
                    ],
                    type: "orderedList",
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

    const list = asList(blocks[0]);
    expect(list.items[0]?.text.plaintext).toBe("");
    expect(asList(list.items[0]?.children?.[0]).kind).toBe("orderedList");
  });
});

describe("blocknote — nested blocks", () => {
  it("reads the `children` a block hangs its subtree from", () => {
    const blocks = blocknoteBlocks(
      blocknoteDoc(
        item("outer", "bulletListItem", [item("inner")]),
        item("sibling"),
      ),
    );

    // Both top-level items group into one list, as before.
    const list = asList(blocks[0]);
    expect(blocks).toHaveLength(1);
    expect(list.items.map((entry) => entry.text.plaintext)).toEqual([
      "outer",
      "sibling",
    ]);
    expect(asList(list.items[0]?.children?.[0]).items[0]?.text.plaintext).toBe(
      "inner",
    );
  });

  it("keeps a paragraph nested under a list item", () => {
    const blocks = blocknoteBlocks(
      blocknoteDoc(
        item("outer", "bulletListItem", [
          {
            children: [],
            inlineContent: [{ text: "note", type: "text" }],
            props: {},
            type: "paragraph",
          },
        ]),
      ),
    );
    expect(asList(blocks[0]).items[0]?.children).toEqual([
      { kind: "text", text: { plaintext: "note" } },
    ]);
  });

  it("keeps a checklist item's subtree even though task items cannot nest", () => {
    const blocks = blocknoteBlocks(
      blocknoteDoc(item("task", "checkListItem", [item("under the task")])),
    );
    expect(blocks[0]?.kind).toBe("taskList");
    expect(asList(blocks[1]).items[0]?.text.plaintext).toBe("under the task");
  });

  it("keeps the subtree of a block that renders nothing itself", () => {
    const blocks = blocknoteBlocks(
      blocknoteDoc({
        children: [item("orphaned")],
        inlineContent: [],
        props: {},
        type: "bulletListItem",
      }),
    );
    expect(asList(blocks[0]).items[0]?.text.plaintext).toBe("orphaned");
  });
});

describe("offprint — nested list items", () => {
  it("keeps the items nested under a bullet item", () => {
    const blocks = offprintBlocks(
      offprintDoc({
        $type: OFFPRINT_BLOCK.bulletList,
        children: [
          offprintItem("outer", [
            offprintItem("inner"),
            offprintItem("inner sibling"),
          ]),
          offprintItem("sibling"),
        ],
      }),
    );

    const list = asList(blocks[0]);
    expect(list.items.map((entry) => entry.text.plaintext)).toEqual([
      "outer",
      "sibling",
    ]);
    const nested = asList(list.items[0]?.children?.[0]);
    expect(nested.kind).toBe("bulletList");
    expect(nested.items.map((entry) => entry.text.plaintext)).toEqual([
      "inner",
      "inner sibling",
    ]);
    expect(list.items[1]?.children).toBeUndefined();
  });

  it("nests an ordered sub-list under an ordered item", () => {
    const blocks = offprintBlocks(
      offprintDoc({
        $type: OFFPRINT_BLOCK.orderedList,
        children: [offprintItem("first", [offprintItem("first.a")])],
        start: 3,
      }),
    );

    const list = asList(blocks[0]);
    expect(list.kind).toBe("orderedList");
    expect(asList(list.items[0]?.children?.[0]).kind).toBe("orderedList");
  });

  it("keeps arbitrarily deep branches", () => {
    const blocks = offprintBlocks(
      offprintDoc({
        $type: OFFPRINT_BLOCK.bulletList,
        children: [
          offprintItem("one", [offprintItem("two", [offprintItem("three")])]),
        ],
      }),
    );

    const list = asList(blocks[0]);
    const second = asList(list.items[0]?.children?.[0]);
    const third = asList(second.items[0]?.children?.[0]);
    expect(third.items[0]?.text.plaintext).toBe("three");
  });

  it("keeps an item that is only a sub-list", () => {
    const blocks = offprintBlocks(
      offprintDoc({
        $type: OFFPRINT_BLOCK.bulletList,
        children: [
          { children: [offprintItem("only child")] },
          offprintItem("sibling"),
        ],
      }),
    );

    const list = asList(blocks[0]);
    expect(list.items[0]?.text.plaintext).toBe("");
    expect(asList(list.items[0]?.children?.[0]).items[0]?.text.plaintext).toBe(
      "only child",
    );
    expect(list.items[1]?.text.plaintext).toBe("sibling");
  });

  it("still drops an item with neither text nor a subtree", () => {
    const blocks = offprintBlocks(
      offprintDoc({
        $type: OFFPRINT_BLOCK.bulletList,
        children: [
          offprintItem("  "),
          { content: { $type: "app.offprint.block.image" } },
          offprintItem("kept"),
        ],
      }),
    );

    const list = asList(blocks[0]);
    expect(list.items.map((entry) => entry.text.plaintext)).toEqual(["kept"]);
  });
});
