/**
 * Reconcile `site.standard.publication` and `site.standard.document` records
 * for one or more repos against their PDS: upsert what exists on-chain and
 * hard-delete read-model rows that no longer exist (e.g. tap missed delete
 * events, or events were dead-lettered past the retry cap).
 *
 *   pnpm backfill:repo-documents <did> [<did> ...]
 *   pnpm backfill:repo-documents --dry-run <did> [<did> ...]
 *   pnpm backfill:repo-documents --prune-only <did> [<did> ...]
 */
import { reconcileRepoFromPds } from "../src/server/ingest/repo-sync.ts";
import { recomputePublicationStats } from "../src/server/ingest/recompute.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pruneOnly = args.includes("--prune-only");
const dids = args.filter((arg) => arg.startsWith("did:"));
if (dids.length === 0) {
  console.error(
    "usage: pnpm backfill:repo-documents [--dry-run] [--prune-only] <did> [<did> ...]",
  );
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

for (const did of dids) {
  const result = await reconcileRepoFromPds(did, {
    dryRun,
    upsert: !pruneOnly,
  });
  if (result.skipped) {
    console.warn(`skipping ${did}: could not resolve PDS`);
    continue;
  }
  const upsertLabel = pruneOnly
    ? "skipped upsert (--prune-only)"
    : dryRun
      ? "would upsert"
      : "upserted";
  console.log(
    `${did}: pds has ${result.pdsPublications} publications, ${result.pdsDocuments} documents; ` +
      `${upsertLabel} ${pruneOnly || dryRun ? 0 : result.upsertedDocuments} documents; ` +
      `${dryRun ? "would prune" : "pruned"} ${result.prunedPublications} publications, ${result.prunedDocuments} stale documents`,
  );
}

if (!dryRun) {
  console.log("recomputing publication stats…");
  await recomputePublicationStats();
}
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
