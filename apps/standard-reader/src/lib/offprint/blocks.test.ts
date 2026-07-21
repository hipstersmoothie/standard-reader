import { describe, expect, it } from "vitest";

import { offprintBlocks } from "./blocks";
import { OFFPRINT_BLOCK, OFFPRINT_CONTENT } from "./types";

function content(items: Array<unknown>) {
  return { $type: OFFPRINT_CONTENT, items };
}

const COMPONENT_URI =
  "at://did:plc:vahtz72vqgetnz3cf4xsa7iv/app.offprint.component/3mqkdhog4nn2k";

describe("offprintBlocks — component blocks", () => {
  it("parses a component block into its AT-URI", () => {
    const blocks = offprintBlocks(
      content([{ $type: OFFPRINT_BLOCK.component, component: COMPONENT_URI }]),
    );

    expect(blocks).toEqual([
      { kind: "offprintComponent", componentUri: COMPONENT_URI },
    ]);
  });

  it("keeps components in document order alongside other blocks", () => {
    const blocks = offprintBlocks(
      content([
        { $type: OFFPRINT_BLOCK.component, component: COMPONENT_URI },
        { $type: OFFPRINT_BLOCK.heading, level: 1, plaintext: "Devlog" },
        { $type: OFFPRINT_BLOCK.text, plaintext: "Body" },
      ]),
    );

    expect(blocks.map((block) => block.kind)).toEqual([
      "offprintComponent",
      "heading",
      "text",
    ]);
  });

  // Rendering nothing beats an "unsupported block" placeholder: the reference
  // is unusable either way, and the snippet is supplementary to the article.
  it("drops a component block with a missing or blank reference", () => {
    expect(
      offprintBlocks(content([{ $type: OFFPRINT_BLOCK.component }])),
    ).toEqual([]);
    expect(
      offprintBlocks(
        content([{ $type: OFFPRINT_BLOCK.component, component: "   " }]),
      ),
    ).toEqual([]);
  });

  it("no longer reports components as an unsupported block type", () => {
    const blocks = offprintBlocks(
      content([{ $type: OFFPRINT_BLOCK.component, component: COMPONENT_URI }]),
    );

    expect(blocks.some((block) => block.kind === "unknown")).toBe(false);
  });
});
