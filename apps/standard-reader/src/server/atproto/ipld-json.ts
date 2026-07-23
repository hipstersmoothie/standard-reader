/**
 * Convert IPLD dag-json link/bytes encodings to the AT Protocol lex-JSON
 * encodings, recursively.
 *
 * `documents.content_json` is persisted as Postgres `jsonb` that round-tripped
 * through a dag-json decode, so CID links appear as `{"/": "<cid>"}` and byte
 * strings as `{"/": {"bytes": "<b64>"}}` — the IPLD conventions. AT Protocol
 * XRPC clients expect the lex-JSON conventions instead: `{"$link": "<cid>"}`
 * and `{"$bytes": "<b64>"}`. A strict lex parser (e.g. `@atproto/lex-client`)
 * rejects the dag-json forms outright with "Invalid blob object".
 *
 * Normalizing on output makes `getDocument`'s `content` payload conform to the
 * wire format every atproto client expects. It's safe for our own renderer,
 * whose `blobCid()` already reads both the `$link` and `"/"` shapes.
 *
 * Within a dag-json-decoded payload a single-key `{"/": …}` object is always a
 * link/bytes node, never ordinary data, so the conversion cannot misfire.
 */
export function ipldToLexJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => ipldToLexJson(item));
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);

    if (keys.length === 1 && keys[0] === "/") {
      const inner = obj["/"];

      // dag-json CID link: {"/": "<cid>"} -> {"$link": "<cid>"}
      if (typeof inner === "string") {
        return { $link: inner };
      }

      // dag-json bytes: {"/": {"bytes": "<b64>"}} -> {"$bytes": "<b64>"}
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        const innerObj = inner as Record<string, unknown>;
        const innerKeys = Object.keys(innerObj);
        if (
          innerKeys.length === 1 &&
          innerKeys[0] === "bytes" &&
          typeof innerObj.bytes === "string"
        ) {
          return { $bytes: innerObj.bytes };
        }
      }

      // Unexpected `/` payload — recurse defensively, preserving the key.
      return { "/": ipldToLexJson(inner) };
    }

    const out: Record<string, unknown> = {};
    for (const key of keys) {
      out[key] = ipldToLexJson(obj[key]);
    }
    return out;
  }

  return value;
}
