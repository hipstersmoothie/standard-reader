/**
 * Observability for server functions, backed by OpenTelemetry.
 *
 * `observe()` wraps a server-fn handler in a real OTel span: it times the call,
 * records success/failure, and nests under whatever span is already active (the
 * auto-instrumented HTTP request, usually), so a request's database queries,
 * outbound fetches, and handlers all share one trace. Attach domain attributes
 * via the `span` it passes in.
 *
 * The SDK itself is started by `@opentelemetry/auto-instrumentations-node/register`
 * via the `--require` flag in the `start` script — there is no bootstrap code
 * here, and nothing to import for tracing to work. Configuration is entirely
 * environment variables (`OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
 * `OTEL_EXPORTER_OTLP_HEADERS`); with none set, the SDK is inert and this module
 * degrades to stdout-only.
 *
 * Every event is still mirrored as a structured JSON line to stdout, which is
 * what Railway's log view shows.
 */

import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { Attributes, Span as OtelSpan } from "@opentelemetry/api";

export type LogValue = string | number | boolean | null | undefined;
export type LogAttrs = Record<string, LogValue>;

const tracer = trace.getTracer("standard-reader");

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

/** OTel rejects `null`; drop those keys rather than sending "null" strings. */
function toOtelAttributes(attrs: LogAttrs): Attributes {
  const out: Attributes = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

function writeStdout(name: string, attrs: LogAttrs): void {
  console.info(
    JSON.stringify({ ts: new Date().toISOString(), evt: name, ...attrs }),
  );
}

/**
 * Emit a single structured event.
 *
 * Recorded as an event on the active span when there is one — so it lands in
 * the trace waterfall at the point it happened — and as a standalone span when
 * called outside any request (background jobs, ingest, startup).
 */
export function logEvent(name: string, attrs?: LogAttrs): void {
  const cleaned = clean(attrs);
  writeStdout(name, cleaned);

  const active = trace.getActiveSpan();
  if (active) {
    active.addEvent(name, toOtelAttributes(cleaned));
    return;
  }

  tracer.startActiveSpan(name, (span) => {
    span.setAttributes(toOtelAttributes(cleaned));
    span.end();
  });
}

/**
 * Force-export any buffered spans.
 *
 * The auto-instrumentation register hook flushes on SIGTERM by itself, so
 * long-lived servers that exit normally need not call this. It exists for
 * shutdown paths that call `process.exit()` explicitly and would otherwise cut
 * the SDK's own handler short (see `src/server/ingest/service.ts`).
 */
export async function flushTelemetry(): Promise<void> {
  const provider = trace.getTracerProvider() as {
    getDelegate?: () => { forceFlush?: () => Promise<void> };
    forceFlush?: () => Promise<void>;
  };
  const target = provider.getDelegate?.() ?? provider;

  try {
    await target.forceFlush?.();
  } catch (error: unknown) {
    console.error("[otel] flush failed", error);
  }
}

/** A handle for attaching attributes to the in-flight observed call. */
export interface Span {
  set(key: string, value: LogValue): void;
  setAll(attrs: LogAttrs): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Wrap the live OTel span in the narrower `Span` surface call sites expect. */
function spanHandle(otel: OtelSpan, mirror: LogAttrs): Span {
  return {
    set(key, value) {
      mirror[key] = value;
      if (value !== undefined && value !== null) {
        otel.setAttribute(key, value);
      }
    },
    setAll(next) {
      Object.assign(mirror, next);
      otel.setAttributes(toOtelAttributes(next));
    },
  };
}

/**
 * Wrap a server-fn handler so each invocation becomes a span carrying its name,
 * duration, and outcome. Returns the same shape TanStack `.handler()` expects.
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
  return async (args: Args) =>
    tracer.startActiveSpan(name, async (otel) => {
      const start = performance.now();
      // Mirrors what was set on the span so the stdout line stays as rich as
      // the trace; OTel spans are write-only once ended.
      const mirror: LogAttrs = {};

      try {
        const result = await fn(args, spanHandle(otel, mirror));
        const ms = Math.round(performance.now() - start);
        otel.setAttributes({ ok: true, ms });
        writeStdout(name, { ...mirror, ok: true, ms });
        return result;
      } catch (error) {
        const ms = Math.round(performance.now() - start);
        const message = errorMessage(error);
        otel.setAttributes({ ok: false, ms, error: message });
        otel.setStatus({ code: SpanStatusCode.ERROR, message });
        if (error instanceof Error) {
          otel.recordException(error);
        }
        writeStdout(name, { ...mirror, ok: false, ms, error: message });
        throw error;
      } finally {
        otel.end();
      }
    });
}
