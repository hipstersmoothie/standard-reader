/**
 * Bluesky social-graph helpers via the public AppView (no auth required).
 */

const PUBLIC_APPVIEW = "https://public.api.bsky.app";
const FETCH_TIMEOUT_MS = 8000;
const RELATIONSHIPS_BATCH = 30;
/** In-flight `getRelationships` requests. Bounded to stay a polite client. */
const RELATIONSHIPS_CONCURRENCY = 8;

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

export interface FollowedDidsResult {
  /** The subset of the candidates that the actor follows. */
  followed: Set<string>;
  /** Batches the AppView never answered (timeout, network, non-2xx). */
  failedBatches: number;
  /** Batches attempted. `failedBatches === batches` means we learned nothing. */
  batches: number;
}

/**
 * Return the subset of `candidateDids` that `actorDid` follows on Bluesky.
 * Uses `app.bsky.graph.getRelationships` (30 DIDs per request).
 */
export async function filterDidsFollowedByActor(
  actorDid: string,
  candidateDids: ReadonlyArray<string>,
): Promise<Set<string>> {
  const { followed } = await followedDidsForActor(actorDid, candidateDids);
  return followed;
}

/**
 * {@link filterDidsFollowedByActor} with batch-failure counts retained.
 *
 * Callers that render "we found nobody" need to tell a genuine empty result
 * apart from an unreachable AppView — an empty `followed` with
 * `failedBatches > 0` is "couldn't check", not "no results".
 */
export async function followedDidsForActor(
  actorDid: string,
  candidateDids: ReadonlyArray<string>,
): Promise<FollowedDidsResult> {
  const unique = [
    ...new Set(
      candidateDids.filter((did) => did.startsWith("did:") && did !== actorDid),
    ),
  ];
  if (unique.length === 0) {
    return { followed: new Set(), failedBatches: 0, batches: 0 };
  }

  const followed = new Set<string>();
  const allBatches = chunk(unique, RELATIONSHIPS_BATCH);
  let failedBatches = 0;

  // Batches run concurrently: a full candidate sweep is dozens of requests, and
  // serially they add up to tens of seconds. The cap keeps us a polite client.
  const queue = [...allBatches];
  const workers = Array.from(
    { length: Math.min(RELATIONSHIPS_CONCURRENCY, queue.length) },
    async () => {
      for (let batch = queue.shift(); batch; batch = queue.shift()) {
        await runBatch(batch);
      }
    },
  );

  async function runBatch(batch: Array<string>): Promise<void> {
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
      if (!response.ok) {
        failedBatches += 1;
        return;
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.relationships)) {
        failedBatches += 1;
        return;
      }

      for (const relationship of payload.relationships) {
        const parsed = parseRelationshipDid(relationship);
        if (parsed?.following) {
          followed.add(parsed.did);
        }
      }
    } catch {
      // Best-effort — omit this batch on timeout/network failure.
      failedBatches += 1;
    }
  }

  await Promise.all(workers);

  return { followed, failedBatches, batches: allBatches.length };
}
