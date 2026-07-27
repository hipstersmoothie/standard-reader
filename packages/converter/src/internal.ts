/** Small helpers shared by the emitters. Not part of the public API. */

const encoder = new TextEncoder();

/** Narrow to a plain (non-array) object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** UTF-8 byte length of a string — AT Proto facet indices are byte offsets. */
export function utf8ByteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

/**
 * Prefix a run of rich text, shifting every facet forward by the prefix's byte
 * length so the ranges keep pointing at the same characters.
 */
export function prefixRichText(
  text: { plaintext: string; facets?: Array<unknown> },
  prefix: string,
): { plaintext: string; facets?: Array<unknown> } {
  if (!prefix) return text;
  const shift = utf8ByteLength(prefix);
  const facets = text.facets?.flatMap((facet) => {
    if (!isRecord(facet) || !isRecord(facet.index)) return [];
    const { byteStart, byteEnd } = facet.index;
    if (typeof byteStart !== "number" || typeof byteEnd !== "number") return [];
    return [
      {
        ...facet,
        index: {
          ...facet.index,
          byteEnd: byteEnd + shift,
          byteStart: byteStart + shift,
        },
      },
    ];
  });
  return {
    plaintext: `${prefix}${text.plaintext}`,
    ...(facets?.length ? { facets } : {}),
  };
}

/**
 * Concatenate rich-text runs, shifting each run's facets to its offset in the
 * joined plaintext. Used where a target has one text slot but the source split
 * a paragraph across several runs (list items, table cells).
 */
export function joinRichText(
  runs: Array<{ plaintext: string; facets?: Array<unknown> }>,
  separator = "\n",
): { plaintext: string; facets?: Array<unknown> } {
  if (runs.length === 1 && runs[0]) return runs[0];
  let plaintext = "";
  const facets: Array<unknown> = [];
  for (const [index, run] of runs.entries()) {
    if (index > 0) plaintext += separator;
    const shift = utf8ByteLength(plaintext);
    for (const facet of run.facets ?? []) {
      if (!isRecord(facet) || !isRecord(facet.index)) continue;
      const { byteStart, byteEnd } = facet.index;
      if (typeof byteStart !== "number" || typeof byteEnd !== "number")
        continue;
      facets.push({
        ...facet,
        index: {
          ...facet.index,
          byteEnd: byteEnd + shift,
          byteStart: byteStart + shift,
        },
      });
    }
    plaintext += run.plaintext;
  }
  return { plaintext, ...(facets.length > 0 ? { facets } : {}) };
}

/**
 * An `https://bsky.app` permalink for an `at://` post URI, so formats without a
 * Bluesky embed can at least link to the post.
 */
export function bskyAppUrl(atUri: string): string | null {
  const match = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(atUri);
  if (!match) return null;
  const [, repo, rkey] = match;
  if (!repo || !rkey) return null;
  return `https://bsky.app/profile/${repo}/post/${rkey}`;
}

/** Drop `undefined` values so emitted records carry only real fields. */
export function compact<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as T;
}
