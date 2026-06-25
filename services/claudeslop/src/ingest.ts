/**
 * The producer: consume the Jetstream firehose, score every `site.standard.document`
 * that flows by, and emit (or retract) the `ai-writing` label accordingly.
 *
 * Jetstream is a JSON-over-WebSocket view of the AT Proto firehose — far simpler
 * to consume than the raw CBOR relay, which is why it's a good fit for a small
 * labeler. We ask it for just the one collection we care about and resume from a
 * persisted time cursor so a restart doesn't miss anything.
 */

import type { Secp256k1Keypair } from "@atproto/crypto";
import WebSocket from "ws";

import { config } from "./config.ts";
import {
  getCursor,
  getScanState,
  insertLabel,
  setCursor,
  setScanState,
  type LabelerDb,
} from "./db.ts";
import { score } from "./detector.ts";
import { signLabel } from "./sign.ts";

const CURSOR_NAME = "jetstream";
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

interface JetstreamEvent {
  did: string;
  time_us: number;
  kind: string;
  commit?: {
    rev: string;
    operation: "create" | "update" | "delete";
    collection: string;
    rkey: string;
    cid?: string;
    record?: Record<string, unknown>;
  };
}

function documentText(record: Record<string, unknown>): string {
  const parts = [record.title, record.textContent ?? record.description]
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  return parts.join("\n\n");
}

export function startIngest(db: LabelerDb, keypair: Secp256k1Keypair): void {
  let backoff = RECONNECT_MIN_MS;
  let lastTimeUs = Number(getCursor(db, CURSOR_NAME) ?? 0);

  // Persist the cursor on a timer rather than on every event.
  setInterval(() => {
    if (lastTimeUs > 0) setCursor(db, CURSOR_NAME, String(lastTimeUs));
  }, 5_000).unref();

  const connect = () => {
    const url = new URL(config.jetstreamUrl);
    url.searchParams.set("wantedCollections", config.documentCollection);
    if (lastTimeUs > 0) url.searchParams.set("cursor", String(lastTimeUs));

    const ws = new WebSocket(url);

    ws.on("open", () => {
      backoff = RECONNECT_MIN_MS;
      console.log(`[ingest] connected to ${config.jetstreamUrl}`);
    });

    ws.on("message", (data) => {
      let event: JetstreamEvent;
      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (event.time_us) lastTimeUs = event.time_us;
      void handleEvent(db, keypair, event).catch((err) =>
        console.error("[ingest] handler error", err),
      );
    });

    ws.on("close", () => {
      setCursor(db, CURSOR_NAME, String(lastTimeUs));
      console.warn(`[ingest] disconnected; reconnecting in ${backoff}ms`);
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    });

    ws.on("error", (err) => {
      console.error("[ingest] socket error", err.message);
      ws.close();
    });
  };

  connect();
}

async function handleEvent(
  db: LabelerDb,
  keypair: Secp256k1Keypair,
  event: JetstreamEvent,
): Promise<void> {
  const commit = event.commit;
  if (
    event.kind !== "commit" ||
    !commit ||
    commit.collection !== config.documentCollection
  ) {
    return;
  }

  const uri = `at://${event.did}/${commit.collection}/${commit.rkey}`;
  const prev = getScanState(db, uri);

  // Deleted document: retract any label we had on it.
  if (commit.operation === "delete") {
    if (prev?.labeled) {
      await emit(db, keypair, { uri, label: false });
      setScanState(db, uri, { version: config.detectorVersion, labeled: false });
    }
    return;
  }

  if (!commit.record) return;
  const result = score(documentText(commit.record));
  const desired = result.score >= config.aiThreshold;

  // Idempotent: only act when the desired state differs from what we last
  // recorded at the current detector version.
  if (prev && prev.version === config.detectorVersion && prev.labeled === desired) {
    return;
  }
  const wasLabeled = prev?.labeled ?? false;
  if (desired !== wasLabeled) {
    await emit(db, keypair, {
      uri,
      cid: desired ? commit.cid : undefined,
      label: desired,
    });
    console.log(
      `[ingest] ${desired ? "+" : "-"}${config.labelValue} ${uri} (score ${result.score.toFixed(2)})`,
    );
  }
  setScanState(db, uri, { version: config.detectorVersion, labeled: desired });
}

async function emit(
  db: LabelerDb,
  keypair: Secp256k1Keypair,
  opts: { uri: string; cid?: string; label: boolean },
): Promise<void> {
  const signed = await signLabel(keypair, {
    ver: 1,
    src: config.labelerDid,
    uri: opts.uri,
    cid: opts.cid,
    val: config.labelValue,
    neg: opts.label ? undefined : true,
    cts: new Date().toISOString(),
  });
  insertLabel(db, signed);
}
