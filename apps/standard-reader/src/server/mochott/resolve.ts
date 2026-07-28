/**
 * Fetch a mochott article body for a `site.standard.document` that has none.
 *
 * The live path is the tap: `site.mochott.article` is one of the collections we
 * deliver, so `upsertMochottArticle` indexes the body onto the document row as
 * it arrives. This module is the catch-up path — the document reached us
 * without its sibling (repo enumeration, an article written before we filtered
 * for the collection, a create we missed) — used by ingest, the read path and
 * the backfill script.
 */

import { MOCHOTT_ARTICLE, mochottArticleContent } from "#/lib/mochott/types";

import { fetchRepoRecordWithFallback } from "../atproto/fetch-record.ts";
import { buildAtUri } from "../atproto/uri.ts";

/** Ingest sits on the firehose hot path; don't wait long on a miss. */
const FETCH_TIMEOUT_MS = 4000;

/** The article record that sits at the same rkey as a document. */
export function mochottArticleUri(did: string, rkey: string): string {
  return buildAtUri(did, MOCHOTT_ARTICLE, rkey);
}

/**
 * The `site.mochott.article` body for `(did, rkey)`, ready to store as a
 * document's content, or null when the repo has no such record (the common
 * case — most bodyless documents are not mochott's).
 */
export async function fetchMochottArticleContent(
  did: string,
  rkey: string,
  pds: string | null | undefined,
): Promise<unknown> {
  const result = await fetchRepoRecordWithFallback(
    mochottArticleUri(did, rkey),
    pds,
    FETCH_TIMEOUT_MS,
  );
  if (!result?.value) return null;
  return mochottArticleContent(result.value);
}
