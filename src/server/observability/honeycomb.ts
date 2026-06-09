/**
 * Optional Honeycomb event sink for structured o11y lines.
 *
 * When `HONEYCOMB_API_KEY` is set, batches events to the Honeycomb Events API.
 * Railway has no log drain, so stdout alone does not reach Honeycomb — this
 * module is the production hook-up. Disabled automatically when the key is unset
 * (local dev stays stdout-only).
 */

import type { LogAttrs, LogValue } from "./log.ts";

const API_KEY = process.env.HONEYCOMB_API_KEY;
const DATASET = process.env.HONEYCOMB_DATASET ?? "standard-reader";
const API_HOST = process.env.HONEYCOMB_API_HOST ?? "https://api.honeycomb.io";

const MAX_BATCH = 100;
const FLUSH_INTERVAL_MS = 1000;

type HoneycombEvent = Record<string, LogValue> & {
  time: number;
};

const queue: Array<HoneycombEvent> = [];
let flushing = false;
let scheduled: ReturnType<typeof setTimeout> | undefined;

export function isHoneycombEnabled(): boolean {
  return Boolean(API_KEY);
}

function serviceName(): string {
  return (
    process.env.HONEYCOMB_SERVICE ??
    process.env.RAILWAY_SERVICE_NAME ??
    "standard-reader"
  );
}

/** Map a structured log line to a Honeycomb event payload. */
export function toHoneycombEvent(
  name: string,
  attrs: LogAttrs | undefined,
  ts: string,
): HoneycombEvent {
  const cleaned = { ...attrs };
  const data: Record<string, LogValue> = {
    name,
    "service.name": serviceName(),
  };

  if (cleaned.ms !== undefined) {
    data.duration_ms = cleaned.ms;
    delete cleaned.ms;
  }
  if (cleaned.ok !== undefined) {
    data.ok = cleaned.ok;
    delete cleaned.ok;
  }
  if (cleaned.error !== undefined) {
    data.error = cleaned.error;
    delete cleaned.error;
  }

  for (const [key, value] of Object.entries(cleaned)) {
    if (value !== undefined) {
      data[key] = value;
    }
  }

  return {
    ...data,
    time: Math.floor(new Date(ts).getTime() / 1000),
  };
}

export function enqueueHoneycombEvent(
  name: string,
  attrs?: LogAttrs,
  ts?: string,
): void {
  if (!API_KEY) {
    return;
  }

  const timestamp = ts ?? new Date().toISOString();
  queue.push(toHoneycombEvent(name, attrs, timestamp));

  if (queue.length >= MAX_BATCH) {
    void flushHoneycomb();
    return;
  }

  scheduleFlush();
}

async function sendEvent(apiKey: string, event: HoneycombEvent): Promise<void> {
  const response = await fetch(
    `${API_HOST}/1/events/${encodeURIComponent(DATASET)}`,
    {
      body: JSON.stringify(event),
      headers: {
        "Content-Type": "application/json",
        "X-Honeycomb-Team": apiKey,
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `[honeycomb] event send failed (${response.status}): ${body}`,
    );
  }
}

export async function flushHoneycomb(): Promise<void> {
  if (!API_KEY || queue.length === 0 || flushing) {
    return;
  }

  flushing = true;
  const apiKey = API_KEY;
  const batch = queue.splice(0, MAX_BATCH);

  try {
    await Promise.all(batch.map((event) => sendEvent(apiKey, event)));
  } catch (error: unknown) {
    console.error("[honeycomb] flush error", error);
  } finally {
    flushing = false;
    if (queue.length > 0) {
      scheduleFlush();
    }
  }
}

function scheduleFlush(): void {
  if (scheduled) {
    return;
  }

  scheduled = setTimeout(() => {
    scheduled = undefined;
    void flushHoneycomb();
  }, FLUSH_INTERVAL_MS);
  scheduled.unref?.();
}

if (API_KEY) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void flushHoneycomb();
    });
  }
}
