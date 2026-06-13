import { loadApiDocsFixturesAsync } from "../src/server/api-docs/fixtures.server.ts";
import { runApiDocsExamples } from "../src/server/api-docs/run-example.server.ts";

const fixtures = await loadApiDocsFixturesAsync();
const results = await runApiDocsExamples();
const failed = results.filter((r) => r.status < 200 || r.status >= 300);
const ok = results.filter((r) => r.status >= 200 && r.status < 300);

console.log(`OK: ${ok.length}  FAILED: ${failed.length}  TOTAL: ${results.length}`);
if (fixtures.listUri.includes("did:plc:example")) {
  console.log(
    "Skipped list examples (no API_DOCS_FIXTURE_LIST_URI / discoverable list on PDS).",
  );
}
for (const r of failed) {
  let detail: unknown;
  try {
    detail = JSON.parse(r.bodyJson);
  } catch {
    detail = r.bodyJson;
  }
  console.log(`\n${r.nsid} → HTTP ${r.status}`);
  console.log(JSON.stringify(detail, null, 2));
}

if (failed.length > 0) process.exitCode = 1;
