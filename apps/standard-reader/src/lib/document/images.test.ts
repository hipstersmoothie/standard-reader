import { describe, expect, it } from "vitest";

import {
  LEAFLET_BLOCK,
  LEAFLET_CONTENT,
  LEAFLET_PAGE,
} from "#/lib/leaflet/types";

import { documentImages, markupImages } from "./images";

const did = "did:plc:author";

function leafletBlock(block: Record<string, unknown>) {
  return { $type: LEAFLET_PAGE.linearDocumentBlock, block };
}

function leafletImage(cid: string, alt?: string) {
  return leafletBlock({
    $type: LEAFLET_BLOCK.image,
    image: { $type: "blob", ref: { $link: cid }, mimeType: "image/webp" },
    alt,
    aspectRatio: { width: 960, height: 1484 },
    fullBleed: true,
  });
}

function leafletContent(blocks: Array<unknown>) {
  return {
    $type: LEAFLET_CONTENT,
    pages: [{ $type: LEAFLET_PAGE.linearDocument, blocks }],
  };
}

describe("documentImages — leaflet", () => {
  it("lists image blocks in reading order with alt and aspect ratio", () => {
    const images = documentImages({
      did,
      contentFormat: LEAFLET_CONTENT,
      contentJson: leafletContent([
        leafletImage("bafpage1", "Page one"),
        leafletBlock({ $type: LEAFLET_BLOCK.text, plaintext: "Author notes" }),
        leafletImage("bafpage2"),
      ]) as never,
    });

    expect(images).toHaveLength(2);
    expect(images[0]?.url).toContain("bafpage1");
    expect(images[0]?.alt).toBe("Page one");
    expect(images[0]?.aspectRatio).toBeCloseTo(960 / 1484);
    expect(images[1]?.url).toContain("bafpage2");
    expect(images[1]?.alt).toBe("");
  });

  it("flattens gallery blocks into individual pages", () => {
    const images = documentImages({
      did,
      contentFormat: LEAFLET_CONTENT,
      contentJson: leafletContent([
        leafletBlock({
          $type: LEAFLET_BLOCK.imageGallery,
          images: [
            { image: { $type: "blob", ref: { $link: "bafa" } }, alt: "A" },
            { image: { $type: "blob", ref: { $link: "bafb" } } },
          ],
        }),
      ]) as never,
    });

    expect(images.map((image) => image.alt)).toEqual(["A", ""]);
  });

  it("drops a repeated image so a page is never shown twice", () => {
    const images = documentImages({
      did,
      contentFormat: LEAFLET_CONTENT,
      contentJson: leafletContent([
        leafletImage("bafsame"),
        leafletImage("bafsame"),
      ]) as never,
    });

    expect(images).toHaveLength(1);
  });

  it("has no pages for a text-only post", () => {
    const images = documentImages({
      did,
      contentFormat: LEAFLET_CONTENT,
      contentJson: leafletContent([
        leafletBlock({ $type: LEAFLET_BLOCK.text, plaintext: "All prose." }),
      ]) as never,
    });

    expect(images).toEqual([]);
  });
});

describe("documentImages — markdown bodies", () => {
  it("falls back to scanning the markup", () => {
    const images = documentImages({
      did,
      contentFormat: "site.standard.content.markdown",
      contentJson: {
        $type: "site.standard.content.markdown",
        text: "Intro\n\n![One](https://cdn.example/1.png)\n\n![Two](https://cdn.example/2.png)",
      } as never,
    });

    expect(images.map((image) => image.url)).toEqual([
      "https://cdn.example/1.png",
      "https://cdn.example/2.png",
    ]);
    expect(images[0]?.alt).toBe("One");
  });
});

describe("markupImages", () => {
  it("reads markdown and HTML images", () => {
    expect(
      markupImages(
        '![Alt](https://cdn.example/a.jpg "Title")\n<img alt="B" src="https://cdn.example/b.jpg">',
      ),
    ).toEqual([
      {
        url: "https://cdn.example/a.jpg",
        alt: "Alt",
        aspectRatio: 16 / 9,
      },
      {
        url: "https://cdn.example/b.jpg",
        alt: "B",
        aspectRatio: 16 / 9,
      },
    ]);
  });

  it("ignores an img tag with no src", () => {
    expect(markupImages('<img alt="broken">')).toEqual([]);
  });
});

describe("documentImages — empty input", () => {
  it("returns nothing without content", () => {
    expect(
      documentImages({ did, contentFormat: null, contentJson: null }),
    ).toEqual([]);
  });
});
