/**
 * Report block types in indexed documents that the reader cannot render.
 *
 *   pnpm scan:unsupported-blocks
 */
import { isNotNull } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents } from "../src/db/schema.ts";
import {
  LEAFLET_KNOWN_UNSUPPORTED,
  scanUnsupportedBlocks,
} from "../src/lib/content/scan-unsupported-blocks.ts";

const PAGE_SIZE = 75;

const rows: Array<{
  uri: string;
  contentFormat: string | null;
  contentJson: unknown;
}> = [];

for (let offset = 0; ; offset += PAGE_SIZE) {
  const batch = await db
    .select({
      uri: documents.uri,
      contentFormat: documents.contentFormat,
      contentJson: documents.contentJson,
    })
    .from(documents)
    .where(isNotNull(documents.contentJson))
    .limit(PAGE_SIZE)
    .offset(offset);

  if (batch.length === 0) break;
  rows.push(...batch);
}

const report = scanUnsupportedBlocks(rows);

// eslint-disable-next-line no-console
console.log(`Scanned ${rows.length} indexed document(s).\n`);
// eslint-disable-next-line no-console
console.log("Unsupported blocks in indexed documents:\n");
if (report.byType.length === 0) {
  // eslint-disable-next-line no-console
  console.log("  (none — all top-level blocks are supported)");
} else {
  for (const hit of report.byType) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${hit.blockType} [${hit.contentFormat}] — ${hit.count} document(s)`,
    );
    for (const uri of hit.sampleUris) {
      // eslint-disable-next-line no-console
      console.log(`    e.g. ${uri}`);
    }
  }
}

// eslint-disable-next-line no-console
console.log("\nLeaflet block types in spec but not yet implemented:");
for (const type of LEAFLET_KNOWN_UNSUPPORTED) {
  const inDb = report.gapsByFormat["pub.leaflet.content"]?.includes(type);
  // eslint-disable-next-line no-console
  console.log(`  ${type}${inDb ? " (found in DB)" : ""}`);
}

// eslint-disable-next-line no-console
console.log("\nAll block $types in raw JSON by content format:");
for (const [format, types] of Object.entries(report.rawTypesByFormat)) {
  // eslint-disable-next-line no-console
  console.log(`  ${format}:`);
  for (const type of types) {
    if (type.includes(".block") || type.includes(".blocks.")) {
      // eslint-disable-next-line no-console
      console.log(`    ${type}`);
    }
  }
}

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
