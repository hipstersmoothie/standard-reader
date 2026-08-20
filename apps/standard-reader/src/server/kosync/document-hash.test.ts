import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  koreaderFilenameMd5,
  koreaderPartialMd5,
} from "#/server/kosync/document-hash";

/**
 * An independent transcription of KOReader's `util.partialMD5`, written from
 * the Lua rather than from our implementation — including the `lshift(1024, -2)`
 * overflow that puts the first sample at offset 0.
 *
 * If the two ever disagree, every device in the wild follows this one.
 */
function referencePartialMd5(data: Uint8Array): string {
  const hash = createHash("md5");
  const offsets = [0];
  for (let i = 0; i <= 10; i += 1) offsets.push(1024 * 4 ** i);

  for (const offset of offsets) {
    if (offset >= data.length) break;
    hash.update(data.subarray(offset, offset + 1024));
  }
  return hash.digest("hex");
}

function filled(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = (index * 31 + 7) % 256;
  }
  return bytes;
}

describe("koreaderPartialMd5", () => {
  it("samples from offset 0 first", () => {
    // The Lua reads `lshift(step, 2*i)` starting at i = -1, and LuaJIT masks the
    // shift to five bits — so the first sample is the head of the file. A
    // reimplementation that "corrects" this hashes files no device can match.
    const data = filled(512);
    expect(koreaderPartialMd5(data)).toBe(
      createHash("md5").update(data).digest("hex"),
    );
  });

  it("matches the reference walk at every size that crosses an offset", () => {
    for (const size of [1, 1023, 1024, 1025, 4095, 4096, 20_000, 300_000]) {
      const data = filled(size);
      expect(koreaderPartialMd5(data)).toBe(referencePartialMd5(data));
    }
  });

  it("only samples 1 KiB per offset, not the whole file", () => {
    // Two 40 KiB files differing only outside every sample window hash the
    // same. That is the point of a *partial* MD5 — and the reason a device can
    // hash a large book in twelve reads.
    const a = filled(40 * 1024);
    const b = filled(40 * 1024);
    b[3000] = (b[3000] ?? 0) ^ 255; // between the 1KiB and 4KiB windows
    expect(koreaderPartialMd5(a)).toBe(koreaderPartialMd5(b));
  });

  it("notices a change inside a sample window", () => {
    const a = filled(40 * 1024);
    const b = filled(40 * 1024);
    b[1030] = (b[1030] ?? 0) ^ 255; // inside the window at offset 1024
    expect(koreaderPartialMd5(a)).not.toBe(koreaderPartialMd5(b));
  });

  it("hashes an empty file to the empty MD5", () => {
    expect(koreaderPartialMd5(new Uint8Array())).toBe(
      createHash("md5").digest("hex"),
    );
  });
});

describe("koreaderFilenameMd5", () => {
  it("is a plain MD5 of the basename", () => {
    expect(koreaderFilenameMd5("A-Great-Article.epub")).toBe(
      createHash("md5").update("A-Great-Article.epub").digest("hex"),
    );
  });
});
