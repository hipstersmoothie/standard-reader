import type { CollectionFilter, RawEvent } from "@bsky/jetstream";
import { decode as cborDecode } from "@ipld/dag-cbor";

import type { IngestRecordPayload } from "../atproto/types.ts";

/**
 * The collections we ingest, as Jetstream filters — shared by the live channel
 * and the archive replay so the two can never disagree about what "our data"
 * means. A repo repaired from the archive has to cover exactly what the stream
 * covers, or repair would quietly reintroduce the gaps it exists to close.
 *
 * Namespace wildcards rather than an exhaustive NSID list: the dispatcher's
 * `default` branch already reports anything it does not model, and a wildcard
 * means a new `app.standard-reader.*` record type starts flowing the moment its
 * handler lands instead of needing a filter edit deployed first.
 *
 * `app.bsky.actor.profile` is deliberately absent. Network-wide it is tens of
 * millions of records for the ~15k we mirror, and Jetstream's DID filter caps
 * at 10,000 — fewer than we track. Profiles are fetched directly instead (see
 * `profile-refresh.ts`).
 */
export const INGESTED_COLLECTIONS = [
  "site.standard.*",
  "app.standard-reader.*",
  "site.mochott.article",
] as const satisfies ReadonlyArray<CollectionFilter>;

/**
 * Adapt a Jetstream v2 raw event into the {@link IngestRecordPayload} the
 * read-model dispatcher already speaks, so `handleRecord` stays the single
 * place a record becomes a row.
 *
 * **Raw, not typed, on purpose.** The SDK's typed decode (`snapshot()` /
 * `live()` without `raw: true`) runs every record through `parseRawRecord`,
 * which throws on anything that isn't a `$type`'d map — and reports the throw
 * through `onError` while *skipping the event*. Roughly 0.05% of standard.site
 * records on the network carry no `$type` field, and they are not junk: they
 * include live publications and documents that tap ingests today and that are
 * already rows in the read-model. Our handlers dispatch on the commit's
 * `collection`, never the record's `$type`, so the field is decoration to us.
 * Decoding the archived DAG-CBOR ourselves keeps those records instead of
 * losing a slice of the network to a validator we don't need.
 *
 * Both wire shapes arrive here: the live tail yields already-parsed JSON, the
 * archive yields byte-exact DAG-CBOR. `cborDecode` handles the latter, and
 * `blobCid()` downstream already normalizes every blob-ref representation
 * either produces (`{$link}`, `{"/"}`, bare string, or a CID instance).
 */
export function toIngestRecordPayload(
  event: RawEvent,
  options: { live: boolean },
): IngestRecordPayload | null {
  if (event.kind !== "commit") {
    return null;
  }
  const commit = event.commit;
  const base = {
    action: commit.operation,
    collection: commit.collection,
    did: event.did,
    live: options.live,
    rev: commit.rev,
    rkey: commit.rkey,
  } satisfies Omit<IngestRecordPayload, "cid" | "record">;

  if (commit.operation === "delete") {
    return base;
  }

  return {
    ...base,
    cid: commit.cid,
    record: decodeRecord(commit.record),
  };
}

/**
 * A put commit's record as a plain object for the mappers.
 *
 * The archive arm is `Uint8Array` (DAG-CBOR exactly as stored); the live arm is
 * already-parsed wire JSON. Anything that decodes to a non-object is returned
 * as an empty record rather than thrown away — `handleRecord` logs and drops a
 * bodyless put itself, which keeps that decision in one place.
 */
function decodeRecord(record: unknown): Record<string, unknown> {
  const value =
    record instanceof Uint8Array
      ? (cborDecode(record) as unknown)
      : (record as unknown);
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
