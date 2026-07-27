import { describe, expect, it } from "vitest";

import {
  collectionManifestFromSources,
  hasColophon,
  hasEditorial,
  parseCollectionManifest,
} from "./manifest.ts";

const ITEM = "at://did:plc:abc/site.standard.document/3kfoo";
const ITEM_2 = "at://did:plc:abc/site.standard.document/3kbar";

const markpub = (markdown: string) => ({
  $type: "at.markpub.markdown",
  flavor: "gfm",
  text: { $type: "at.markpub.text", markdown },
});

describe("parseCollectionManifest", () => {
  it("returns null for non-collection values", () => {
    expect(parseCollectionManifest(void 0)).toBeNull();
    expect(parseCollectionManifest(null)).toBeNull();
    expect(parseCollectionManifest("nope")).toBeNull();
    expect(parseCollectionManifest({})).toBeNull();
    // items present but empty / all malformed → not a collection.
    expect(parseCollectionManifest({ items: [] })).toBeNull();
    expect(parseCollectionManifest({ items: [{ note: "no doc" }] })).toBeNull();
  });

  it("parses ordered items and drops malformed entries", () => {
    const manifest = parseCollectionManifest({
      items: [
        { document: ITEM, note: "why I picked this" },
        { document: "  ", note: "blank doc dropped" },
        { document: ITEM_2 },
      ],
    });
    expect(manifest).toEqual({
      items: [
        { document: ITEM, note: "why I picked this" },
        { document: ITEM_2 },
      ],
    });
  });

  it("keeps an editorial only when it has a title or body", () => {
    expect(
      parseCollectionManifest({
        editorial: { title: "Issue One", body: "Welcome." },
        items: [{ document: ITEM }],
      })?.editorial,
    ).toEqual({ title: "Issue One", body: "Welcome." });

    // Whitespace-only editorial collapses away.
    const noEditorial = parseCollectionManifest({
      editorial: { title: "   ", body: "" },
      items: [{ document: ITEM }],
    });
    expect(noEditorial?.editorial).toBeUndefined();
    expect(noEditorial && hasEditorial(noEditorial)).toBe(false);
  });

  it("keeps a colophon only when it has body copy", () => {
    expect(
      parseCollectionManifest({
        colophon: { body: "Edited by Jane Doe." },
        items: [{ document: ITEM }],
      })?.colophon,
    ).toEqual({ body: "Edited by Jane Doe." });

    const noColophon = parseCollectionManifest({
      colophon: { body: "   " },
      items: [{ document: ITEM }],
    });
    expect(noColophon?.colophon).toBeUndefined();
    expect(noColophon && hasColophon(noColophon)).toBe(false);
  });

  it("prefers sidecar manifest over legacy document extension", () => {
    const sidecar = {
      document: ITEM,
      items: [{ document: ITEM_2 }],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const legacy = {
      readerCollection: { items: [{ document: ITEM }] },
    };
    expect(
      collectionManifestFromSources({ sidecar, legacyDocument: legacy }),
    ).toEqual({ items: [{ document: ITEM_2 }] });
  });

  it("falls back to legacy readerCollection on the document", () => {
    expect(
      collectionManifestFromSources({
        legacyDocument: { readerCollection: { items: [{ document: ITEM }] } },
      }),
    ).toEqual({ items: [{ document: ITEM }] });
  });

  it("parses markpub editorial, colophon, and item notes", () => {
    expect(
      parseCollectionManifest({
        editorial: { title: "Issue", body: markpub("Intro copy.") },
        colophon: { body: markpub("Credits.") },
        items: [{ document: ITEM, note: markpub("Curator note.") }],
      }),
    ).toEqual({
      editorial: { title: "Issue", body: "Intro copy." },
      colophon: { body: "Credits." },
      items: [{ document: ITEM, note: "Curator note." }],
    });
  });
});
