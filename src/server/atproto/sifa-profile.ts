/**
 * Sifa (sifa.id) professional profile detection.
 *
 * Constellation indexes backlinks *to* a target, not whether a DID owns a given
 * repo record. A Sifa account is detected by reading the singleton
 * `id.sifa.profile.self/self` record from the author's PDS (Slingshot fallback
 * when the PDS is slow or unreachable).
 *
 * Results are cached in-memory with a TTL so the external PDS/Slingshot check
 * does not run on every publication page load — most authors do not have a
 * Sifa profile, so the negative result is cached and reused.
 */

import { fetchRepoRecord } from "#/server/atproto/fetch-record";
import { resolveIdentity } from "#/server/atproto/identity";

const SIFA_WEB_ORIGIN = "https://sifa.id";
const SIFA_PROFILE_SELF_COLLECTION = "id.sifa.profile.self";
const SIFA_PROFILE_SELF_RKEY = "self";
const DEFAULT_SLINGSHOT_URL = "https://slingshot.microcosm.blue";
const FETCH_TIMEOUT_MS = 8000;
/** How long a cached result (positive or negative) is reused. */
const CACHE_TTL_MS = 10 * 60_000;

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

interface SifaCacheEntry {
  hasProfile: boolean;
  expires: number;
}

const sifaCache = new Map<string, SifaCacheEntry>();

async function hasSifaProfileSelfRecord(did: string): Promise<boolean> {
  const cached = sifaCache.get(did);
  if (cached && cached.expires > Date.now()) {
    return cached.hasProfile;
  }

  let hasProfile = false;

  // Try Slingshot first — it's a caching proxy that aggregates repo records,
  // so it's typically faster and more reliable than hitting the author's PDS
  // directly (which may be slow or unreachable).
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
    hasProfile = response.ok;
  } catch {
    hasProfile = false;
  }

  // Fall back to the author's PDS when Slingshot doesn't have the record.
  if (!hasProfile) {
    const uri = sifaProfileSelfUri(did);
    const identity = await resolveIdentity(did);
    if (identity.pds) {
      const record = await fetchRepoRecord(identity.pds, uri);
      if (record) hasProfile = true;
    }
  }

  sifaCache.set(did, {
    hasProfile,
    expires: Date.now() + CACHE_TTL_MS,
  });
  return hasProfile;
}

/**
 * Resolve a public Sifa profile URL when the author has claimed a Sifa account.
 * Returns null when no `id.sifa.profile.self` record exists. Results are cached
 * for {@link CACHE_TTL_MS} so repeated publication page views don't re-fetch.
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

/** Bust the cached Sifa profile check for a DID (after a profile change). */
export function invalidateSifaProfile(did: string): void {
  sifaCache.delete(did);
}
