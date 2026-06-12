/**
 * Report image alt-text coverage by indexed content format.
 *
 *   pnpm scan:image-alt-rates
 */
import { isNotNull } from "drizzle-orm";

import type { StructuredRenderableBlock } from "../src/lib/document/structured-content/types.ts";

import { db } from "../src/db/index.ts";
import { documents } from "../src/db/schema.ts";
import {
  LEAFLET_DOCUMENT_FORMAT,
  altMarkdownText,
  htmlContentBody,
  isAltMarkdownFormat,
  isHtmlContentFormat,
  isStructuredBlockFormat,
  leafletDocumentContent,
  structuredFormatBlocks,
} from "../src/lib/document/content-formats.ts";
import {
  normalizeImageAlt,
  structuredImageHasSource,
} from "../src/lib/document/structured-content/image.ts";
import { markdownPlaintext } from "../src/lib/document/structured-content/markdown.ts";
import { STANDARD_MARKDOWN_CONTENT } from "../src/lib/document/structured-content/types.ts";
import { leafletBlocks } from "../src/lib/leaflet/blocks.ts";
import { leafletImageCid } from "../src/lib/leaflet/image.ts";
import { LEAFLET_CONTENT } from "../src/lib/leaflet/types.ts";
import { markpubPlaintext } from "../src/lib/markpub/markdown.ts";
import { MARKPUB_MARKDOWN } from "../src/lib/markpub/types.ts";
import { offprintBlocks } from "../src/lib/offprint/blocks.ts";
import { OFFPRINT_CONTENT } from "../src/lib/offprint/types.ts";
import { pcktBlocks } from "../src/lib/pckt/blocks.ts";
import { pcktImageAlt, pcktImageHasSource } from "../src/lib/pckt/image.ts";
import { PCKT_CONTENT } from "../src/lib/pckt/types.ts";

const PAGE_SIZE = 100;

interface FormatStats {
  documents: number;
  documentsWithImages: number;
  images: number;
  imagesWithAlt: number;
  /** pckt only: gallery blocks whose images live in separate records */
  galleryRefs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveFormat(
  contentFormat: string | null,
  contentJson: unknown,
): string | null {
  if (contentFormat) return contentFormat;
  if (isRecord(contentJson) && typeof contentJson.$type === "string") {
    return contentJson.$type;
  }
  return null;
}

function emptyStats(): FormatStats {
  return {
    documents: 0,
    documentsWithImages: 0,
    images: 0,
    imagesWithAlt: 0,
  };
}

function countMarkdownImages(text: string): {
  images: number;
  withAlt: number;
} {
  let images = 0;
  let withAlt = 0;
  for (const match of text.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)) {
    images += 1;
    if (match[1]?.trim()) withAlt += 1;
  }
  return { images, withAlt };
}

function countHtmlImages(html: string): { images: number; withAlt: number } {
  let images = 0;
  let withAlt = 0;
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    images += 1;
    const altMatch = match[0].match(/\balt=(["'])(.*?)\1/i);
    if (altMatch?.[2]?.trim()) withAlt += 1;
  }
  return { images, withAlt };
}

function countStructuredImages(blocks: Array<StructuredRenderableBlock>): {
  images: number;
  withAlt: number;
} {
  let images = 0;
  let withAlt = 0;
  for (const block of blocks) {
    if (block.kind !== "image") continue;
    if (!structuredImageHasSource(block)) continue;
    images += 1;
    if (normalizeImageAlt(block.alt).length > 0) withAlt += 1;
  }
  return { images, withAlt };
}

function countImages(
  format: string,
  contentJson: unknown,
): { images: number; withAlt: number; galleryRefs?: number } {
  if (format === LEAFLET_CONTENT || format === LEAFLET_DOCUMENT_FORMAT) {
    const content =
      format === LEAFLET_DOCUMENT_FORMAT
        ? leafletDocumentContent(contentJson)
        : contentJson;
    let images = 0;
    let withAlt = 0;
    for (const block of leafletBlocks(content)) {
      if (block.kind !== "image") continue;
      if (!leafletImageCid(block.block.image)) continue;
      images += 1;
      if (normalizeImageAlt(block.block.alt).length > 0) withAlt += 1;
    }
    return { images, withAlt };
  }

  if (format === PCKT_CONTENT) {
    let images = 0;
    let withAlt = 0;
    let galleryRefs = 0;
    for (const block of pcktBlocks(contentJson)) {
      if (block.kind === "gallery") {
        galleryRefs += 1;
        continue;
      }
      if (block.kind !== "image") continue;
      if (!pcktImageHasSource(block.block)) continue;
      images += 1;
      if (pcktImageAlt(block.block).length > 0) withAlt += 1;
    }
    return { images, withAlt, galleryRefs };
  }

  if (format === OFFPRINT_CONTENT) {
    return countStructuredImages(offprintBlocks(contentJson));
  }

  if (format === STANDARD_MARKDOWN_CONTENT) {
    const text = markdownPlaintext(contentJson);
    return text ? countMarkdownImages(text) : { images: 0, withAlt: 0 };
  }

  if (format === MARKPUB_MARKDOWN) {
    const text = markpubPlaintext(contentJson);
    return text ? countMarkdownImages(text) : { images: 0, withAlt: 0 };
  }

  if (isAltMarkdownFormat(format)) {
    const text = altMarkdownText(contentJson, format);
    return text ? countMarkdownImages(text) : { images: 0, withAlt: 0 };
  }

  if (isHtmlContentFormat(format)) {
    const html = htmlContentBody(contentJson, format);
    return html ? countHtmlImages(html) : { images: 0, withAlt: 0 };
  }

  if (isStructuredBlockFormat(format)) {
    const blocks = structuredFormatBlocks(contentJson, format);
    return blocks ? countStructuredImages(blocks) : { images: 0, withAlt: 0 };
  }

  return { images: 0, withAlt: 0 };
}

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${((100 * n) / d).toFixed(1)}%`;
}

async function main() {
  const byFormat = new Map<string, FormatStats>();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const batch = await db
      .select({
        contentFormat: documents.contentFormat,
        contentJson: documents.contentJson,
      })
      .from(documents)
      .where(isNotNull(documents.contentJson))
      .limit(PAGE_SIZE)
      .offset(offset);

    if (batch.length === 0) break;

    for (const row of batch) {
      const format = resolveFormat(row.contentFormat, row.contentJson);
      if (!format) continue;

      const stats = byFormat.get(format) ?? emptyStats();
      stats.documents += 1;

      const { images, withAlt, galleryRefs } = countImages(
        format,
        row.contentJson,
      );
      if (galleryRefs) {
        stats.galleryRefs = (stats.galleryRefs ?? 0) + galleryRefs;
      }
      if (images > 0) stats.documentsWithImages += 1;
      stats.images += images;
      stats.imagesWithAlt += withAlt;

      byFormat.set(format, stats);
    }
  }

  const rows = [...byFormat.entries()]
    .map(([format, stats]) => ({
      format,
      ...stats,
      altRate: pct(stats.imagesWithAlt, stats.images),
    }))
    .toSorted(
      (a, b) =>
        b.images - a.images ||
        b.documents - a.documents ||
        a.format.localeCompare(b.format),
    );

  const totals = emptyStats();
  for (const row of rows) {
    totals.documents += row.documents;
    totals.documentsWithImages += row.documentsWithImages;
    totals.images += row.images;
    totals.imagesWithAlt += row.imagesWithAlt;
  }

  // eslint-disable-next-line no-console
  console.log("Image alt-text coverage by content format\n");
  // eslint-disable-next-line no-console
  console.log(
    [
      "format".padEnd(44),
      "docs".padStart(6),
      "w/img".padStart(6),
      "imgs".padStart(6),
      "alt".padStart(6),
      "rate".padStart(7),
      "notes",
    ].join("  "),
  );
  // eslint-disable-next-line no-console
  console.log("-".repeat(95));

  for (const row of rows) {
    const notes =
      row.galleryRefs && row.galleryRefs > 0
        ? `${row.galleryRefs} gallery ref(s) not counted`
        : row.images === 0
          ? "no images found"
          : "";
    // eslint-disable-next-line no-console
    console.log(
      [
        row.format.padEnd(44),
        String(row.documents).padStart(6),
        String(row.documentsWithImages).padStart(6),
        String(row.images).padStart(6),
        String(row.imagesWithAlt).padStart(6),
        row.altRate.padStart(7),
        notes,
      ].join("  "),
    );
  }

  // eslint-disable-next-line no-console
  console.log("-".repeat(95));
  // eslint-disable-next-line no-console
  console.log(
    [
      "TOTAL (formats above)".padEnd(44),
      String(totals.documents).padStart(6),
      String(totals.documentsWithImages).padStart(6),
      String(totals.images).padStart(6),
      String(totals.imagesWithAlt).padStart(6),
      pct(totals.imagesWithAlt, totals.images).padStart(7),
    ].join("  "),
  );
}

await main();
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
