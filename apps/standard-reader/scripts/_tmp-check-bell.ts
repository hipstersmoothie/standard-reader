import { and, eq, sql } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents } from "../src/db/schema/documents.ts";

const did = "did:plc:pzgvqg4ihnaihkrpmxqz5pu6";
const pubUri =
  "at://did:plc:pzgvqg4ihnaihkrpmxqz5pu6/site.standard.publication/3mnjqgomo4f2r";

const [total] = await db
  .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
  .from(documents)
  .where(and(eq(documents.did, did), eq(documents.deleted, false)));
const [forPub] = await db
  .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
  .from(documents)
  .where(
    and(eq(documents.publicationUri, pubUri), eq(documents.deleted, false)),
  );

const dupes = await db
  .select({
    title: documents.title,
    count: sql<number>`count(*)::int`.mapWith(Number),
  })
  .from(documents)
  .where(
    and(eq(documents.publicationUri, pubUri), eq(documents.deleted, false)),
  )
  .groupBy(documents.title)
  .having(sql`count(*) > 1`)
  .orderBy(sql`count(*) desc`)
  .limit(10);

console.log("DB total docs for DID:", total.count);
console.log("DB docs for bell.bz pub:", forPub.count);
console.log("Duplicate titles:", dupes);
