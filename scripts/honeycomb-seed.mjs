#!/usr/bin/env node
/**
 * Seed the Honeycomb `standard-reader` dataset with representative canary events.
 * Run once after setting HONEYCOMB_API_KEY (creates the dataset on first send).
 *
 *   pnpm honeycomb:seed
 *   # or: HONEYCOMB_API_KEY=... HONEYCOMB_DATASET=standard-reader pnpm honeycomb:seed
 */

const API_KEY = process.env.HONEYCOMB_API_KEY;
const DATASET = process.env.HONEYCOMB_DATASET ?? "standard-reader";
const API_HOST = process.env.HONEYCOMB_API_HOST ?? "https://api.honeycomb.io";

if (!API_KEY) {
  console.error(
    "HONEYCOMB_API_KEY is required. Add it to .env or pass it on the command line.",
  );
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);

/** @type {Array<Record<string, unknown>>} */
const events = [
  {
    time: now,
    name: "reader.getFollowStatus",
    "service.name": "web",
    duration_ms: 42,
    ok: true,
    publicationUri: "at://did:plc:example/app.standard-reader.subscription/abc",
  },
  {
    time: now,
    name: "search.articles",
    "service.name": "web",
    duration_ms: 180,
    ok: true,
    query: "seed",
  },
  {
    time: now,
    name: "search.articles",
    "service.name": "web",
    duration_ms: 2100,
    ok: false,
    error: "seed canary error",
    query: "seed",
  },
  {
    time: now,
    name: "ingest.heartbeat",
    "service.name": "ingest",
    ok: true,
    record: 100,
    identity: 5,
    inflight: 2,
    idleMs: 120,
  },
  {
    time: now,
    name: "ingest.tapEvent",
    "service.name": "ingest",
    ok: false,
    result: "dead-lettered",
    eventType: "record",
    collection: "site.standard.document",
    eventId: 1,
  },
];

const url = `${API_HOST}/1/events/${encodeURIComponent(DATASET)}`;

for (const event of events) {
  const response = await fetch(url, {
    body: JSON.stringify(event),
    headers: {
      "Content-Type": "application/json",
      "X-Honeycomb-Team": API_KEY,
    },
    method: "POST",
  });

  if (!response.ok) {
    console.error(
      `Honeycomb seed failed for ${event.name} (${response.status}): ${await response.text()}`,
    );
    process.exit(1);
  }
}

console.info(
  `Seeded ${events.length} canary events into dataset "${DATASET}". Open Honeycomb → Environments → test → ${DATASET}.`,
);
