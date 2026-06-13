/**
 * Re-pull `site.standard.publication` and `site.standard.document` records for
 * one or more repos straight from their PDS and upsert them into the read
 * model. Use when tap missed or dropped events for a repo (e.g. the repo is
 * stuck in tap's `error` state, or events were dead-lettered past the retry
 * cap).
 *
 *   pnpm backfill:repo-documents <did> [<did> ...]
 */
import type {
  DocumentRecord,
  PublicationRecord,
} from "../src/server/atproto/types.ts";

import { resolveIdentity } from "../src/server/atproto/identity.ts";
import { Collections } from "../src/server/atproto/uri.ts";
import {
  upsertDocument,
  upsertPublication,
} from "../src/server/ingest/handlers.ts";

const LIST_PAGE = 100;
const FETCH_TIMEOUT_MS = 15_000;

interface ListedRecord {
  uri: string;
  cid?: string;
  value?: Record<string, unknown>;
}

async function listRecords(
  pds: string,
  did: string,
  collection: string,
): Promise<Array<ListedRecord>> {
  const records: Array<ListedRecord> = [];
  let cursor: string | undefined;
  do {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", pds);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", collection);
    url.searchParams.set("limit", String(LIST_PAGE));
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`listRecords ${collection} failed: ${res.status}`);
    }
    const body = (await res.json()) as {
      cursor?: string;
      records?: Array<ListedRecord>;
    };
    records.push(...(body.records ?? []));
    cursor =
      (body.records?.length ?? 0) === LIST_PAGE ? body.cursor : undefined;
  } while (cursor);
  return records;
}

function rkeyOf(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

async function backfillRepo(did: string): Promise<void> {
  const identity = await resolveIdentity(did);
  if (!identity.pds) {
    console.warn(`skipping ${did}: could not resolve PDS`);
    return;
  }

  // Publications first so documents can attach to them on upsert.
  const pubs = await listRecords(identity.pds, did, Collections.publication);
  for (const record of pubs) {
    if (!record.value) {
      continue;
    }
    await upsertPublication(
      record.uri,
      did,
      rkeyOf(record.uri),
      record.cid,
      record.value as unknown as PublicationRecord,
    );
  }

  const docs = await listRecords(identity.pds, did, Collections.document);
  let upserted = 0;
  for (const record of docs) {
    if (!record.value) {
      continue;
    }
    await upsertDocument(
      record.uri,
      did,
      rkeyOf(record.uri),
      record.cid,
      record.value as unknown as DocumentRecord,
    );
    upserted += 1;
    if (upserted % 25 === 0) {
      console.log(`  ${did}: ${upserted}/${docs.length} documents`);
    }
  }
  console.log(
    `${did}: upserted ${pubs.length} publications, ${upserted} documents`,
  );
}

const dids = process.argv.slice(2).filter((arg) => arg.startsWith("did:"));
if (dids.length === 0) {
  console.error("usage: pnpm backfill:repo-documents <did> [<did> ...]");
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

for (const did of dids) {
  await backfillRepo(did);
}
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
