import { eq, sql } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents } from "../src/db/schema.ts";
import { authorPds } from "../src/server/atproto/identity.ts";

const DID = "did:plc:tnliqml7jfchh6dltyi2senj";

async function listPdsDocuments(pds: string) {
  const all: Array<{
    uri: string;
    value: {
      title?: string;
      publishedAt?: string;
      path?: string;
      updatedAt?: string;
    };
  }> = [];
  let cursor: string | undefined;
  do {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", pds);
    url.searchParams.set("repo", DID);
    url.searchParams.set("collection", "site.standard.document");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    const body = (await res.json()) as {
      records?: typeof all;
      cursor?: string;
    };
    all.push(...(body.records ?? []));
    cursor =
      body.records?.length === 100 ? body.cursor : undefined;
  } while (cursor);
  return all;
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
      " ",
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
      " ",
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
    console.log(" ", r.uri, r.value.title);
  }

  const pdsUris = new Set(pdsDocs.map((r) => r.uri));
  const stale = dbRows.filter((r) => !r.deleted && !pdsUris.has(r.uri));
  console.log("\nIn DB but not on PDS:", stale.length);
}

await main();
