/**
 * DID → identity resolution (PDS endpoint + handle), used to build blob URLs
 * for standard.site assets and to enrich profiles. Resolution is cached in a
 * module-level Map so repeated lookups during a backfill are cheap (see the
 * "cache repeated function calls" guidance) and survive across requests on a
 * warm serverless instance.
 */

export interface ResolvedIdentity {
  did: string;
  /** PDS service endpoint, e.g. `https://pds.example.com`. */
  pds: string | null;
  /** Primary handle from `alsoKnownAs`, e.g. `alice.bsky.social`. */
  handle: string | null;
}

interface CacheEntry extends ResolvedIdentity {
  /**
   * True once this entry reflects an actual DID-document fetch (success *or*
   * failure). Entries seeded only from a tap identity event (handle, no PDS)
   * are NOT authoritative and must still trigger a DID-doc fetch when a PDS is
   * needed — otherwise a handle-only prime permanently masks the real PDS and
   * leaves blob URLs (publication icons, doc covers) unresolved.
   */
  resolved: boolean;
  /**
   * For negative results (the DID-doc fetch failed): epoch ms after which the
   * entry is stale and a fresh resolution should be attempted. Successful
   * resolutions omit this and are cached for the lifetime of the instance.
   */
  retryAfter?: number;
}

interface DidDocument {
  id?: string;
  alsoKnownAs?: Array<string>;
  service?: Array<{ id?: string; type?: string; serviceEndpoint?: string }>;
}

const cache = new Map<string, CacheEntry>();
/** In-flight resolutions, so a burst of events for the same DID shares one
 * network request instead of spawning thousands of concurrent fetches. */
const inflight = new Map<string, Promise<ResolvedIdentity>>();

const PLC_URL = process.env.TAP_PLC_URL || "https://plc.directory";
/** Hard cap on each DID-doc fetch so a slow/hanging PLC can't pile up unbounded
 * pending promises (which previously exhausted memory under firehose load). */
const FETCH_TIMEOUT_MS = 8000;
/** How long a failed DID-doc fetch is remembered before we retry. Long enough
 * to shield PLC from hammering during a burst, short enough that a transient
 * outage doesn't permanently strand blob URLs as null. */
const NEGATIVE_TTL_MS = 10 * 60 * 1000;

/** A cached entry is usable as-is only if it was resolved from a DID doc and
 * isn't a still-valid negative result that has now expired. */
function isFresh(entry: CacheEntry): boolean {
  if (!entry.resolved) return false;
  if (entry.retryAfter !== undefined && entry.retryAfter <= Date.now()) {
    return false;
  }
  return true;
}

function pdsFromDoc(doc: DidDocument): string | null {
  const service = doc.service?.find(
    (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
  );
  return service?.serviceEndpoint ?? null;
}

function handleFromDoc(doc: DidDocument): string | null {
  const aka = doc.alsoKnownAs?.find((value) => value.startsWith("at://"));
  return aka ? aka.slice("at://".length) : null;
}

async function fetchDidDoc(did: string): Promise<DidDocument | null> {
  try {
    let url: string | null = null;
    if (did.startsWith("did:plc:")) {
      url = `${PLC_URL}/${encodeURIComponent(did)}`;
    } else if (did.startsWith("did:web:")) {
      const host = did.slice("did:web:".length).replaceAll(":", "/");
      url = `https://${host}/.well-known/did.json`;
    }
    if (!url) {
      return null;
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as DidDocument;
  } catch {
    return null;
  }
}

/**
 * Resolve a DID to its PDS + handle. Authoritative (DID-doc) results are cached
 * for the instance lifetime; a failed fetch is negative-cached for
 * `NEGATIVE_TTL_MS` and then retried. Entries seeded only from an identity
 * event's handle are not authoritative, so they never short-circuit a real
 * resolution (this is what previously left publication icons / doc covers
 * unresolved when an identity event beat the record into the cache).
 */
export async function resolveIdentity(did: string): Promise<ResolvedIdentity> {
  const cached = cache.get(did);
  if (cached && isFresh(cached)) {
    return cached;
  }
  const pending = inflight.get(did);
  if (pending) {
    return pending;
  }
  const promise = (async () => {
    const doc = await fetchDidDoc(did);
    const prior = cache.get(did);
    const resolved: CacheEntry = doc
      ? {
          did,
          pds: pdsFromDoc(doc),
          // Prefer the doc's handle, but keep a primed handle if the doc omits it.
          handle: handleFromDoc(doc) ?? prior?.handle ?? null,
          resolved: true,
        }
      : {
          did,
          pds: null,
          handle: prior?.handle ?? null,
          resolved: true,
          retryAfter: Date.now() + NEGATIVE_TTL_MS,
        };
    cache.set(did, resolved);
    return resolved;
  })();
  inflight.set(did, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(did);
  }
}

/** PDS from the profile row when present; otherwise resolve from the DID doc. */
export async function authorPds(
  did: string,
  cachedPds?: string | null,
): Promise<string | null> {
  if (cachedPds) return cachedPds;
  const identity = await resolveIdentity(did);
  return identity.pds;
}

/** Return an already-known identity without doing network I/O. Use this in the
 * hot tap webhook path so acknowledgements are not blocked on PLC/PDS lookups. */
export function getCachedIdentity(did: string): ResolvedIdentity | null {
  return cache.get(did) ?? null;
}

/** Seed/refresh the identity cache from a known handle (e.g. a tap identity
 * event), without forcing a network round-trip. Preserves an existing
 * authoritative resolution (so we don't drop a known PDS); when no resolved
 * entry exists yet, the handle-only entry stays non-authoritative so a later
 * PDS lookup still hits the DID doc instead of trusting this null PDS. */
export function primeIdentityHandle(did: string, handle: string): void {
  const existing = cache.get(did);
  cache.set(did, {
    did,
    pds: existing?.pds ?? null,
    handle,
    resolved: existing?.resolved ?? false,
    retryAfter: existing?.retryAfter,
  });
}
