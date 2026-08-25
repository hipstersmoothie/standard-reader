/**
 * A minimal, deterministic ZIP writer — the container both EPUB and CBZ are.
 *
 * Hand-rolled for the same reason `lib/feeds/rss.ts` builds XML by hand: the
 * format we need is small, the dependency would be large, and we need control a
 * general-purpose library does not give us:
 *
 *  - **EPUB's first-entry rule.** `mimetype` must be the first entry, STORED
 *    (never deflated), with no extra field, so a reader can sniff the format
 *    from the first bytes of the file. {@link buildZip} writes entries in the
 *    order given and takes the method per entry.
 *  - **Determinism.** Every timestamp is the DOS epoch and nothing else varies,
 *    so the same document always produces byte-identical output. That is what
 *    makes `ETag`s stable across replicas — and what lets kosync precompute a
 *    file's partial MD5 without having served that exact file before (see
 *    `server/kosync/document-hash.ts`).
 */

/* eslint-disable unicorn/number-literal-case -- ZIP signatures and CRC
   constants are written the way the spec and every reference implementation
   write them, and oxfmt lowercases hex literals on save (see
   `server/reader/rail-rotation.ts` for the same conflict). */

import { deflateRawSync } from "node:zlib";

/** DOS epoch (1980-01-01 00:00) — the earliest a ZIP timestamp can express. */
const DOS_DATE = 0x00_21;
const DOS_TIME = 0x00_00;

/** General-purpose flag bit 11: filenames and comments are UTF-8. */
const FLAG_UTF8 = 0x08_00;

const SIG_LOCAL = 0x04_03_4b_50;
const SIG_CENTRAL = 0x02_01_4b_50;
const SIG_EOCD = 0x06_05_4b_50;

export interface ZipEntry {
  /** Path inside the archive, `/`-separated, no leading slash. */
  name: string;
  data: Uint8Array;
  /**
   * `"store"` writes the bytes verbatim. Required for EPUB's `mimetype`, and
   * the honest choice for already-compressed payloads (JPEG/PNG/WebP pages),
   * where deflate spends CPU to add bytes.
   */
  method?: "deflate" | "store";
}

let crcTable: Uint32Array | null = null;

function crc32Table(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
    }
    // `>>> 0` for the unsigned coercion, not for truncation — `Math.trunc`
    // would leave the sign bit set and every CRC above 2^31 wrong.
    // eslint-disable-next-line unicorn/prefer-math-trunc -- unsigned coercion
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(data: Uint8Array): number {
  const table = crc32Table();
  let crc = 0xff_ff_ff_ff;
  for (const byte of data) {
    crc = (table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  // eslint-disable-next-line unicorn/prefer-math-trunc -- unsigned coercion
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

/** A growable little-endian byte sink — every ZIP field is little-endian. */
class ByteSink {
  private readonly chunks: Array<Uint8Array> = [];
  private length = 0;

  get offset(): number {
    return this.length;
  }

  push(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  u16(value: number): void {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    this.push(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ]),
    );
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }
}

interface PreparedEntry {
  nameBytes: Uint8Array;
  body: Uint8Array;
  crc: number;
  uncompressedSize: number;
  compressionMethod: number;
  localOffset: number;
}

/**
 * Build a ZIP archive from `entries`, in order. Entries are never reordered —
 * the caller owns the order, because EPUB depends on it.
 */
export function buildZip(entries: Array<ZipEntry>): Uint8Array {
  const encoder = new TextEncoder();
  const sink = new ByteSink();
  const prepared: Array<PreparedEntry> = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const deflated =
      entry.method === "store"
        ? null
        : new Uint8Array(deflateRawSync(entry.data, { level: 9 }));
    // Deflate can inflate: incompressible bytes come back with overhead. Store
    // those instead of paying for a bigger file.
    const useStore = deflated === null || deflated.length >= entry.data.length;
    const body = useStore ? entry.data : deflated;

    const record: PreparedEntry = {
      body,
      compressionMethod: useStore ? 0 : 8,
      crc: crc32(entry.data),
      localOffset: sink.offset,
      nameBytes,
      uncompressedSize: entry.data.length,
    };
    prepared.push(record);

    sink.u32(SIG_LOCAL);
    sink.u16(20); // version needed to extract (2.0 — deflate)
    sink.u16(FLAG_UTF8);
    sink.u16(record.compressionMethod);
    sink.u16(DOS_TIME);
    sink.u16(DOS_DATE);
    sink.u32(record.crc);
    sink.u32(body.length);
    sink.u32(record.uncompressedSize);
    sink.u16(nameBytes.length);
    sink.u16(0); // extra field length — EPUB forbids one on `mimetype`
    sink.push(nameBytes);
    sink.push(body);
  }

  const centralOffset = sink.offset;
  for (const record of prepared) {
    sink.u32(SIG_CENTRAL);
    sink.u16(20); // version made by
    sink.u16(20); // version needed to extract
    sink.u16(FLAG_UTF8);
    sink.u16(record.compressionMethod);
    sink.u16(DOS_TIME);
    sink.u16(DOS_DATE);
    sink.u32(record.crc);
    sink.u32(record.body.length);
    sink.u32(record.uncompressedSize);
    sink.u16(record.nameBytes.length);
    sink.u16(0); // extra field length
    sink.u16(0); // file comment length
    sink.u16(0); // disk number start
    sink.u16(0); // internal file attributes
    sink.u32(0); // external file attributes
    sink.u32(record.localOffset);
    sink.push(record.nameBytes);
  }
  const centralSize = sink.offset - centralOffset;

  sink.u32(SIG_EOCD);
  sink.u16(0); // this disk
  sink.u16(0); // disk holding the central directory
  sink.u16(prepared.length);
  sink.u16(prepared.length);
  sink.u32(centralSize);
  sink.u32(centralOffset);
  sink.u16(0); // archive comment length

  return sink.toBytes();
}

/* eslint-enable unicorn/number-literal-case */
