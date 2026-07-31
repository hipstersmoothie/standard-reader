/**
 * Offprint "components" — the `app.offprint.component` lexicon: a reusable
 * block of content (a newsletter footer, a mature-content warning) that a
 * publication authors once and inlines into many documents.
 *
 * Documents reference a component by AT-URI rather than strongRef, so edits
 * cascade to every document embedding it. That means the record is resolved
 * when the article is read — never pinned into `content_json` at ingest.
 */

import type { StructuredRenderableBlock } from "#/lib/document/structured-content/types";
import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";
import { parseAtUri } from "#/server/atproto/uri";

import { offprintBlocks } from "./blocks";
import { OFFPRINT_COMPONENT_COLLECTION } from "./types";

export interface OffprintComponent {
  /** The component body, parsed into the shared renderable block union. */
  blocks: Array<StructuredRenderableBlock>;
  /** Repo the component lives in — blob URLs in its body resolve against it. */
  did: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Fetch and parse an `app.offprint.component` by AT-URI.
 *
 * Routes through `fetchRepoRecordWithFallback` (Slingshot first, PDS fallback)
 * so it is safe to call from the browser, mirroring `fetchPcktGallery` and
 * `fetchMiniPost`. Returns null for anything that isn't a component record, or
 * whose body has no renderable blocks.
 */
export async function fetchOffprintComponent(
  componentUri: string,
): Promise<OffprintComponent | null> {
  const parsed = parseAtUri(componentUri);
  if (!parsed || parsed.collection !== OFFPRINT_COMPONENT_COLLECTION) {
    return null;
  }

  const result = await fetchRepoRecordWithFallback(componentUri);
  if (!isRecord(result?.value)) return null;

  const blocks = offprintBlocks(result.value.content);
  if (blocks.length === 0) return null;

  return { blocks, did: parsed.did };
}
