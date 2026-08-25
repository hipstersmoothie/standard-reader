/**
 * KOReader's document digests, computed server-side.
 *
 * KOReader has no field for "which article is this" — a device reports progress
 * against a hash of the file it is holding. To connect that back to a document
 * we have to be able to compute the same hash from the same bytes, which works
 * only because book generation is deterministic (see `server/books/zip.ts`).
 *
 * Two hashes, because KOReader offers two matching methods:
 *
 *  - **binary** (its default): a *partial* MD5 — twelve 1 KiB samples at
 *    exponentially spaced offsets, so a 40 MB book hashes in twelve reads.
 *    {@link koreaderPartialMd5} reproduces that sampling exactly, including the
 *    quirk that makes the first sample land at offset 0.
 *  - **filename**: MD5 of the file's basename.
 *
 * Both are recorded per download, so a reader who switches methods on their
 * device does not silently lose their place.
 */

import { createHash } from "node:crypto";

/**
 * Offsets KOReader samples, in order.
 *
 * From `util.partialMD5`: `for i = -1, 10 do file:seek("set", lshift(step, 2*i))`
 * with `step = 1024`. The first iteration is the interesting one — LuaJIT masks
 * shift counts to five bits, so `lshift(1024, -2)` is `lshift(1024, 30)`, which
 * overflows 32 bits to **0**. So the first sample is the head of the file, not
 * a quarter-kilobyte in, and any reimplementation that "fixes" the negative
 * shift produces hashes no device will ever match.
 */
const SAMPLE_OFFSETS = ((): Array<number> => {
  const offsets = [0];
  for (let i = 0; i <= 10; i += 1) offsets.push(1024 * 4 ** i);
  return offsets;
})();

const SAMPLE_SIZE = 1024;

/** The digest KOReader computes for a file in `binary` matching mode. */
export function koreaderPartialMd5(data: Uint8Array): string {
  const hash = createHash("md5");
  for (const offset of SAMPLE_OFFSETS) {
    // Lua's `read` returns nil past EOF and the loop stops there — so a short
    // file contributes only the samples that exist, and a seek beyond the end
    // ends the walk rather than mixing in zero bytes.
    if (offset >= data.length) break;
    hash.update(
      data.subarray(offset, Math.min(offset + SAMPLE_SIZE, data.length)),
    );
  }
  return hash.digest("hex");
}

/** The digest KOReader computes for a file in `filename` matching mode. */
export function koreaderFilenameMd5(filename: string): string {
  return createHash("md5").update(filename).digest("hex");
}
