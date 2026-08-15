import { facetsInByteRange } from "./facets.js";
import type { LeafletFacet } from "./types.js";
import { utf8ByteLength } from "./utf8.js";

export interface PlaintextParagraph {
  kind: "paragraph" | "blockquote";
  plaintext: string;
  facets?: Array<LeafletFacet>;
}

const BLANK_LINE = /\n[ \t]*\n+/g;
const BLOCKQUOTE_PREFIX = /^>[ \t]?/;

/**
 * Some Leaflet-content producers (e.g. Skyreader linkblogs) stuff raw
 * markdown -- blank-line-separated paragraphs, "> " blockquotes -- into a
 * single `text`/`blockquote` block's `plaintext` instead of using Leaflet's
 * structured blocks. Leaflet's own blocks never contain a blank line, so
 * splitting on one is safe for genuine Leaflet content (a no-op, since it
 * returns the single original paragraph) while recovering paragraph and
 * blockquote structure for markdown stuffed into plaintext.
 *
 * Facet byte ranges are reindexed onto each split segment; a facet that
 * doesn't fall entirely within one segment is dropped rather than corrupted.
 */
export function splitMarkdownishPlaintext(
  plaintext: string,
  facets: Array<LeafletFacet> | undefined,
): Array<PlaintextParagraph> {
  const chunks = chunkByBlankLine(plaintext);
  if (chunks.length <= 1) {
    return [{ kind: "paragraph", plaintext, facets }];
  }

  return chunks.map(({ text, byteStart, byteEnd }) => {
    const quote = BLOCKQUOTE_PREFIX.exec(text);
    if (!quote) {
      return {
        kind: "paragraph",
        plaintext: text,
        facets: facetsInByteRange(facets, byteStart, byteEnd),
      };
    }

    const prefixByteLength = utf8ByteLength(quote[0]);
    return {
      kind: "blockquote",
      plaintext: text.slice(quote[0].length),
      // `facetsInByteRange` already reindexes onto `byteStart + prefixByteLength`,
      // which is exactly the start of the stripped plaintext above.
      facets: facetsInByteRange(facets, byteStart + prefixByteLength, byteEnd),
    };
  });
}

interface PlaintextChunk {
  text: string;
  byteStart: number;
  byteEnd: number;
}

/** Split plaintext on blank lines into trimmed, non-empty chunks with byte ranges. */
function chunkByBlankLine(plaintext: string): Array<PlaintextChunk> {
  const chunks: Array<PlaintextChunk> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  BLANK_LINE.lastIndex = 0;
  while ((match = BLANK_LINE.exec(plaintext))) {
    pushTrimmedChunk(chunks, plaintext, cursor, match.index);
    cursor = match.index + match[0].length;
  }
  pushTrimmedChunk(chunks, plaintext, cursor, plaintext.length);

  return chunks;
}

function pushTrimmedChunk(
  chunks: Array<PlaintextChunk>,
  plaintext: string,
  start: number,
  end: number,
): void {
  const raw = plaintext.slice(start, end);
  const trimmed = raw.trim();
  if (trimmed.length === 0) return;

  const leadingWhitespace = raw.length - raw.trimStart().length;
  const charStart = start + leadingWhitespace;
  const charEnd = charStart + trimmed.length;
  chunks.push({
    text: trimmed,
    byteStart: utf8ByteLength(plaintext.slice(0, charStart)),
    byteEnd: utf8ByteLength(plaintext.slice(0, charEnd)),
  });
}
