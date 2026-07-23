import { describe, expect, it } from "vitest";

import {
  collectionMarkpubContent,
  markdownFromCollectionField,
  serializeCollectionManifestForRepo,
} from "./collection-fields";
import { MARKPUB_MARKDOWN, MARKPUB_TEXT } from "./types";

const ITEM = "at://did:plc:abc/site.standard.document/3kfoo";

function markpub(markdown: string): Record<string, unknown> {
  return {
    $type: MARKPUB_MARKDOWN,
    flavor: "gfm",
    text: { $type: MARKPUB_TEXT, markdown },
  };
}

describe("collectionMarkpubContent", () => {
  it("wraps trimmed markdown as at.markpub.markdown", () => {
    expect(collectionMarkpubContent("Hello **world**.")).toEqual(
      markpub("Hello **world**."),
    );
  });
});

describe("markdownFromCollectionField", () => {
  it("reads legacy plain strings", () => {
    expect(markdownFromCollectionField("  note  ")).toBe("note");
    expect(markdownFromCollectionField("   ")).toBeUndefined();
  });

  it("extracts markdown from markpub records", () => {
    expect(markdownFromCollectionField(markpub("Curator note."))).toBe(
      "Curator note.",
    );
  });
});

describe("serializeCollectionManifestForRepo", () => {
  it("writes editorial, colophon, and item notes as markpub", () => {
    const serialized = serializeCollectionManifestForRepo({
      editorial: { title: "Issue One", body: "Welcome." },
      colophon: { body: "Edited by Jane." },
      items: [{ document: ITEM, note: "Why this piece." }],
    });

    expect(serialized).toEqual({
      editorial: {
        title: "Issue One",
        body: markpub("Welcome."),
      },
      colophon: { body: markpub("Edited by Jane.") },
      items: [{ document: ITEM, note: markpub("Why this piece.") }],
    });
  });

  it("omits empty optional fields", () => {
    expect(
      serializeCollectionManifestForRepo({
        items: [{ document: ITEM }],
      }),
    ).toEqual({
      items: [{ document: ITEM }],
    });
  });
});
