/**
 * Labeler resolution.
 *
 * There is exactly one kind of labeler: one declared on the network, advertising
 * `#atproto_labeler` in its DID document and publishing an
 * `app.bsky.labeler.service` record. Those never reach us over the firehose (we
 * don't index that collection), so they are resolved on first sight and
 * backfilled into `labeler_services` — after which reads are pure DB.
 *
 * We used to also accept a labeler registered by an `app.standard-reader.labeler.service`
 * record, which existed only so our own two did:web labelers could join the
 * directory (a did:web has no repo, so it cannot publish the standard
 * declaration). Those labelers are gone: any labeler can already label any
 * content, so running our own bought nothing that the network doesn't provide.
 */

import { and, eq, sql } from "drizzle-orm";

import { db } from "#/db/index.server";
import { labelerServices } from "#/db/schema";
import { resolveHandleToDid } from "#/server/atproto/resolve-author-ref";

import { resolveAtprotoLabeler } from "./atproto-labeler.server.ts";

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
  handle?: string;
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
    handle: declaration.handle,
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
 * How long before we re-ask a labeler for its label-value definitions.
 * Refreshes are triggered by seeing a label value we have no definition for,
 * which stays true for a labeler that genuinely under-declares — the cooldown
 * stops that from meaning a network call on every page load.
 */
const DEFINITIONS_REFRESH_MS = 60 * 60 * 1000;
const definitionsRefreshedAt = new Map<string, number>();

/**
 * Merge a labeler's own `app.bsky.labeler.service` definitions into its stored
 * row, and report whether anything new landed.
 *
 * An `app.standard-reader.labeler.service` record is written *about* a labeler,
 * often by us, so it drifts: Skywatch's app record declared 2 label values
 * while the labeler itself declares 35 and actively emits 28. Undeclared values
 * are not cosmetic — the Labels tab is where per-label visibility is chosen, so
 * a value with no definition cannot be configured at all.
 *
 * Definitions already on the row win per identifier, so a deliberate local
 * override is never overwritten; the labeler's own declaration only fills gaps.
 */
export async function refreshLabelerDefinitions(did: string): Promise<boolean> {
  const last = definitionsRefreshedAt.get(did);
  if (last !== undefined && Date.now() - last < DEFINITIONS_REFRESH_MS) {
    return false;
  }
  definitionsRefreshedAt.set(did, Date.now());

  const row = await readServiceRow(did);
  if (!row) return false;

  const declaration = await resolveAtprotoLabeler(did);
  const incoming = declaration?.labelValueDefinitions ?? [];
  if (incoming.length === 0) return false;

  const existing = (row.labelValueDefinitions ?? []) as Array<LabelValueDef>;
  const known = new Set(existing.map((def) => def.identifier));
  const added = incoming.filter(
    (def) => def.identifier && !known.has(def.identifier),
  );
  if (added.length === 0) return false;

  await db
    .update(labelerServices)
    .set({ labelValueDefinitions: [...existing, ...added] })
    .where(eq(labelerServices.uri, row.uri));
  return true;
}

/**
 * A labeler's presentation with only the first `limit` label definitions, plus
 * how many it declares in total.
 *
 * The slice happens in SQL because the definition blob can be enormous: ATlas
 * (a place labeler) declares 4,995 label values, 717 kB of JSON, and
 * {@link resolveLabelerView} pulling that row whole cost ~1s per page load
 * before anything was rendered — then shipped all of it to the browser to draw
 * 4,995 visibility controls.
 */
export async function resolveLabelerViewPage(
  did: string,
  limit: number,
): Promise<(ResolvedLabelerView & { labelCount: number }) | null> {
  const defs = labelerServices.labelValueDefinitions;
  const read = async () => {
    const [found] = await db
      .select({
        handle: labelerServices.handle,
        displayName: labelerServices.displayName,
        description: labelerServices.description,
        avatarUrl: labelerServices.avatarUrl,
        labelCount: sql<number>`jsonb_array_length(coalesce(${defs}, '[]'::jsonb))`,
        page: definitionSlice(limit, 0),
      })
      .from(labelerServices)
      .where(
        and(
          eq(labelerServices.labelerDid, did),
          eq(labelerServices.deleted, false),
        ),
      )
      .limit(1);
    return found ?? null;
  };

  // One round trip in the common case; the network backfill and a re-read only
  // happen the first time we ever see this labeler. The database is a region
  // away from the worker, so a redundant existence check is not free.
  let row = await read();
  if (!row) {
    if (!(await backfillAtprotoLabeler(did))) return null;
    row = await read();
  }
  if (!row) return null;

  return {
    did,
    handle: row.handle ?? undefined,
    displayName: row.displayName ?? undefined,
    description: row.description ?? undefined,
    avatar: row.avatarUrl ?? undefined,
    labelValueDefinitions: row.page ?? [],
    labelCount: Number(row.labelCount ?? 0),
  };
}

/** SQL for the `[offset, offset + limit)` slice of a labeler's definitions. */
function definitionSlice(limit: number, offset: number) {
  const defs = labelerServices.labelValueDefinitions;
  return sql<
    Array<LabelValueDef>
  >`coalesce((select jsonb_agg(e.value order by e.ord) from jsonb_array_elements(coalesce(${defs}, '[]'::jsonb)) with ordinality as e(value, ord) where e.ord > ${offset} and e.ord <= ${offset + limit}), '[]'::jsonb)`;
}

/** One offset page of a labeler's declared label definitions, plus the total. */
export async function readLabelDefinitionsPage(
  did: string,
  limit: number,
  offset: number,
): Promise<{ definitions: Array<LabelValueDef>; total: number }> {
  const defs = labelerServices.labelValueDefinitions;
  const [row] = await db
    .select({
      total: sql<number>`jsonb_array_length(coalesce(${defs}, '[]'::jsonb))`,
      page: definitionSlice(limit, offset),
    })
    .from(labelerServices)
    .where(
      and(
        eq(labelerServices.labelerDid, did),
        eq(labelerServices.deleted, false),
      ),
    )
    .limit(1);
  return {
    definitions: row?.page ?? [],
    total: Number(row?.total ?? 0),
  };
}

/**
 * Definitions for specific label values, wherever they sit in the array.
 *
 * The detail page only ships the first page of a labeler's definitions, but a
 * label *pill* anywhere in the app needs the definition for whichever value it
 * is showing — and for a labeler declaring thousands, that value is usually not
 * in the first page. Filtering in SQL keeps the 717 kB blob on the server.
 */
export async function readLabelDefinitionsFor(
  did: string,
  vals: Array<string>,
): Promise<Array<LabelValueDef>> {
  if (vals.length === 0) return [];
  const defs = labelerServices.labelValueDefinitions;
  const [row] = await db
    .select({
      // `sql.join`, not `in ${vals}`: drizzle binds a bare JS array as a single
      // scalar, which Postgres rejects as a malformed array literal.
      matched: sql<
        Array<LabelValueDef>
      >`coalesce((select jsonb_agg(e.value) from jsonb_array_elements(coalesce(${defs}, '[]'::jsonb)) as e(value) where e.value->>'identifier' in (${sql.join(
        vals.map((v) => sql`${v}`),
        sql`, `,
      )})), '[]'::jsonb)`,
    })
    .from(labelerServices)
    .where(
      and(
        eq(labelerServices.labelerDid, did),
        eq(labelerServices.deleted, false),
      ),
    )
    .limit(1);
  return row?.matched ?? [];
}

/** A labeler's presentation, from its registration record. */
export async function resolveLabelerView(
  did: string,
): Promise<ResolvedLabelerView | null> {
  const row = await serviceRow(did);
  if (!row) return null;
  return {
    did,
    handle: row.handle ?? undefined,
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
