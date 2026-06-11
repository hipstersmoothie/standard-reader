/**
 * Bluesky social-graph helpers via the public AppView (no auth required).
 */

const PUBLIC_APPVIEW = "https://public.api.bsky.app";
const FETCH_TIMEOUT_MS = 8000;
const RELATIONSHIPS_BATCH = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chunk<T>(items: Array<T>, size: number): Array<Array<T>> {
  const batches: Array<Array<T>> = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function parseRelationshipDid(value: unknown): {
  did: string;
  following: boolean;
} | null {
  if (!isRecord(value)) return null;
  const did = value.did;
  if (typeof did !== "string" || !did.startsWith("did:")) return null;
  return {
    did,
    following:
      typeof value.following === "string" && value.following.length > 0,
  };
}

/**
 * Return the subset of `candidateDids` that `actorDid` follows on Bluesky.
 * Uses `app.bsky.graph.getRelationships` (30 DIDs per request).
 */
export async function filterDidsFollowedByActor(
  actorDid: string,
  candidateDids: ReadonlyArray<string>,
): Promise<Set<string>> {
  const unique = [
    ...new Set(
      candidateDids.filter((did) => did.startsWith("did:") && did !== actorDid),
    ),
  ];
  if (unique.length === 0) return new Set();

  const followed = new Set<string>();
  for (const batch of chunk(unique, RELATIONSHIPS_BATCH)) {
    try {
      const url = new URL(
        "/xrpc/app.bsky.graph.getRelationships",
        PUBLIC_APPVIEW,
      );
      url.searchParams.set("actor", actorDid);
      for (const did of batch) {
        url.searchParams.append("others", did);
      }

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) continue;

      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.relationships)) {
        continue;
      }

      for (const relationship of payload.relationships) {
        const parsed = parseRelationshipDid(relationship);
        if (parsed?.following) {
          followed.add(parsed.did);
        }
      }
    } catch {
      // Best-effort — omit this batch on timeout/network failure.
    }
  }

  return followed;
}
