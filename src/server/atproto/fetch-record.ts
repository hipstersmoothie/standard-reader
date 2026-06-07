function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ParsedAtUri {
  did: string;
  collection: string;
  rkey: string;
}

/** Parse `at://did/collection/rkey` into components. */
export function parseAtUri(uri: string): ParsedAtUri | null {
  if (!uri.startsWith("at://")) return null;
  const rest = uri.slice("at://".length);
  const parts = rest.split("/");
  if (parts.length < 3) return null;
  const [did, collection, ...rkeyParts] = parts;
  const rkey = rkeyParts.join("/");
  if (!did?.startsWith("did:") || !collection || !rkey) return null;
  return { did, collection, rkey };
}

/** Fetch a repo record value from an author's PDS. */
export async function fetchRepoRecord(
  pds: string,
  uri: string,
): Promise<unknown | null> {
  const parsed = parseAtUri(uri);
  if (!parsed) return null;

  const base = pds.replace(/\/+$/, "");
  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  });
  const url = `${base}/xrpc/com.atproto.repo.getRecord?${params}`;

  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !isRecord(payload.value)) return null;
    return payload.value;
  } catch {
    return null;
  }
}
