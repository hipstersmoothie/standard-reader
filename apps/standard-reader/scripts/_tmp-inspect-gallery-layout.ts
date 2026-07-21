import { isNotNull } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents } from "../src/db/schema.ts";

const PAGE_SIZE = 75;
const rows: Array<{ uri: string; contentJson: unknown }> = [];

for (let offset = 0; ; offset += PAGE_SIZE) {
  const batch = await db
    .select({ uri: documents.uri, contentJson: documents.contentJson })
    .from(documents)
    .where(isNotNull(documents.contentJson))
    .limit(PAGE_SIZE)
    .offset(offset);
  if (batch.length === 0) break;
  rows.push(...batch);
}

function findImageGalleryBlocks(
  value: unknown,
): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const seen = new Set<unknown>();
  function walk(node: unknown): void {
    if (node === null || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.$type === "pub.leaflet.blocks.imageGallery") {
      found.push(record);
    }
    for (const v of Object.values(record)) walk(v);
  }
  walk(value);
  return found;
}

const allKeys = new Set<string>();
const layoutValues = new Map<string, number>();
let count = 0;

for (const row of rows) {
  const galleries = findImageGalleryBlocks(row.contentJson);
  for (const g of galleries) {
    count++;
    for (const key of Object.keys(g)) {
      if (key !== "images" && key !== "$type") allKeys.add(key);
    }
    // Check for layout-like fields
    for (const key of [
      "layout",
      "display",
      "mode",
      "style",
      "variant",
      "type",
    ]) {
      if (key in g) {
        const val = String(g[key]);
        layoutValues.set(val, (layoutValues.get(val) ?? 0) + 1);
      }
    }
  }
}

// eslint-disable-next-line no-console
console.log(`Total imageGallery blocks: ${count}`);
// eslint-disable-next-line no-console
console.log(`Extra keys (beyond $type, images):`, [...allKeys]);
// eslint-disable-next-line no-console
console.log(`Layout-like field values:`, [...layoutValues.entries()]);

// Print a few full examples
const examples: Array<Record<string, unknown>> = [];
for (const row of rows) {
  const galleries = findImageGalleryBlocks(row.contentJson);
  for (const g of galleries) {
    if (examples.length < 5) {
      // Strip images to just show structure
      const { images, ...rest } = g;
      examples.push({
        ...rest,
        imageCount: Array.isArray(images) ? images.length : 0,
      });
    }
  }
}
// eslint-disable-next-line no-console
console.log("\nExample blocks (without full images):");
for (const ex of examples) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(ex, null, 2));
}

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
