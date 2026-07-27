/**
 * The capability matrix and the emitters have to agree.
 *
 * The matrix is what a user is warned about; the emitter switch is what
 * actually gets written. If they drift, the converter either drops content
 * silently or warns about a loss that never happened — both worse than an
 * outright failure. So: feed every block type through every target and assert
 * the emitted output matches what the matrix promised.
 */

import type { BlockNode, DocumentTree } from "@standard-reader/renderer-core";
import { describe, expect, it } from "vitest";

import { BLOCK_SUPPORT } from "../capabilities.js";
import type { EmitContext } from "../emit.js";
import { toLeaflet } from "../targets/leaflet.js";
import { toMarkpub } from "../targets/markpub.js";
import { toOffprint } from "../targets/offprint.js";
import { toPckt } from "../targets/pckt.js";
import type { BlockType, ConversionIssue, ConversionTarget } from "../types.js";
import { CONVERSION_TARGETS, createReporter } from "../types.js";
import { BLOB } from "./fixtures.js";

const text = (plaintext: string) => ({ plaintext });
const image = (alt: string) => ({
  alt,
  aspectRatio: 1.5,
  source: { aspectRatio: { height: 2, width: 3 }, blob: BLOB },
  src: "https://cdn.example/img.png",
});

/**
 * One representative node per block type. Exhaustive by construction — adding a
 * block type to renderer-core breaks this file until it is handled here and in
 * the matrix.
 */
const SAMPLES: Record<BlockType, BlockNode> = {
  blockquote: { paragraphs: [text("quoted")], type: "blockquote" },
  blueskyEmbed: {
    postCid: "bafypost",
    postUri: "at://did:plc:a/app.bsky.feed.post/1",
    type: "blueskyEmbed",
  },
  bulletList: {
    items: [{ children: [], runs: [text("one")] }],
    type: "bulletList",
  },
  button: { href: "https://example.com", text: "Go", type: "button" },
  callout: { emoji: "💡", text: text("note"), type: "callout" },
  code: { code: "x = 1", language: "py", type: "code" },
  heading: { level: 2, text: text("Title"), type: "heading" },
  horizontalRule: { type: "horizontalRule" },
  html: { html: "<div>raw</div>", type: "html" },
  iframe: { height: 400, type: "iframe", url: "https://example.com/embed" },
  image: { ...image("A cat"), type: "image" },
  imageCarousel: {
    images: [image("one"), image("two")],
    type: "imageCarousel",
  },
  imageDiff: {
    after: image("after"),
    before: image("before"),
    type: "imageDiff",
  },
  imageGrid: { images: [image("one"), image("two")], type: "imageGrid" },
  "leaflet.pageEmbed": {
    children: [{ dropCap: false, text: text("nested"), type: "paragraph" }],
    pageId: "page-1",
    type: "leaflet.pageEmbed",
  },
  "leaflet.poll": {
    pollCid: "bafypoll",
    pollUri: "at://did:plc:a/pub.leaflet.poll/1",
    type: "leaflet.poll",
  },
  "leaflet.separator": { type: "leaflet.separator" },
  "leaflet.signup": { type: "leaflet.signup" },
  "leaflet.standardSitePost": {
    type: "leaflet.standardSitePost",
    uri: "at://did:plc:a/site.standard.document/1",
  },
  "leaflet.standardSitePublication": {
    type: "leaflet.standardSitePublication",
    uri: "at://did:plc:a/site.standard.publication/1",
  },
  math: { tex: "x^2", type: "math" },
  "offprint.component": {
    componentUri: "at://did:plc:a/app.offprint.component/1",
    type: "offprint.component",
  },
  orderedList: {
    items: [{ children: [], runs: [text("one")] }],
    start: 1,
    type: "orderedList",
  },
  paragraph: { dropCap: false, text: text("body"), type: "paragraph" },
  "pckt.gallery": {
    ref: "at://did:plc:a/blog.pckt.gallery/1",
    type: "pckt.gallery",
  },
  "pckt.noteEmbed": {
    cid: "bafynote",
    type: "pckt.noteEmbed",
    uri: "at://did:plc:a/blog.pckt.mini.post/1",
  },
  table: {
    rows: [[{ header: true, text: text("Name") }]],
    type: "table",
  },
  taskList: {
    items: [{ checked: true, runs: [text("done")] }],
    type: "taskList",
  },
  unknown: { blockType: "com.example.widget", type: "unknown" },
  website: { src: "https://example.com", title: "Example", type: "website" },
};

const EMITTERS: Record<
  ConversionTarget,
  (tree: DocumentTree, ctx: EmitContext) => Record<string, unknown> | null
> = {
  leaflet: toLeaflet,
  markpub: toMarkpub,
  offprint: toOffprint,
  pckt: toPckt,
};

function emitOne(
  target: ConversionTarget,
  node: BlockNode,
): { output: Record<string, unknown> | null; issues: Array<ConversionIssue> } {
  const reporter = createReporter();
  const tree: DocumentTree = {
    children: [node],
    footnoteNumbers: new Map(),
    footnotes: [],
    format: "test",
  };
  const output = EMITTERS[target](tree, {
    authorDid: "did:plc:testauthor",
    report: reporter.report,
    target,
  });
  return { issues: reporter.issues, output };
}

const BLOCK_TYPES = Object.keys(SAMPLES) as Array<BlockType>;

describe.each(CONVERSION_TARGETS)("%s emitter honours the matrix", (target) => {
  it.each(BLOCK_TYPES)("%s", (blockType) => {
    const support = BLOCK_SUPPORT[target][blockType];
    const { output, issues } = emitOne(target, SAMPLES[blockType]);
    const unsupported = issues.filter(
      (issue) => issue.code === "block-unsupported",
    );
    const degraded = issues.filter((issue) => issue.code === "block-degraded");

    switch (support.level) {
      case "native": {
        expect(unsupported).toEqual([]);
        expect(degraded).toEqual([]);
        // A natively supported block must actually produce output.
        expect(output).not.toBeNull();
        break;
      }
      case "degraded": {
        expect(unsupported).toEqual([]);
        expect(degraded).toHaveLength(1);
        expect(degraded[0]?.fallback).toBe(support.fallback);
        // Degraded still means the content survives in some form.
        expect(output).not.toBeNull();
        break;
      }
      case "none": {
        expect(degraded).toEqual([]);
        expect(unsupported).toHaveLength(1);
        expect(unsupported[0]?.message).toBe(support.note);
        // Nothing may be emitted for a block the user was told is unsupported.
        expect(output).toBeNull();
        break;
      }
    }
  });
});

describe("the matrix covers every block type", () => {
  it.each(CONVERSION_TARGETS)("%s", (target) => {
    expect(Object.keys(BLOCK_SUPPORT[target]).toSorted()).toEqual(
      BLOCK_TYPES.toSorted(),
    );
  });
});
