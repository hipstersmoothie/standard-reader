import { eq, sql } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents } from "../src/db/schema.ts";
import { listRepoRecords } from "../src/server/atproto/fetch-record.ts";
import { authorPds } from "../src/server/atproto/identity.ts";

const DID = "did:plc:tnliqml7jfchh6dltyi2senj";

async function listPdsDocuments(pds: string) {
  const { records } = await listRepoRecords(DID, "site.standard.document", pds);
  return records.map((record) => ({
    uri: record.uri,
    value: record.value as {
      title?: string;
      publishedAt?: string;
      path?: string;
      updatedAt?: string;
    },
  }));
}

async function main() {
  const pds = await authorPds(DID, null);
  if (!pds) {
    console.log("No PDS for", DID);
    return;
  }
  console.log("PDS:", pds);

  const pdsDocs = await listPdsDocuments(pds);
  pdsDocs.sort((a, b) =>
    (b.value.publishedAt ?? "").localeCompare(a.value.publishedAt ?? ""),
  );
  console.log("PDS doc count:", pdsDocs.length);
  console.log("PDS latest 8:");
  for (const r of pdsDocs.slice(0, 8)) {
    console.log(
      "",
      r.uri.split("/").pop(),
      "|",
      r.value.title,
      "|",
      r.value.publishedAt,
      "|",
      r.value.path,
    );
  }

  const dbRows = await db
    .select({
      uri: documents.uri,
      title: documents.title,
      publishedAt: documents.publishedAt,
      path: documents.path,
      deleted: documents.deleted,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(eq(documents.did, DID))
    .orderBy(sql`published_at desc nulls last`);

  console.log("\nDB doc count:", dbRows.length);
  console.log("DB latest 8:");
  for (const r of dbRows.slice(0, 8)) {
    console.log(
      "",
      r.uri.split("/").pop(),
      "|",
      r.title,
      "|",
      r.publishedAt?.toISOString(),
      "|",
      r.path,
      r.deleted ? "(deleted)" : "",
    );
  }

  const dbUris = new Set(dbRows.map((r) => r.uri));
  const missing = pdsDocs.filter((r) => !dbUris.has(r.uri));
  console.log("\nOn PDS but missing from DB:", missing.length);
  for (const r of missing.slice(0, 10)) {
    console.log("", r.uri, r.value.title);
  }

  const pdsUris = new Set(pdsDocs.map((r) => r.uri));
  const stale = dbRows.filter((r) => !r.deleted && !pdsUris.has(r.uri));
  console.log("\nIn DB but not on PDS:", stale.length);
}

await main();
