/**
 * Sifa (sifa.id) professional profile detection.
 *
 * Constellation indexes backlinks *to* a target, not whether a DID owns a given
 * repo record. A Sifa account is detected by reading the singleton
 * `id.sifa.profile.self/self` record from the author's PDS (Slingshot fallback
 * when the PDS is slow or unreachable).
 */

import { fetchRepoRecord } from "#/server/atproto/fetch-record";
import { resolveIdentity } from "#/server/atproto/identity";

const SIFA_WEB_ORIGIN = "https://sifa.id";
const SIFA_PROFILE_SELF_COLLECTION = "id.sifa.profile.self";
const SIFA_PROFILE_SELF_RKEY = "self";
const DEFAULT_SLINGSHOT_URL = "https://slingshot.microcosm.blue";
const FETCH_TIMEOUT_MS = 8000;

function slingshotBaseUrl(): string {
  const configured = process.env.SLINGSHOT_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return DEFAULT_SLINGSHOT_URL;
}

function sifaProfileSelfUri(did: string): string {
  return `at://${did}/${SIFA_PROFILE_SELF_COLLECTION}/${SIFA_PROFILE_SELF_RKEY}`;
}

/** Public Sifa profile page — prefers handle over raw DID. */
export function sifaProfilePageUrl(did: string, handle: string | null): string {
  const slug = handle?.trim() || did;
  return `${SIFA_WEB_ORIGIN}/p/${encodeURIComponent(slug)}`;
}

async function hasSifaProfileSelfRecord(did: string): Promise<boolean> {
  const uri = sifaProfileSelfUri(did);
  const identity = await resolveIdentity(did);

  if (identity.pds) {
    const record = await fetchRepoRecord(identity.pds, uri);
    if (record) return true;
  }

  try {
    const params = new URLSearchParams({
      repo: did,
      collection: SIFA_PROFILE_SELF_COLLECTION,
      rkey: SIFA_PROFILE_SELF_RKEY,
    });
    const url = `${slingshotBaseUrl()}/xrpc/com.atproto.repo.getRecord?${params}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve a public Sifa profile URL when the author has claimed a Sifa account.
 * Returns null when no `id.sifa.profile.self` record exists.
 */
export async function resolveSifaProfileUrl(
  did: string,
  handle: string | null,
): Promise<string | null> {
  if (!did.startsWith("did:")) return null;
  const hasProfile = await hasSifaProfileSelfRecord(did);
  if (!hasProfile) return null;

  const identity = handle ? null : await resolveIdentity(did);
  return sifaProfilePageUrl(did, handle ?? identity?.handle ?? null);
}
