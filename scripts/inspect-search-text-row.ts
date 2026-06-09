/**
 * Diagnostic: show why a document's stored text and extracted text fail
 * normalized-containment dedupe. Temporary.
 *
 *   pnpm exec tsx --env-file=.env scripts/inspect-search-text-row.ts <uri>
 */
import { eq } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents } from "../src/db/schema.ts";
import { documentExtractedText } from "../src/lib/document/search-text.ts";

const uri = process.argv[2];
if (!uri) throw new Error("usage: inspect-search-text-row.ts <uri>");

const [row] = await db
  .select({
    textContent: documents.textContent,
    contentJson: documents.contentJson,
    contentFormat: documents.contentFormat,
  })
  .from(documents)
  .where(eq(documents.uri, uri))
  .limit(1);

if (!row) throw new Error("not found");

const normalize = (text: string) => text.replaceAll(/\s+/g, " ").trim();
const stored = normalize(row.textContent ?? "");
const extracted = normalize(
  documentExtractedText(row.contentJson, row.contentFormat) ?? "",
);

console.log("format:", row.contentFormat);
console.log("stored len:", stored.length, "extracted len:", extracted.length);
console.log("contained:", stored.includes(extracted));

let i = 0;
while (i < Math.min(stored.length, extracted.length)) {
  if (stored[i] !== extracted[i]) break;
  i++;
}
console.log("first divergence at", i);
console.log(
  "stored   :",
  JSON.stringify(stored.slice(Math.max(0, i - 60), i + 80)),
);
console.log(
  "extracted:",
  JSON.stringify(extracted.slice(Math.max(0, i - 60), i + 80)),
);
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
