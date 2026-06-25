/**
 * The serving side: a tiny HTTP + WebSocket server that exposes everything a
 * labeler consumer needs.
 *
 *   GET  /.well-known/did.json                          DID document (did:web)
 *   GET  /xrpc/com.atproto.label.queryLabels            point-in-time label lookup
 *   GET  /xrpc/com.atproto.label.subscribeLabels        live label stream (WS)
 *   GET  /xrpc/app.standard-reader.labeler.getServices  this labeler's descriptor
 *   GET  /health
 *
 * There is no framework here on purpose — it's all Node `http` + `ws` so the
 * shape of a labeler stays legible.
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { Secp256k1Keypair } from "@atproto/crypto";
import * as dagCbor from "@ipld/dag-cbor";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";

import { config } from "./config.ts";
import { labelsAfter, latestSeq, queryLabels } from "./db.ts";
import type { LabelerDb, StoredLabel } from "./db.ts";
import { keypairMultikey } from "./sign.ts";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(json);
}

function xrpcError(
  res: ServerResponse,
  status: number,
  error: string,
  message: string,
): void {
  sendJson(res, status, { error, message });
}

function didDocument(multikey: string) {
  const did = config.labelerDid;
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/multikey/v1",
    ],
    id: did,
    // The key consumers use to verify the `sig` on every label we emit.
    verificationMethod: [
      {
        id: `${did}#atproto_label`,
        type: "Multikey",
        controller: did,
        publicKeyMultibase: multikey,
      },
    ],
    // Advertises this DID as a labeler, pointing at this very service.
    service: [
      {
        id: "#atproto_labeler",
        type: "AtprotoLabeler",
        serviceEndpoint: config.publicUrl,
      },
    ],
  };
}

/** Serialize a label for JSON XRPC: `bytes` becomes `{ $bytes: <base64> }`. */
function labelToJson(label: StoredLabel): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ver: label.ver,
    src: label.src,
    uri: label.uri,
    val: label.val,
    cts: label.cts,
    sig: { $bytes: Buffer.from(label.sig).toString("base64") },
  };
  if (label.cid) out.cid = label.cid;
  if (label.exp) out.exp = label.exp;
  if (label.neg) out.neg = true;
  return out;
}

/** Serialize a label for a dag-cbor firehose frame (`sig` stays raw bytes). */
function labelToCbor(label: StoredLabel): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ver: label.ver,
    src: label.src,
    uri: label.uri,
    val: label.val,
    cts: label.cts,
    sig: label.sig,
  };
  if (label.cid) out.cid = label.cid;
  if (label.exp) out.exp = label.exp;
  if (label.neg) out.neg = true;
  return out;
}

/** A `#labels` firehose frame: dag-cbor header followed by dag-cbor body. */
function encodeFrame(label: StoredLabel): Buffer {
  const header = dagCbor.encode({ op: 1, t: "#labels" });
  const body = dagCbor.encode({ seq: label.seq, labels: [labelToCbor(label)] });
  return Buffer.concat([Buffer.from(header), Buffer.from(body)]);
}

function handleQueryLabels(db: LabelerDb, url: URL, res: ServerResponse): void {
  const uriPatterns = url.searchParams.getAll("uriPatterns");
  if (uriPatterns.length === 0) {
    xrpcError(res, 400, "InvalidRequest", "uriPatterns is required");
    return;
  }
  const sources = url.searchParams.getAll("sources");
  const limitParam = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const result = queryLabels(db, {
    uriPatterns,
    sources: sources.length > 0 ? sources : undefined,
    limit: limitParam ? Number(limitParam) : undefined,
    cursor,
  });
  sendJson(res, 200, {
    cursor: result.cursor,
    labels: result.labels.map(labelToJson),
  });
}

export function startServer(db: LabelerDb, keypair: Secp256k1Keypair): void {
  const multikey = keypairMultikey(keypair);

  const httpServer = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        });
        res.end();
        return;
      }
      if (req.method !== "GET" || !req.url) {
        xrpcError(res, 405, "MethodNotAllowed", "Only GET is supported");
        return;
      }

      const url = new URL(req.url, config.publicUrl);
      switch (url.pathname) {
        case "/health": {
          sendJson(res, 200, { ok: true, labels: latestSeq(db) });
          return;
        }
        case "/.well-known/did.json": {
          sendJson(res, 200, didDocument(multikey));
          return;
        }
        case "/xrpc/com.atproto.label.queryLabels": {
          handleQueryLabels(db, url, res);
          return;
        }
        default: {
          xrpcError(res, 404, "NotFound", `Unknown path: ${url.pathname}`);
        }
      }
    },
  );

  setupSubscribeLabels(db, httpServer);

  httpServer.listen(config.port, () => {
    console.log(
      `[server] listening on :${config.port} as ${config.labelerDid}`,
    );
  });
}

/**
 * `com.atproto.label.subscribeLabels`: on connect, optionally replay from a
 * cursor, then push new labels as they land. A 1s poll keeps the example simple;
 * a production labeler would use NOTIFY/an event emitter instead.
 */
function setupSubscribeLabels(
  db: LabelerDb,
  httpServer: ReturnType<typeof createServer>,
): void {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, number>();

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", config.publicUrl);
    if (url.pathname !== "/xrpc/com.atproto.label.subscribeLabels") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const cursorParam = url.searchParams.get("cursor");
      // No cursor → future labels only. A cursor → replay everything after it.
      let lastSeq = cursorParam != null ? Number(cursorParam) : latestSeq(db);
      if (cursorParam != null) {
        for (const label of labelsAfter(db, lastSeq, 10_000)) {
          ws.send(encodeFrame(label));
          lastSeq = label.seq;
        }
      }
      clients.set(ws, lastSeq);
      ws.on("close", () => clients.delete(ws));
      ws.on("error", () => clients.delete(ws));
    });
  });

  setInterval(() => {
    for (const [ws, seq] of clients) {
      const newer = labelsAfter(db, seq, 500);
      if (newer.length === 0) continue;
      for (const label of newer) ws.send(encodeFrame(label));
      clients.set(ws, newer.at(-1)!.seq);
    }
  }, 1000).unref();
}
