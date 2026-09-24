/**
 * Run the shipped detector (franc + CJK gate + chunk vote) over a sample and
 * emit the cleaned prose sample alongside its verdict, so every other
 * candidate in the benchmark reads exactly the same input.
 *
 *   tsx scripts/lang-bench/run-franc.ts <corpus.jsonl> <out.jsonl>
 */
import { readFileSync, writeFileSync } from "node:fs";

import { detectDocumentLanguage } from "../../src/server/lang/detect.ts";
import { documentLanguageSample, proseLength } from "../../src/server/lang/sample.ts";

const [input, out] = process.argv.slice(2);
const rows = readFileSync(input!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const lines: Array<string> = [];
const t0 = performance.now();
for (const r of rows) {
  const sample = documentLanguageSample({ title: r.title, description: r.description, textContent: r.text_content });
  const d = detectDocumentLanguage({ title: r.title, description: r.description, textContent: r.text_content });
  lines.push(JSON.stringify({ uri: r.uri, sample, prose: proseLength(sample), franc: d?.code ?? null, franc_conf: d?.confidence ?? null }));
}
const ms = performance.now() - t0;
writeFileSync(out!, lines.join("\n") + "\n");
console.log(`${rows.length} docs, ${(ms / rows.length).toFixed(2)} ms/doc`);
