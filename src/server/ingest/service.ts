import type { IncomingMessage, ServerResponse } from "node:http";

import { SimpleIndexer, Tap } from "@atproto/tap";
import { sql } from "drizzle-orm";
import { createServer } from "node:http";

import type { TapEvent } from "../atproto/types.ts";

import { db } from "../../db/index.ts";
import { ingestState } from "../../db/schema.ts";
import { verifyIngestAuth } from "./auth.ts";
import { ingestConfig } from "./config.ts";
import { processTapEvent } from "./consumer.ts";
import { recomputeDerived } from "./recompute.ts";

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
    const startedAt = Date.now();
    await recomputeDerived();
    sendJson(res, 200, { durationMs: Date.now() - startedAt, ok: true });
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

function startTapChannel(): { destroy: () => Promise<void> } {
  const tapUrl = ingestConfig.tapApiUrl ?? "http://127.0.0.1:2480";
  const tap = new Tap(tapUrl, {
    adminPassword: ingestConfig.tapAdminPassword ?? undefined,
  });
  const indexer = new SimpleIndexer();

  indexer.identity(async (evt) => {
    const ok = await processTapEvent(fromIdentityEvent(evt));
    if (!ok) {
      console.warn(`[ingest] dead-lettered identity event ${evt.id}`);
    }
  });
  indexer.record(async (evt) => {
    const ok = await processTapEvent(fromRecordEvent(evt));
    if (!ok) {
      console.warn(`[ingest] dead-lettered record event ${evt.id}`);
    }
  });
  indexer.error((error) => {
    console.error("[ingest] tap channel error", error);
  });

  const channel = tap.channel(indexer);
  void channel.start().catch((error: unknown) => {
    console.error("[ingest] tap channel stopped", error);
    process.exitCode = 1;
  });
  console.info(`[ingest] connected to tap channel at ${tapUrl}`);
  return {
    destroy: () => channel.destroy(),
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

const tapChannel = startTapChannel();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await tapChannel.destroy();
      process.exit(0);
    });
  });
}
