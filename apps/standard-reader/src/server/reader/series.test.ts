import { describe, expect, it } from "vitest";

import {
  LEAFLET_BLOCK,
  LEAFLET_CONTENT,
  LEAFLET_PAGE,
} from "#/lib/leaflet/types";

import type { SerialSampleRow } from "./series";
import { classifySerialSample, readsAsComicPage } from "./series";

const did = "did:plc:author";

function leafletBlock(block: Record<string, unknown>) {
  return { $type: LEAFLET_PAGE.linearDocumentBlock, block };
}

function image(cid: string) {
  return leafletBlock({
    $type: LEAFLET_BLOCK.image,
    image: { $type: "blob", ref: { $link: cid }, mimeType: "image/webp" },
    aspectRatio: { width: 960, height: 1484 },
  });
}

function text(plaintext: string) {
  return leafletBlock({ $type: LEAFLET_BLOCK.text, plaintext });
}

function heading(plaintext: string) {
  return leafletBlock({ $type: LEAFLET_BLOCK.header, plaintext, level: 2 });
}

function post(blocks: Array<unknown>, textLength: number): SerialSampleRow {
  return {
    did,
    title: "A post",
    contentFormat: LEAFLET_CONTENT,
    contentJson: {
      $type: LEAFLET_CONTENT,
      pages: [{ $type: LEAFLET_PAGE.linearDocument, blocks }],
    },
    textLength,
  };
}

/** A comic page: the art, and the author's note under it. */
const comicPage = post(
  [image("bafpage"), text("Sorry for the late update!")],
  900,
);

/**
 * An illustrated announcement — the shape that used to classify as a comic:
 * one image, a few hundred words, and a body that is otherwise all prose.
 */
const illustratedArticle = post(
  [
    text("We are delighted to announce a sponsor."),
    image("baflogo"),
    text("They have supported the community for years."),
    heading("What they do"),
    text("Quite a lot, as it happens."),
    text("Tickets are still available."),
    leafletBlock({ $type: LEAFLET_BLOCK.horizontalRule }),
    text("See you there."),
  ],
  1100,
);

describe("readsAsComicPage", () => {
  it("accepts art with a note beside it", () => {
    expect(readsAsComicPage(comicPage)).toBe(true);
  });

  it("accepts a bare page of art", () => {
    expect(readsAsComicPage(post([image("bafpage")], 0))).toBe(true);
  });

  it("accepts a page whose note runs to a few paragraphs", () => {
    expect(
      readsAsComicPage(
        post([image("bafpage"), text("One"), text("Two"), text("Three")], 1200),
      ),
    ).toBe(true);
  });

  it("rejects an article that merely carries an illustration", () => {
    expect(readsAsComicPage(illustratedArticle)).toBe(false);
  });

  it("rejects a post with no art at all", () => {
    expect(readsAsComicPage(post([text("All prose.")], 300))).toBe(false);
  });

  it("rejects a chapter of writing however it is illustrated", () => {
    expect(readsAsComicPage(post([image("bafpage"), text("…")], 40_000))).toBe(
      false,
    );
  });
});

describe("classifySerialSample", () => {
  it("says nothing about a publication with no posts", () => {
    expect(classifySerialSample([])).toEqual({
      sampled: 0,
      comicPages: 0,
      share: 0,
      kind: null,
    });
  });

  it("calls a run of pages a comic", () => {
    const verdict = classifySerialSample(
      Array.from({ length: 10 }, () => comicPage),
    );
    expect(verdict.kind).toBe("comic");
    expect(verdict.share).toBe(1);
  });

  it("calls an illustrated newsletter a book", () => {
    // The regression: every post here has an image and short prose, which is
    // all the classifier used to ask for (atmosphereconf.org).
    const verdict = classifySerialSample(
      Array.from({ length: 10 }, () => illustratedArticle),
    );
    expect(verdict.kind).toBe("book");
    expect(verdict.comicPages).toBe(0);
  });

  it("tolerates the odd announcement inside a comic", () => {
    const verdict = classifySerialSample([
      ...Array.from({ length: 8 }, () => comicPage),
      illustratedArticle,
      post([text("On hiatus until March.")], 200),
    ]);
    expect(verdict.kind).toBe("comic");
  });
});
