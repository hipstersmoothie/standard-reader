import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";

import { and, eq, or, sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { ingestState, subscriptions, trackedRepos } from "../../db/schema.ts";
import { startLabelerDiscovery } from "../labeler/discover.server.ts";
import { startLabelSync } from "../labeler/sync.server.ts";
import { logEvent } from "../observability/log.ts";
import { verifyIngestAuth } from "./auth.ts";
import { ingestConfig } from "./config.ts";
import { backfillSubscriptionsFromRepo } from "./handlers.ts";
import { startJetstreamChannel } from "./jetstream-channel.ts";
import { startProfileRefresh } from "./profile-refresh.ts";
import { recomputeDerived } from "./recompute.ts";
import {
  markRepoGone,
  reconcilePublisherReposBatch,
  reconcileRepoFromPds,
} from "./repo-sync.ts";

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

/**
 * Backfill subscriptions for reader repos that have none indexed.
 *
 * This used to also push every unregistered repo to tap's `/repos/add` — the
 * half that mattered for coverage, since an unregistered repo simply never
 * streamed. Jetstream needs no registration, so only the repair half is left:
 * a reader whose subscription records predate our first sight of them still
 * needs one pull from their PDS to seed the graph.
 */
async function backfillReaderSubscriptions(): Promise<{
  backfilled: Array<{ did: string; subscriptions: number }>;
}> {
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

  return { backfilled };
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
      const result = await backfillReaderSubscriptions();
      const ms = Math.round(performance.now() - startedAt);
      logEvent("ingest.reconcileTracked", {
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
        goneMarked: result.goneMarked,
        migrated: result.migrated,
        ms,
        ok: true,
        prunedDocuments: result.prunedDocuments,
        prunedPublications: result.prunedPublications,
        webBridgeAttempted: result.webBridgeAttempted,
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
      // If the PDS reports the repo is permanently gone, prune its read-model
      // rows + retire the tracked repo (same as the batch path). Manual
      // reconcile otherwise returns gone=true without cleaning up.
      if (result.gone) {
        const pruned = await markRepoGone(body.did);
        Object.assign(result, {
          prunedDocuments: pruned.documents,
          prunedPublications: pruned.publications,
        });
      }
      const ms = Math.round(performance.now() - startedAt);
      logEvent("ingest.reconcileRepo", {
        gone: result.gone ?? false,
        migrated: result.migrated ?? false,
        migratedFrom: result.migratedFrom,
        migratedTo: result.migratedTo,
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
  if (!ingestConfig.webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[ingest] FATAL: no INGEST_WEBHOOK_SECRET set in production — " +
          "ingest auth is disabled and all requests are rejected.",
      );
    } else {
      console.warn(
        "[ingest] WARNING: no INGEST_WEBHOOK_SECRET set — " +
          "ingest auth is disabled (dev-only).",
      );
    }
  }
});

// One Jetstream subscription, where there used to be three tap lanes plus the
// admin API that fed them. Its collection filter already spans every repo on
// the network that writes one of our records, so there is nothing to signal,
// seed, register, or split.
const jetstreamChannel = startJetstreamChannel();
// Profiles and handles are pulled rather than streamed: Jetstream carries
// neither `app.bsky.actor.profile` nor `#identity` for our actors at a volume
// worth taking network-wide (see `profile-refresh.ts`).
const profileRefresh = startProfileRefresh();
// The PDS repair round-robin deliberately does *not* run here — it is its own
// cron service (`scripts/reconcile-repos-cron.ts`). Repair enumerates and
// rewrites whole repos, and running that beside the live channel made the
// backstop compete with the stream it backstops.
const labelSync = startLabelSync();
const labelerDiscovery = startLabelerDiscovery();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(async () => {
      profileRefresh.stop();
      labelSync.stop();
      labelerDiscovery.stop();
      await jetstreamChannel.destroy();
      const { flushTelemetry } = await import("../observability/log.ts");
      await flushTelemetry();
      process.exit(0);
    });
  });
}
