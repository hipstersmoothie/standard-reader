/* eslint-disable unicorn/number-literal-case -- ZIP signatures and CRC
   constants are written the way the spec and every reference implementation
   write them, and oxfmt lowercases hex literals on save (see
   `server/reader/rail-rotation.ts` for the same conflict). */
import { inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildZip, crc32 } from "#/server/books/zip";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface ParsedEntry {
  name: string;
  method: number;
  flags: number;
  crc: number;
  content: string;
}

/**
 * Read the archive back through its local file headers.
 *
 * Deliberately not using a zip library: the point of these tests is that the
 * bytes are a correct archive, and a parser sharing code with the writer would
 * agree with it about any mistake they both made.
 */
function parseZip(bytes: Uint8Array): Array<ParsedEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: Array<ParsedEntry> = [];
  let at = 0;

  while (at + 4 <= bytes.length && view.getUint32(at, true) === 0x04_03_4b_50) {
    const flags = view.getUint16(at + 6, true);
    const method = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 14, true);
    const compressedSize = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const nameAt = at + 30;
    const dataAt = nameAt + nameLength + extraLength;
    const body = bytes.subarray(dataAt, dataAt + compressedSize);

    entries.push({
      content: decoder.decode(method === 0 ? body : inflateRawSync(body)),
      crc,
      flags,
      method,
      name: decoder.decode(bytes.subarray(nameAt, nameAt + nameLength)),
    });
    at = dataAt + compressedSize;
  }
  return entries;
}

describe("crc32", () => {
  it("matches the reference value for a known input", () => {
    // The canonical CRC-32 of "123456789".
    expect(crc32(encoder.encode("123456789"))).toBe(0xcb_f4_39_26);
  });

  it("is zero for empty input", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("buildZip", () => {
  it("preserves entry order and round-trips content", () => {
    const zip = buildZip([
      { data: encoder.encode("first"), name: "a.txt" },
      { data: encoder.encode("second"), name: "nested/b.txt" },
    ]);

    const entries = parseZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual([
      "a.txt",
      "nested/b.txt",
    ]);
    expect(entries.map((entry) => entry.content)).toEqual(["first", "second"]);
  });

  it("stores an entry verbatim when asked, whatever its content", () => {
    // EPUB requires `mimetype` to be the first entry and STORED, so a reader
    // can identify the file from its first bytes without inflating anything.
    const zip = buildZip([
      {
        data: encoder.encode("application/epub+zip"),
        method: "store",
        name: "mimetype",
      },
    ]);

    const [entry] = parseZip(zip);
    expect(entry?.method).toBe(0);
    expect(entry?.content).toBe("application/epub+zip");
    // The literal bytes appear right after the 30-byte header plus the name.
    expect(decoder.decode(zip.subarray(38, 58))).toBe("application/epub+zip");
  });

  it("deflates compressible content", () => {
    const zip = buildZip([
      { data: encoder.encode("ab".repeat(2000)), name: "big.txt" },
    ]);

    const [entry] = parseZip(zip);
    expect(entry?.method).toBe(8);
    expect(entry?.content).toBe("ab".repeat(2000));
    expect(zip.length).toBeLessThan(1000);
  });

  it("falls back to storing when deflate would grow the entry", () => {
    // Incompressible bytes come back from deflate with framing overhead.
    const random = new Uint8Array(64);
    for (let index = 0; index < random.length; index += 1) {
      random[index] = (index * 37 + 11) % 256;
    }
    const zip = buildZip([{ data: random, name: "noise.bin" }]);
    expect(parseZip(zip)[0]?.method).toBe(0);
  });

  it("marks filenames as UTF-8 and round-trips non-ASCII names", () => {
    const zip = buildZip([
      { data: encoder.encode("x"), name: "café/naïve.txt" },
    ]);
    const [entry] = parseZip(zip);
    expect(entry?.name).toBe("café/naïve.txt");
    expect(entry?.flags & 0x08_00).toBe(0x08_00);
  });

  it("is byte-identical across builds", () => {
    // Nothing in the writer reads the clock — this is what makes ETags stable
    // across replicas and lets kosync precompute a file's hash.
    const build = () =>
      buildZip([
        { data: encoder.encode("mimetype"), method: "store", name: "mimetype" },
        { data: encoder.encode("<x/>"), name: "META-INF/container.xml" },
      ]);
    expect(Buffer.from(build())).toEqual(Buffer.from(build()));
  });

  it("records a CRC over the uncompressed bytes", () => {
    const data = encoder.encode("ab".repeat(2000));
    const [entry] = parseZip(buildZip([{ data, name: "big.txt" }]));
    expect(entry?.crc).toBe(crc32(data));
  });

  it("writes a central directory covering every entry", () => {
    const zip = buildZip([
      { data: encoder.encode("one"), name: "1.txt" },
      { data: encoder.encode("two"), name: "2.txt" },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

    // The end-of-central-directory record is the last 22 bytes (no comment).
    const eocdAt = zip.length - 22;
    expect(view.getUint32(eocdAt, true)).toBe(0x06_05_4b_50);
    expect(view.getUint16(eocdAt + 8, true)).toBe(2);
    expect(view.getUint16(eocdAt + 10, true)).toBe(2);

    const centralOffset = view.getUint32(eocdAt + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02_01_4b_50);
  });
});

/* eslint-enable unicorn/number-literal-case */
