import type { Client } from "@atcute/client";

import { COLLECTION } from "#/lib/atproto/nsids";
import {
  APPLY_WRITES_MAX_BATCH,
  repoApplyWrites,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { ensureTracked } from "#/server/ingest/tap-client";

export interface MarkDocumentsReadResult {
  markedCount: number;
  documentUris: Array<string>;
}

async function trackReaderRepo(did: string): Promise<void> {
  try {
    await ensureTracked(did, "reader");
  } catch (error) {
    console.warn("[reader] failed to track reader repo", did, error);
  }
}

/** Mark multiple documents read in the subject repo (shared by XRPC + server fns). */
export async function markDocumentsRead(options: {
  client: Client;
  did: string;
  documentUris: Array<string>;
  trackReading: boolean;
}): Promise<MarkDocumentsReadResult> {
  const { client, did, documentUris, trackReading } = options;
  if (documentUris.length === 0 || !trackReading) {
    return { markedCount: 0, documentUris: [] };
  }

  const createdAt = new Date().toISOString();

  // `applyWrites` is atomic per request and capped server-side, so a large
  // backlog has to go out as several sequential batches. Sequential (not
  // parallel) keeps us inside the PDS rate limit — the client retries 429s with
  // the server's own `Retry-After`, and firing N batches at once would just
  // burn those retries against a window we've already exhausted.
  const marked: Array<string> = [];
  for (let i = 0; i < documentUris.length; i += APPLY_WRITES_MAX_BATCH) {
    const batch = documentUris.slice(i, i + APPLY_WRITES_MAX_BATCH);
    // A failure here propagates, but earlier batches are already durable on the
    // PDS — read records are additive and keyed by subject, so a retry re-marks
    // only what's still unread rather than duplicating work.
    await repoApplyWrites(client, {
      repo: did,
      writes: batch.map((documentUri) => ({
        $type: "com.atproto.repo.applyWrites#create",
        collection: COLLECTION.read,
        rkey: subjectRkey(documentUri),
        value: {
          $type: COLLECTION.read,
          subject: documentUri,
          createdAt,
        },
      })),
    });
    marked.push(...batch);
  }

  await trackReaderRepo(did);
  return { markedCount: marked.length, documentUris: marked };
}
