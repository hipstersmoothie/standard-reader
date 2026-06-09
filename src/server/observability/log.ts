/**
 * Lightweight, dependency-free observability for server functions.
 *
 * Emits one structured JSON line per event to stdout (`evt`, `ok`, `ms`, plus
 * any attributes). When `HONEYCOMB_API_KEY` is set, the same events are also
 * batched to Honeycomb (`src/server/observability/honeycomb.ts`). `observe()`
 * wraps a server-fn handler to time it and record success/failure; attach
 * domain attributes (did, subject, …) via the `span` it passes in.
 */

import { enqueueHoneycombEvent } from "./honeycomb.ts";

export type LogValue = string | number | boolean | null | undefined;
export type LogAttrs = Record<string, LogValue>;

function clean(attrs: LogAttrs | undefined): LogAttrs {
  if (!attrs) {
    return {};
  }
  const out: LogAttrs = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/** Emit a single structured event line. */
export function logEvent(name: string, attrs?: LogAttrs): void {
  const ts = new Date().toISOString();
  const line = {
    ts,
    evt: name,
    ...clean(attrs),
  };
  console.info(JSON.stringify(line));
  enqueueHoneycombEvent(name, attrs, ts);
}

/** A handle for attaching attributes to the in-flight observed call. */
export interface Span {
  set(key: string, value: LogValue): void;
  setAll(attrs: LogAttrs): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Wrap a server-fn handler so each invocation logs its name, duration, and
 * outcome. Returns the same shape TanStack `.handler()` expects.
 *
 * @example
 * .handler(observe("reader.followPublication", async ({ data }, span) => {
 *   span.set("publicationUri", data.publicationUri);
 *   // …
 * }))
 */
export function observe<Args, Result>(
  name: string,
  fn: (args: Args, span: Span) => Promise<Result>,
): (args: Args) => Promise<Result> {
  return async (args: Args) => {
    const start = performance.now();
    const attrs: LogAttrs = {};
    const span: Span = {
      set(key, value) {
        attrs[key] = value;
      },
      setAll(next) {
        Object.assign(attrs, next);
      },
    };

    try {
      const result = await fn(args, span);
      logEvent(name, {
        ...attrs,
        ok: true,
        ms: Math.round(performance.now() - start),
      });
      return result;
    } catch (error) {
      logEvent(name, {
        ...attrs,
        ok: false,
        ms: Math.round(performance.now() - start),
        error: errorMessage(error),
      });
      throw error;
    }
  };
}
