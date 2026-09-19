/**
 * Choosing a live Jetstream host, and waiting for one when none of them is.
 *
 * `JETSTREAM_SERVICE` used to name exactly one host, defaulted to `us-east`,
 * and was consumed as a bare string. On 2026-09-17 that host's load balancer
 * started answering `503 No server is available` to every request — archive
 * endpoints and the live tail alike. The channel halts and `process.exit(1)`s
 * on any upstream error by design (Railway restarts it at the stored cursor),
 * which is right for a blip and catastrophic for an outage: the worker
 * crash-looped every ~15s for a day, Railway's restart policy gave up, and the
 * service sat stopped for 29 hours. ~18k documents never landed, and we heard
 * about it from a reader whose post was missing, not from a monitor.
 *
 * So this module does the two things that were missing:
 *
 *  1. **More than one host.** `JETSTREAM_SERVICE` takes a comma-separated list
 *     and the first host that answers wins, so one region falling over costs a
 *     restart rather than an outage.
 *  2. **Waiting instead of exiting.** When no host is up, {@link
 *     resolveJetstreamService} backs off and keeps probing rather than letting
 *     the process die. Staying alive is the whole point: a process that exits
 *     is a process Railway eventually stops restarting, and a stopped ingest
 *     does not come back on its own when the upstream recovers.
 *
 * Note on cursors: hosts are probed in the configured order, so a recovered
 * first choice pulls the next restart back to it. Handlers are at-least-once
 * (see the note on `cursorStore` in `./jetstream-channel.ts`), so re-applying a
 * stretch of events after a switch is safe; put the host you actually want
 * first rather than relying on where a failover happened to leave you.
 */
import { logEvent } from "../observability/log.ts";

/** Hosts tried, in order, when `JETSTREAM_SERVICE` is unset. */
export const DEFAULT_JETSTREAM_SERVICES = [
  "https://jetstream.us-west.bsky.network",
  "https://jetstream.us-east.bsky.network",
];

/**
 * Probed endpoint. Any Jetstream host serves this; an unauthenticated `GET` at
 * a procedure is *expected* to fail, which is exactly what makes it a good
 * liveness probe — see {@link isHostUp}.
 */
const PROBE_PATH = "/xrpc/network.bsky.jetstream.planSnapshot";

const PROBE_TIMEOUT_MS = 5000;
const BACKOFF_START_MS = 5000;
const BACKOFF_MAX_MS = 60_000;

export interface ProbeOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Whether a probe response means "there is a Jetstream behind this hostname".
 *
 * Anything below 500 counts, including `401`, `404` and `405`: the probe is an
 * unauthenticated `GET` at a procedure, so a *healthy* host rejects it, and the
 * rejection is the proof. Only 5xx means the request reached a load balancer
 * with nothing behind it, which is precisely the shape of the outage this
 * module exists for.
 */
export function isHostUp(status: number): boolean {
  return status < 500;
}

/** Whether `service` currently has a Jetstream behind it. */
export async function probeJetstreamHost(
  service: string,
  options: ProbeOptions = {},
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const timer = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timer])
    : timer;

  try {
    const res = await fetchImpl(`${service}${PROBE_PATH}`, {
      method: "GET",
      signal,
    });
    return isHostUp(res.status);
  } catch {
    // A refused connection, a DNS failure or a timeout are all "not up".
    return false;
  }
}

/**
 * The first host in `candidates` that answers, or `null` when none does.
 *
 * Sequential on purpose: the common case is that the first host is fine, and
 * probing the rest only to throw the answers away would add nothing but load.
 */
export async function pickJetstreamService(
  candidates: Array<string>,
  options: ProbeOptions = {},
): Promise<string | null> {
  for (const service of candidates) {
    if (await probeJetstreamHost(service, options)) return service;
    logEvent("ingest.jetstreamHostDown", { ok: false, service });
    console.warn(
      `[ingest:jetstream] ${service} is not answering — trying next`,
    );
  }
  return null;
}

export interface ResolveOptions extends ProbeOptions {
  /** Backoff hook, injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Give up after this many rounds instead of waiting forever (tests). */
  maxRounds?: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

/**
 * Block until one of `candidates` is up, then return it.
 *
 * Does not give up. An ingest worker that exits because the upstream is down is
 * how we lost a day: Railway stops restarting a service that keeps failing, and
 * nothing then notices the recovery. Waiting here costs a paused stream —
 * which the cursor makes recoverable — instead of a stopped service, which is
 * not recoverable without a human.
 */
export async function resolveJetstreamService(
  candidates: Array<string>,
  options: ResolveOptions = {},
): Promise<string> {
  if (candidates.length === 0) {
    throw new Error("No Jetstream hosts configured (JETSTREAM_SERVICE).");
  }
  const sleep = options.sleep ?? defaultSleep;
  let delay = BACKOFF_START_MS;

  for (
    let round = 0;
    options.maxRounds === undefined || round < options.maxRounds;
    round++
  ) {
    const service = await pickJetstreamService(candidates, options);
    if (service) {
      if (round > 0) {
        console.info(`[ingest:jetstream] ${service} is back — resuming`);
      }
      return service;
    }
    console.error(
      `[ingest:jetstream] no host answering (${candidates.join(", ")}) — retrying in ${Math.round(delay / 1000)}s`,
    );
    logEvent("ingest.jetstreamNoHost", {
      candidates: candidates.join(","),
      delayMs: delay,
      ok: false,
      round,
    });
    await sleep(delay);
    delay = Math.min(delay * 2, BACKOFF_MAX_MS);
  }
  throw new Error(
    `No Jetstream host answered after ${options.maxRounds} rounds.`,
  );
}
