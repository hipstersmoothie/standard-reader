import type { IncomingMessage, ServerResponse } from "node:http";

import { Tap } from "@atproto/tap";
import { and, eq, or, sql } from "drizzle-orm";
import { createServer } from "node:http";

import type { TapEvent } from "../atproto/types.ts";
import type { ProcessResult } from "./consumer.ts";

import { db } from "../../db/index.ts";
import { ingestState, subscriptions, trackedRepos } from "../../db/schema.ts";
import { startLabelSync } from "../labeler/sync.server.ts";
import { logEvent } from "../observability/log.ts";
import { verifyIngestAuth } from "./auth.ts";
import { ingestConfig } from "./config.ts";
import { processTapEvent } from "./consumer.ts";
import { backfillSubscriptionsFromRepo } from "./handlers.ts";
import { recomputeDerived } from "./recompute.ts";
import {
  reconcilePublisherReposBatch,
  reconcileRepoFromPds,
  startPublisherRepoReconcile,
} from "./repo-sync.ts";
import {
  reconcilePendingTrackedRepos,
  startPendingTrackedReconcile,
} from "./tap-client.ts";

const DEFAULT_PORT = 3099;

function port(): number {
  const value = Number(process.env.INGEST_PORT);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PORT;
}

function authRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return new Request(`http://localhost${req.url ?? "/"}`, {
    headers,
    method: req.method,
  });
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json",
  });
  res.end(payload);
}

function sendText(res: ServerResponse, statusCode: number, body: string): void {
  res.writeHead(statusCode, {
    "content-length": Buffer.byteLength(body),
    "content-type": "text/plain; charset=utf8",
  });
  res.end(body);
}

async function getStatus(): Promise<Record<string, unknown>> {
  const [state] = await db.select().from(ingestState);
  const counts = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM publications WHERE deleted = false) AS publications,
      (SELECT count(*) FROM documents WHERE deleted = false) AS documents,
      (SELECT count(*) FROM subscriptions WHERE deleted = false) AS subscriptions,
      (SELECT count(*) FROM recommends WHERE deleted = false) AS recommends,
      (SELECT count(*) FROM profiles) AS profiles,
      (SELECT count(*) FROM tracked_repos) AS tracked_repos,
      (SELECT count(*) FROM ingest_dead_letter) AS dead_letter
  `);
  return {
    counts: counts.rows[0] ?? null,
    stream: state ?? null,
  };
}

async function reconcileTrackedWithBackfill(): Promise<{
  added: number;
  addedDids: Array<string>;
  attempted: number;
  backfilled: Array<{ did: string; subscriptions: number }>;
}> {
  const result = await reconcilePendingTrackedRepos();

  const readerRepos = await db
    .select({ did: trackedRepos.did })
    .from(trackedRepos)
    .where(
      or(
        eq(trackedRepos.reason, "reader"),
        eq(trackedRepos.reason, "subscriber"),
      ),
    );

  const backfilled: Array<{ did: string; subscriptions: number }> = [];
  for (const row of readerRepos) {
    const [countRow] = await db
      .select({
        count: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.subscriberDid, row.did),
          eq(subscriptions.deleted, false),
        ),
      );
    if ((countRow?.count ?? 0) > 0) {
      continue;
    }
    const synced = await backfillSubscriptionsFromRepo(row.did);
    if (synced > 0) {
      backfilled.push({ did: row.did, subscriptions: synced });
    }
  }

  if (backfilled.length > 0) {
    logEvent("ingest.backfillSubscriptions", {
      backfilled: backfilled.length,
      ok: true,
      subscriptions: backfilled.reduce(
        (sum, row) => sum + row.subscriptions,
        0,
      ),
    });
  }

  return { ...result, backfilled };
}

function requireAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (verifyIngestAuth(authRequest(req))) {
    return true;
  }
  res.setHeader("WWW-Authenticate", 'Basic realm="ingest"');
  sendText(res, 401, "Unauthorized");
  return false;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/ingest/status" && req.method === "GET") {
    if (!requireAuth(req, res)) {
      return;
    }
    sendJson(res, 200, await getStatus());
    return;
  }

  if (url.pathname === "/api/ingest/recompute" && req.method === "POST") {
    if (!requireAuth(req, res)) {
      return;
    }
    const startedAt = performance.now();
    try {
      await recomputeDerived();
      const ms = Math.round(performance.now() - startedAt);
      logEvent("ingest.recompute", { ok: true, ms });
      sendJson(res, 200, { durationMs: ms, ok: true });
    } catch (error: unknown) {
      const ms = Math.round(performance.now() - startedAt);
      logEvent("ingest.recompute", {
        error: error instanceof Error ? error.message : String(error),
        ms,
        ok: false,
      });
      throw error;
    }
    return;
  }

  if (
    url.pathname === "/api/ingest/reconcile-tracked" &&
    req.method === "POST"
  ) {
    if (!requireAuth(req, res)) {
      return;
    }
    const startedAt = performance.now();
    try {
      const result = await reconcileTrackedWithBackfill();
      const ms = Math.round(performance.now() - startedAt);
      logEvent("ingest.reconcileTracked", {
        added: result.added,
        attempted: result.attempted,
        backfilledRepos: result.backfilled.length,
        ms,
        ok: true,
        subscriptions: result.backfilled.reduce(
          (sum, row) => sum + row.subscriptions,
          0,
        ),
      });
      sendJson(res, 200, { durationMs: ms, ok: true, ...result });
    } catch (error: unknown) {
      const ms = Math.round(performance.now() - startedAt);
      logEvent("ingest.reconcileTracked", {
        error: error instanceof Error ? error.message : String(error),
        ms,
        ok: false,
      });
      throw error;
    }
    return;
  }

  if (url.pathname === "/api/ingest/reconcile-repos" && req.method === "POST") {
    if (!requireAuth(req, res)) {
      return;
    }
    const startedAt = performance.now();
    try {
      const result = await reconcilePublisherReposBatch();
      const ms = Math.round(performance.now() - startedAt);
      logEvent("ingest.reconcileRepos", {
        attempted: result.attempted,
        ms,
        ok: true,
        prunedDocuments: result.prunedDocuments,
        prunedPublications: result.prunedPublications,
      });
      sendJson(res, 200, { durationMs: ms, ok: true, ...result });
    } catch (error: unknown) {
      const ms = Math.round(performance.now() - startedAt);
      logEvent("ingest.reconcileRepos", {
        error: error instanceof Error ? error.message : String(error),
        ms,
        ok: false,
      });
      throw error;
    }
    return;
  }

  if (url.pathname === "/api/ingest/reconcile-repo" && req.method === "POST") {
    if (!requireAuth(req, res)) {
      return;
    }
    const chunks: Array<Buffer> = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as {
      did?: string;
    };
    if (!body.did?.startsWith("did:")) {
      sendJson(res, 400, { error: "did required" });
      return;
    }
    const startedAt = performance.now();
    try {
      const result = await reconcileRepoFromPds(body.did, { upsert: true });
      const ms = Math.round(performance.now() - startedAt);
      logEvent("ingest.reconcileRepo", {
        ms,
        ok: true,
        prunedDocuments: result.prunedDocuments,
        prunedPublications: result.prunedPublications,
        did: body.did,
      });
      sendJson(res, 200, { durationMs: ms, ok: true, ...result });
    } catch (error: unknown) {
      const ms = Math.round(performance.now() - startedAt);
      logEvent("ingest.reconcileRepo", {
        did: body.did,
        error: error instanceof Error ? error.message : String(error),
        ms,
        ok: false,
      });
      throw error;
    }
    return;
  }

  sendText(res, 404, "Not Found");
}

function fromRecordEvent(evt: {
  id: number;
  live: boolean;
  rev: string;
  did: string;
  collection: string;
  rkey: string;
  action: "create" | "update" | "delete";
  cid?: string;
  record?: Record<string, unknown>;
}): TapEvent {
  return {
    id: evt.id,
    record: {
      action: evt.action,
      cid: evt.cid,
      collection: evt.collection,
      did: evt.did,
      live: evt.live,
      record: evt.record,
      rev: evt.rev,
      rkey: evt.rkey,
    },
    type: "record",
  };
}

function fromIdentityEvent(evt: {
  id: number;
  did: string;
  handle?: string;
  isActive?: boolean;
  status?: string;
}): TapEvent {
  return {
    id: evt.id,
    identity: {
      did: evt.did,
      handle: evt.handle,
      isActive: evt.isActive,
      status: evt.status,
    },
    type: "identity",
  };
}

function startTapChannel(tapUrl: string): { destroy: () => Promise<void> } {
  const tap = new Tap(tapUrl, {
    adminPassword: ingestConfig.tapAdminPassword ?? undefined,
  });
  // --- Diagnostics: track channel delivery so we can see exactly what tap
  // sends, what we apply, and whether the stream stalls or the WS reconnects.
  const stats = {
    identity: 0,
    record: 0,
    failed: 0,
    errors: 0,
    acked: 0,
    ackTimeouts: 0,
    inflight: 0,
    lastEventId: 0,
    lastEventAt: 0,
    startedAt: Date.now(),
  };

  // Bounded concurrency: the per-event DB work is a chain of round-trips to
  // Neon, so processing events strictly one-at-a-time leaves the connection
  // idle waiting on latency. We let up to INGEST_CONCURRENCY events apply in
  // parallel (each on its own pooled pg connection) and backpressure tap when
  // the pool is full, so the read loop stays fed without unbounded buffering.
  // Upserts are idempotent and keyed by URI, so out-of-order application across
  // distinct records is safe; same-URI reordering is a non-issue during a
  // create-only backfill.
  const MAX_INFLIGHT = (() => {
    const v = Number(process.env.INGEST_CONCURRENCY);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 12;
  })();
  const waiters: Array<() => void> = [];
  function acquireSlot(): Promise<void> {
    if (stats.inflight < MAX_INFLIGHT) {
      stats.inflight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiters.push(resolve));
  }
  function releaseSlot(): void {
    const next = waiters.shift();
    if (next) {
      next(); // hand the slot directly to a waiter (inflight unchanged)
    } else {
      stats.inflight -= 1;
    }
  }

  // The tap channel awaits `onEvent` (handler + ack) sequentially inside its WS
  // read loop, so awaiting the ack there is fatal: the SDK buffers an ack when
  // the socket looks disconnected and only flushes on reconnect, so a single
  // stuck `ws.send` deadlocks the loop and freezes all delivery (this was the
  // 223-event stall). Worse, breaking the deadlock with a timeout makes tap
  // reconnect and skip ahead, dropping the un-acked gap.
  //
  // Fix: never block the read loop on the ack. We upsert (idempotently) first,
  // then fire the ack in the background and return immediately, keeping the
  // socket drained so tap streams continuously without stalling or skipping. A
  // hung ack just dangles harmlessly; tap tolerates the missing ack and we
  // re-upsert safely on any redelivery. The timeout here is for diagnostics
  // only — it never gates delivery.
  const ACK_TIMEOUT_MS = 5000;
  function ackInBackground(id: number, ack: () => Promise<void>): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), ACK_TIMEOUT_MS);
    });
    void Promise.race([ack().then(() => "acked" as const), timeout])
      .then((result) => {
        if (result === "timeout") {
          stats.ackTimeouts += 1;
          console.warn(`[ingest] ack slow/stuck for event #${id} (>5s)`);
        } else {
          stats.acked += 1;
        }
      })
      .catch((error: unknown) => {
        stats.errors += 1;
        console.warn(`[ingest] ack failed for event #${id}`, error);
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  }

  // Custom handler (replaces SimpleIndexer) so we control + log the ack path.
  const indexer = {
    onError(error: unknown) {
      stats.errors += 1;
      console.error("[ingest] tap channel error", error);
    },
    async onEvent(
      evt: Record<string, unknown> & { id: number; type: string },
      opts: { ack: () => Promise<void>; signal: AbortSignal },
    ) {
      stats.lastEventId = evt.id;
      stats.lastEventAt = Date.now();
      const isIdentity = evt.type === "identity";
      if (isIdentity) {
        stats.identity += 1;
      } else {
        stats.record += 1;
      }

      // Acquire a slot before returning so the SDK read loop pauses (and tap
      // backpressures) once MAX_INFLIGHT events are in flight. The actual DB
      // work + ack run detached so up to MAX_INFLIGHT apply concurrently.
      await acquireSlot();
      void (async () => {
        // Default to "unhandled" so an unexpected throw withholds the ack and
        // tap redelivers, rather than silently dropping the event.
        let result: ProcessResult = "unhandled";
        try {
          const mapped = isIdentity
            ? fromIdentityEvent(
                evt as unknown as Parameters<typeof fromIdentityEvent>[0],
              )
            : fromRecordEvent(
                evt as unknown as Parameters<typeof fromRecordEvent>[0],
              );
          result = await processTapEvent(mapped);
          if (result === "dead-lettered") {
            stats.failed += 1;
            console.warn(`[ingest] dead-lettered event ${evt.id}`);
            logEvent("ingest.tapEvent", {
              collection:
                typeof evt.collection === "string" ? evt.collection : undefined,
              eventId: evt.id,
              eventType: evt.type,
              ok: false,
              result: "dead-lettered",
            });
          } else if (result === "unhandled") {
            stats.errors += 1;
            console.warn(
              `[ingest] event ${evt.id} unhandled (DB down/full) — not acking, tap will redeliver`,
            );
            logEvent("ingest.tapEvent", {
              collection:
                typeof evt.collection === "string" ? evt.collection : undefined,
              eventId: evt.id,
              eventType: evt.type,
              ok: false,
              result: "unhandled",
            });
          }
        } catch (error: unknown) {
          stats.errors += 1;
          console.error(`[ingest] failed to process event ${evt.id}`, error);
          logEvent("ingest.tapEvent", {
            collection:
              typeof evt.collection === "string" ? evt.collection : undefined,
            error: error instanceof Error ? error.message : String(error),
            eventId: evt.id,
            eventType: evt.type,
            ok: false,
            result: "error",
          });
        } finally {
          // Only ack once the event is durably handled (applied or
          // dead-lettered). Withholding the ack on "unhandled" leaves it for
          // tap to redeliver after the DB recovers. Always free the slot.
          if (result !== "unhandled") {
            ackInBackground(evt.id, opts.ack);
          }
          releaseSlot();
        }
      })();
    },
  };

  // Heartbeat: surface cumulative counts + idle time so a stalled stream is
  // obvious in logs (vs. having to diff the DB). Logs every 10s.
  const heartbeat = setInterval(() => {
    const idleMs =
      stats.lastEventAt === 0 ? -1 : Date.now() - stats.lastEventAt;
    console.info(
      `[ingest] channel heartbeat: identity=${stats.identity} record=${stats.record} acked=${stats.acked} ackTimeouts=${stats.ackTimeouts} failed=${stats.failed} errors=${stats.errors} inflight=${stats.inflight} lastEventId=${stats.lastEventId} idleMs=${idleMs}`,
    );
    logEvent("ingest.heartbeat", {
      ackTimeouts: stats.ackTimeouts,
      acked: stats.acked,
      errors: stats.errors,
      failed: stats.failed,
      identity: stats.identity,
      idleMs,
      inflight: stats.inflight,
      lastEventId: stats.lastEventId,
      ok: true,
      record: stats.record,
    });
  }, 10_000);
  heartbeat.unref?.();

  const channel = tap.channel(indexer);
  void channel.start().catch((error: unknown) => {
    console.error("[ingest] tap channel stopped", error);
    process.exitCode = 1;
  });
  console.info(`[ingest] connected to tap channel at ${tapUrl}`);
  return {
    destroy: async () => {
      clearInterval(heartbeat);
      await channel.destroy();
    },
  };
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error: unknown) => {
    console.error("[ingest] request failed", error);
    if (res.headersSent) {
      res.end();
      return;
    }
    sendText(res, 500, "Internal Server Error");
  });
});

// Bind to `::` (all IPv6 + IPv4 via dual-stack) so the service is reachable
// over Railway's IPv6-only private network (`*.railway.internal`).
server.listen(port(), "::", () => {
  console.info(`[ingest] listening on [::]:${port()}`);
});

// Primary signal (publishers) + an optional second tap instance signaled on
// `app.standard-reader.labeler.service`, so any repo that registers a labeler is
// tracked and its record indexed — no manual repo tracking needed.
const tapChannel = startTapChannel(
  ingestConfig.tapApiUrl ?? "http://127.0.0.1:2480",
);
const labelerTapChannel = ingestConfig.tapLabelerApiUrl
  ? startTapChannel(ingestConfig.tapLabelerApiUrl)
  : null;
const pendingTrackedReconcile = startPendingTrackedReconcile(
  reconcileTrackedWithBackfill,
);
const publisherRepoReconcile = startPublisherRepoReconcile();
const labelSync = startLabelSync();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(async () => {
      pendingTrackedReconcile.stop();
      publisherRepoReconcile.stop();
      labelSync.stop();
      await tapChannel.destroy();
      await labelerTapChannel?.destroy();
      const { flushHoneycomb } = await import("../observability/honeycomb.ts");
      await flushHoneycomb();
      process.exit(0);
    });
  });
}
