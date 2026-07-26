/**
 * Labeler discovery.
 *
 * Two kinds of labeler land in the same `labeler_services` table, and every
 * read path treats them identically:
 *
 * 1. **Registered by record** — an `app.standard-reader.labeler.service` record
 *    owned by its author's account, indexed by tap. Our own labelers.
 * 2. **Declared on the network** — any AT Protocol labeler, which advertises
 *    `#atproto_labeler` in its DID document and publishes an
 *    `app.bsky.labeler.service` record. These never reach us over the firehose
 *    (we don't index that collection), so they are resolved on first lookup and
 *    backfilled into the table — after which reads are pure DB, like everything
 *    else.
 *
 * Either way the label server itself only answers queryLabels / subscribeLabels.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "#/db/index.server";
import { labelerServices } from "#/db/schema";
import { resolveHandleToDid } from "#/server/atproto/resolve-author-ref";

import { resolveAtprotoLabeler } from "./atproto-labeler.server.ts";
import { KNOWN_STANDARD_SITE_LABELERS } from "./known-labelers.ts";

export interface LabelValueDef {
  identifier?: string;
  severity?: string;
  blurs?: string;
  defaultSetting?: string;
  adultOnly?: boolean;
  locales?: Array<{ lang?: string; name?: string; description?: string }>;
}

export interface ResolvedLabelerView {
  did: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  labelValueDefinitions?: Array<LabelValueDef>;
}

async function readServiceRow(did: string) {
  const [row] = await db
    .select()
    .from(labelerServices)
    .where(
      and(
        eq(labelerServices.labelerDid, did),
        eq(labelerServices.deleted, false),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * DIDs we have already checked and found not to be labelers, so a lookup for a
 * non-labeler actor (someone typing any handle into the labeler search box)
 * costs one DID-document fetch rather than one per request.
 */
const notALabeler = new Map<string, number>();
const NEGATIVE_TTL_MS = 10 * 60 * 1000;

function negativeCached(did: string): boolean {
  const until = notALabeler.get(did);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  notALabeler.delete(did);
  return false;
}

/**
 * Resolve a labeler that declared itself on the network but has no app record,
 * and persist it so subsequent reads hit the DB. Keyed by the
 * `app.bsky.labeler.service` record's own AT-URI, which is a real record URI
 * and so can never collide with an app-record row.
 */
async function backfillAtprotoLabeler(did: string) {
  if (negativeCached(did)) return null;

  const declaration = await resolveAtprotoLabeler(did);
  if (!declaration) {
    notALabeler.set(did, Date.now() + NEGATIVE_TTL_MS);
    return null;
  }

  const values = {
    uri: `at://${did}/app.bsky.labeler.service/self`,
    ownerDid: did,
    rkey: "self",
    labelerDid: did,
    serviceEndpoint: declaration.serviceEndpoint,
    displayName: declaration.displayName,
    description: declaration.description,
    avatarUrl: declaration.avatarUrl,
    labelValueDefinitions: declaration.labelValueDefinitions,
    source: "atproto" as const,
    deleted: false,
  };
  await db
    .insert(labelerServices)
    .values(values)
    .onConflictDoUpdate({ target: labelerServices.uri, set: values });

  return readServiceRow(did);
}

/**
 * A labeler's registration row, resolving it from the network on first sight.
 * The DB is the read path; the network fetch happens only when no row exists
 * yet (see the backfill pattern in CLAUDE.md).
 */
async function serviceRow(did: string) {
  return (await readServiceRow(did)) ?? (await backfillAtprotoLabeler(did));
}

/** All registered labeler DIDs (the directory). */
export async function knownLabelerDids(): Promise<Array<string>> {
  const rows = await db
    .selectDistinct({ labelerDid: labelerServices.labelerDid })
    .from(labelerServices)
    .where(eq(labelerServices.deleted, false));
  return rows.map((r) => r.labelerDid);
}

/** Where to reach a labeler's label server (from its registration record). */
export async function resolveLabelerEndpoint(
  did: string,
): Promise<string | null> {
  const row = await serviceRow(did);
  return row?.serviceEndpoint ?? null;
}

/**
 * Give the curated labelers a `labeler_services` row if they don't have one.
 *
 * `KNOWN_STANDARD_SITE_LABELERS` decides whether a row is *listed*, so on its
 * own it can never surface a labeler that has no row yet — and a labeler that
 * declared itself on the network only gets one when somebody happens to look it
 * up by handle. Without this the curated set is inert: the labelers we most
 * want in the directory are exactly the ones missing from it.
 *
 * Called on the directory read. Costs one indexed query once every curated
 * labeler is present; the network resolve happens on first sight only, and a
 * DID that fails to resolve is negative-cached so this doesn't retry per load.
 */
export async function ensureKnownLabelersResolved(): Promise<void> {
  const dids = [...KNOWN_STANDARD_SITE_LABELERS];
  if (dids.length === 0) return;

  const rows = await db
    .select({ labelerDid: labelerServices.labelerDid })
    .from(labelerServices)
    .where(inArray(labelerServices.labelerDid, dids));
  const present = new Set(rows.map((r) => r.labelerDid));
  const missing = dids.filter((did) => !present.has(did));
  if (missing.length === 0) return;

  // resolveLabelerView backfills a row as a side effect of resolving.
  await Promise.all(missing.map((did) => resolveLabelerView(did)));
}

/** A labeler's presentation, from its registration record. */
export async function resolveLabelerView(
  did: string,
): Promise<ResolvedLabelerView | null> {
  const row = await serviceRow(did);
  if (!row) return null;
  return {
    did,
    displayName: row.displayName ?? undefined,
    description: row.description ?? undefined,
    avatar: row.avatarUrl ?? undefined,
    labelValueDefinitions:
      (row.labelValueDefinitions as Array<LabelValueDef> | null) ?? undefined,
  };
}

/**
 * Resolve a handle or DID to a DID.
 *
 * Delegates to the shared AppView-backed resolver, which covers both handle
 * resolution methods. This previously fetched `/.well-known/atproto-did`
 * directly and so missed every DNS-only handle — including labelers whose site
 * is an SPA that answers 200 with HTML at that path.
 */
export async function resolveActorDid(actor: string): Promise<string | null> {
  if (actor.startsWith("did:")) return actor;
  return resolveHandleToDid(actor.trim().toLowerCase());
}
