/**
 * Safari (macOS + iOS) lacks `ReadableStream.prototype[Symbol.asyncIterator]`.
 * phonemizer.js decompresses its eSpeak dictionary with:
 *   `for await (const chunk of blob.stream().pipeThrough(new DecompressionStream("gzip")))`
 * which throws "undefined is not a function (near '...A of e...')" and blocks Listen.
 *
 * @see https://github.com/xenova/phonemizer.js/issues/2
 * @see https://github.com/xenova/phonemizer.js/pull/4
 */
export function ensureReadableStreamAsyncIterator(): void {
  if (typeof ReadableStream === "undefined") return;
  if (ReadableStream.prototype[Symbol.asyncIterator]) return;

  // Async-iterable streams are a web-platform feature Safari omitted.
  // @ts-expect-error Safari polyfill — AsyncGenerator is compatible at runtime.
  ReadableStream.prototype[Symbol.asyncIterator] = async function* (
    this: ReadableStream,
  ) {
    const reader = this.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

ensureReadableStreamAsyncIterator();
