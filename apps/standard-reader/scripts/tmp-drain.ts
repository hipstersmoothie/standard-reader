/**
 * One-off: drain the first-pass repair backlog.
 *
 * Bridged repos are skipped — `tap-bridge` is re-backfilling all of them from an
 * empty database already.
 */
import { sql } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { repairRepoIfAdvanced } from "../src/server/ingest/repo-sync.ts";

const CONCURRENCY = Number(process.env.DRAIN_CONCURRENCY ?? 12);

const result = await db.execute<{ did: string }>(sql`
  select t.did
  from tracked_repos t
  left join profiles p on p.did = t.did
  where t.backfill_state <> 'gone'
    and t.last_seen_rev is null
    and coalesce(p.handle, '') not like '%.brid.gy'
  order by t.updated_at asc
`);
const dids = ((result.rows ?? result) as unknown as Array<{ did: string }>).map(
  (r) => r.did,
);

console.log(`draining ${dids.length} repos at concurrency ${CONCURRENCY}`);
const started = Date.now();
let done = 0;
let repaired = 0;
let failed = 0;
let docs = 0;
let readerRecords = 0;
let cursor = 0;

async function worker(): Promise<void> {
  while (cursor < dids.length) {
    const did = dids[cursor++];
    if (!did) return;
    try {
      const r = await repairRepoIfAdvanced(did);
      if (!r.unchanged) {
        repaired += 1;
        docs += r.upsertedDocuments ?? 0;
        readerRecords += r.repairedReaderRecords ?? 0;
      }
    } catch {
      failed += 1;
    }
    done += 1;
    if (done % 100 === 0) {
      const rate = done / ((Date.now() - started) / 1000);
      console.log(
        `  ${done}/${dids.length} | repaired=${repaired} docs=${docs} reader=${readerRecords} failed=${failed} | ${rate.toFixed(1)}/s ETA ${Math.round((dids.length - done) / rate / 60)}m`,
      );
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
console.log(
  `\nDONE in ${Math.round((Date.now() - started) / 60_000)}m — repaired=${repaired} documents=${docs} readerRecords=${readerRecords} failed=${failed}`,
);
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
