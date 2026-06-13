import type { Client } from "@atcute/client";

import { putReadRecord } from "#/server/atproto/repo-records";
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
  for (const documentUri of documentUris) {
    await putReadRecord(client, did, documentUri, createdAt);
  }
  await trackReaderRepo(did);
  return { markedCount: documentUris.length, documentUris };
}
