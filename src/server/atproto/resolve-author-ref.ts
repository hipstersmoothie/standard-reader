import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";

import { isDid } from "@atcute/lexicons/syntax";
import { normalizeAuthorRef } from "#/lib/author-profile";
import { eq } from "drizzle-orm";

const PUBLIC_APPVIEW = "https://public.api.bsky.app";
const RESOLVE_TIMEOUT_MS = 8000;

async function resolveHandleToDid(handle: string): Promise<string | null> {
  try {
    const url = new URL(
      "/xrpc/com.atproto.identity.resolveHandle",
      PUBLIC_APPVIEW,
    );
    url.searchParams.set("handle", handle);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { did?: string };
    return body.did && isDid(body.did) ? body.did : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a route ref (DID or handle) to a canonical DID for author queries.
 * Falls back to the normalized ref when resolution fails so callers can still
 * attempt identity lookups.
 */
export async function resolveAuthorDid(
  db: Db,
  schema: Schema,
  ref: string,
): Promise<string> {
  const normalized = normalizeAuthorRef(ref);
  if (isDid(normalized)) {
    return normalized;
  }

  const pr = schema.profiles;
  const [row] = await db
    .select({ did: pr.did })
    .from(pr)
    .where(eq(pr.handle, normalized.toLowerCase()))
    .limit(1);
  if (row?.did) {
    return row.did;
  }

  const resolved = await resolveHandleToDid(normalized.toLowerCase());
  return resolved ?? normalized;
}
