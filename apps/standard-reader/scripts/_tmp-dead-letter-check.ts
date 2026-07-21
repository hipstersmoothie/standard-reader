import { and, eq, like, sql } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { ingestDeadLetter } from "../src/db/schema/ingest.ts";

const did = "did:plc:pzgvqg4ihnaihkrpmxqz5pu6";

const [summary] = await db
  .select({
    total: sql<number>`count(*)::int`.mapWith(Number),
    deletes:
      sql<number>`count(*) filter (where action = 'delete')::int`.mapWith(
        Number,
      ),
    documents:
      sql<number>`count(*) filter (where collection = 'site.standard.document')::int`.mapWith(
        Number,
      ),
    maxRetries: sql<number>`max(retries)::int`.mapWith(Number),
  })
  .from(ingestDeadLetter)
  .where(like(ingestDeadLetter.uri, `%${did}%`));

console.log("dead letters for bell.bz DID:", summary);

const samples = await db
  .select({
    action: ingestDeadLetter.action,
    collection: ingestDeadLetter.collection,
    retries: ingestDeadLetter.retries,
    error: ingestDeadLetter.error,
    createdAt: ingestDeadLetter.createdAt,
  })
  .from(ingestDeadLetter)
  .where(
    and(
      like(ingestDeadLetter.uri, `%${did}%`),
      eq(ingestDeadLetter.action, "delete"),
    ),
  )
  .limit(5);

console.log("sample delete dead letters:", samples);

const [globalDl] = await db
  .select({
    total: sql<number>`count(*)::int`.mapWith(Number),
    deletes:
      sql<number>`count(*) filter (where action = 'delete')::int`.mapWith(
        Number,
      ),
    exhausted: sql<number>`count(*) filter (where retries >= 5)::int`.mapWith(
      Number,
    ),
  })
  .from(ingestDeadLetter);

console.log("global dead letter stats:", globalDl);
