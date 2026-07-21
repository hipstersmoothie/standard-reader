const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** UTF-8 byte length of a JS string (AT Proto facet indices are byte offsets). */
export function utf8ByteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

/** Slice a JS string by UTF-8 byte offsets (AT Proto facet indices). */
export function sliceUtf8(
  text: string,
  byteStart: number,
  byteEnd: number,
): string {
  const bytes = encoder.encode(text);
  return decoder.decode(bytes.subarray(byteStart, byteEnd));
}
