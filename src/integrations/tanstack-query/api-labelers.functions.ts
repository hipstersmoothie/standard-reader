import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";

import { fetchBlueskyPublicProfiles } from "#/lib/bluesky-public-profile";
import { subscriptionLabelPrefs } from "#/lib/labeler-subscription";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import {
  deleteLabelerSubscriptionRecord,
  deleteLegacyLabelerSubscriptionRecord,
  putLabelerSubscriptionRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { Collections, buildAtUri } from "#/server/atproto/uri";
import {
  deleteRecord,
  upsertLabelerSubscription,
} from "#/server/ingest/handlers";
import {
  labelsForDocument,
  observedLabelValues,
  readAccountLabels,
  subscribedLabelerDids,
} from "#/server/labeler/labels.server";
import type { LabelValueDef } from "#/server/labeler/resolve.server";
import {
  ensureKnownLabelersResolved,
  readLabelDefinitionsFor,
  readLabelDefinitionsPage,
  refreshLabelerDefinitions,
  resolveActorDid,
  resolveLabelerView,
  resolveLabelerViewPage,
} from "#/server/labeler/resolve.server";
import { observe } from "#/server/observability/log";
import { documentPublishedNotInFuture } from "#/server/reader/document-filters";
import { selectArticleCardsByUris } from "#/server/reader/queries";

import type { ArticleCard, Db, Schema } from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

/**
 * Labeler subscriptions (`app.standard-reader.labeler.subscription`, V2; legacy
 * `app.standard-reader.labelerSubscription`). A labeler is just a DID; we
 * discover it the standard way (DID document → `#atproto_labeler` service →
 * descriptor). Subscriptions are records in the reader's own repo, mirrored
 * into the read-model so label lookups don't need a repo read. New writes target
 * V2; reads accept both NSIDs until per-reader migration completes.
 */

export type { LabelValueDef };

export interface LabelerCard {
  did: string;
  /** Handle from the labeler's DID document, when it declares one. */
  handle?: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  labelValueDefinitions?: Array<LabelValueDef>;
}

/**
 * A labeler in the directory, with the caller's subscription state.
 *
 * Carries `labelNames`/`labelCount` rather than the full
 * `labelValueDefinitions` the detail page uses. The directory lists every
 * labeler on the network — hundreds of them, declaring ~15k label values
 * between them, which is over 3 MB of definition JSON with locales and
 * severities. A card only ever renders the first couple of names plus a
 * "+N more", so that is all it is sent.
 */
export interface LabelerListItem extends LabelerCard {
  /** Localized label names, capped at what a card can show. */
  labelNames: Array<string>;
  /** How many label values this labeler declares in total. */
  labelCount: number;
  subscribed: boolean;
  /**
   * Whether a subscribed labeler's labels actually apply here. `false` means
   * the reader muted it — kept in their list, with prefs intact, but not
   * acting. Always `true` for labelers they aren't subscribed to.
   */
  enabled: boolean;
  subscriberCount: number;
}

export type LabelVisibility = "ignore" | "warn" | "hide";
export interface LabelPref {
  val: string;
  visibility: LabelVisibility;
}

/**
 * How the last label sync went for a labeler.
 *
 * Exists so the UI can distinguish a labeler that is *broken* — unreachable, or
 * serving labels that don't verify against its published signing key — from one
 * that has simply labeled nothing yet. Those look identical otherwise: a reader
 * subscribes, sees a full list of label toggles, and receives nothing, forever,
 * with no explanation.
 */
export interface LabelerHealth {
  /** Labels stored on the last run. */
  stored: number;
  /** Labels dropped on the last run because their signature didn't verify. */
  rejected: number;
  /** Why the labeler couldn't be reached, when it couldn't. */
  error: string | null;
  /** When we last tried. Null if we never have. */
  syncedAt: string | null;
}

export interface DocumentLabel {
  src: string;
  val: string;
  visibility: LabelVisibility;
}

const actorInput = z.object({ actor: z.string().trim().min(1) });
const labelerInput = z.object({ labeler: z.string().trim().min(1) });
const uriInput = z.object({ uri: z.string().trim().min(1) });

/** Default page size for a labeler's labeled-documents infinite scroll. */
export const LABELED_DOCUMENTS_PAGE_SIZE = 30;

/**
 * Label definitions per page on the labeler detail view.
 *
 * A labeler can declare thousands — ATlas, a place labeler, declares 4,995 —
 * which is 717 kB of JSON and as many visibility controls. The Labels tab pages
 * through them on scroll instead.
 */
export const LABEL_DEFINITIONS_PAGE_SIZE = 50;

const labelDefinitionsInput = labelerInput.extend({
  limit: z.number().int().min(1).max(200).default(LABEL_DEFINITIONS_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

/** One offset page of a labeler's declared label definitions. */
export interface LabelDefinitionsPage {
  definitions: Array<LabelValueDef>;
  total: number;
  nextOffset: number | null;
}

const labeledDocumentsInput = labelerInput.extend({
  limit: z.number().int().min(1).max(100).default(LABELED_DOCUMENTS_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

/** One offset page of a labeler's labeled documents. */
export interface LabeledDocumentsPage {
  documents: Array<ArticleCard>;
  labelsByUri: Record<string, Array<string>>;
  total: number;
  nextOffset: number | null;
}

/** An account a labeler has labeled, as rendered on the labeler detail page. */
export interface LabeledAccount {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/** One offset page of a labeler's labeled accounts. */
export interface LabeledAccountsPage {
  accounts: Array<LabeledAccount>;
  labelsByDid: Record<string, Array<string>>;
  total: number;
  nextOffset: number | null;
}
const setPrefInput = z.object({
  labeler: z.string().trim().min(1),
  val: z.string().trim().min(1),
  visibility: z.enum(["ignore", "warn", "hide"]),
});

/** The caller's per-label prefs for a labeler, read from the read-model mirror. */
async function readPrefs(
  db: Db,
  schema: Schema,
  subscriberDid: string,
  labelerDid: string,
): Promise<{
  prefs: Array<LabelPref>;
  createdAt: string | null;
  enabled: boolean;
}> {
  const ls = schema.labelerSubscriptions;
  const [row] = await db
    .select({ prefs: ls.prefs, createdAt: ls.createdAt, enabled: ls.enabled })
    .from(ls)
    .where(
      and(
        eq(ls.subscriberDid, subscriberDid),
        eq(ls.labelerDid, labelerDid),
        eq(ls.deleted, false),
      ),
    )
    .limit(1);
  return {
    prefs: (row?.prefs as Array<LabelPref> | null) ?? [],
    createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
    enabled: row?.enabled ?? true,
  };
}

const getLabelers = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("labelers.getLabelers", async ({ context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) return [] satisfies Array<LabelerCard>;
      span.set("did", session.did);

      const dids = await subscribedLabelerDids(
        context.db,
        context.schema,
        session.did,
      );
      const views = await Promise.all(dids.map((d) => resolveLabelerView(d)));
      span.set("count", dids.length);
      return dids.map(
        (did, i): LabelerCard => views[i] ?? { did },
      ) satisfies Array<LabelerCard>;
    }),
  );

/** Label names to send per directory card before collapsing to "+N more". */
const CARD_LABEL_NAMES = 2;

/** Default page size for the labeler directory. */
export const KNOWN_LABELERS_PAGE_SIZE = 36;

const knownLabelersInput = z.object({
  query: z.string().trim().max(200).default(""),
  limit: z.number().int().min(1).max(100).default(KNOWN_LABELERS_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

/** One offset page of the labeler directory. */
export interface KnownLabelersPage {
  labelers: Array<LabelerListItem>;
  total: number;
  nextOffset: number | null;
}

/** The localized names of a labeler's first few label values. */
function cardLabelNames(
  definitions: Array<LabelValueDef> | null,
): Array<string> {
  return (definitions ?? []).slice(0, CARD_LABEL_NAMES).map((def) => {
    const name = def.locales?.[0]?.name;
    if (typeof name === "string" && name.length > 0) return name;
    return typeof def.identifier === "string" ? def.identifier : "label";
  });
}

/**
 * The labeler directory: every labeler on the network, paged.
 *
 * No relevance filter — readers bring their moderation setup with them from
 * Bluesky, so a labeler that has never touched a standard.site document is still
 * theirs to see and manage. Since that means hundreds of rows, searching and
 * paging happen in SQL rather than by shipping the whole table to the client.
 */
const getKnownLabelers = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(knownLabelersInput)
  .handler(
    observe("labelers.getKnownLabelers", async ({ data, context }, span) => {
      // Curated labelers that declared themselves on the network have no row
      // until something resolves them, so seed them before listing.
      await ensureKnownLabelersResolved();

      const session = await getAtprotoSessionForRequest(getRequest());
      const ls = context.schema.labelerSubscriptions;
      const svc = context.schema.labelerServices;
      span.set("query", data.query);
      span.set("offset", data.offset);

      // The caller's own subscriptions, including muted ones — a disabled
      // labeler still belongs in their list, just marked as not acting. Small
      // per-reader set, so it is fetched whole and applied to the page below.
      const mine = session
        ? await context.db
            .select({ labelerDid: ls.labelerDid, enabled: ls.enabled })
            .from(ls)
            .where(
              and(eq(ls.subscriberDid, session.did), eq(ls.deleted, false)),
            )
        : [];
      const subSet = new Set(mine.map((row) => row.labelerDid));
      const disabledSet = new Set(
        mine.filter((row) => !row.enabled).map((row) => row.labelerDid),
      );

      const subscriberCount = context.db
        .select({
          labelerDid: ls.labelerDid,
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(ls)
        .where(eq(ls.deleted, false))
        .groupBy(ls.labelerDid)
        .as("subscriber_count");

      // Matched against name, handle, description and the declared label
      // identifiers, so searching "spam" finds labelers that emit it.
      const term = data.query.toLowerCase();
      const where = and(
        eq(svc.deleted, false),
        term.length > 0
          ? sql`(
              lower(coalesce(${svc.displayName}, '')) like ${`%${term}%`}
              or lower(coalesce(${svc.handle}, '')) like ${`%${term}%`}
              or lower(coalesce(${svc.description}, '')) like ${`%${term}%`}
              or lower(${svc.labelerDid}) like ${`%${term}%`}
              or exists (
                select 1 from jsonb_array_elements(
                  coalesce(${svc.labelValueDefinitions}, '[]'::jsonb)
                ) as def
                where lower(coalesce(def->>'identifier', '')) like ${`%${term}%`}
              )
            )`
          : undefined,
      );

      // The caller's own subscriptions sort first so the page opens on *their*
      // setup rather than on whatever the network subscribes to most. Done in
      // SQL because with pagination a client-side sort would only reorder the
      // page it happens to be holding.
      // Deliberately *not* subscribed-first. This is the directory — a view of
      // the whole network — so it ranks by how many readers here subscribe and
      // then alphabetically, the same for everyone. Floating the caller's own
      // labelers to the top made the page a mirror of their existing setup
      // rather than somewhere to find something new; their own are reachable via
      // search, and each card already shows its state.
      const orderBy = [
        sql`coalesce(${subscriberCount.count}, 0) desc`,
        sql`coalesce(${svc.displayName}, ${svc.handle}, ${svc.labelerDid}) asc`,
      ];

      const [countRow, rows] = await Promise.all([
        context.db
          .select({ count: sql<number>`count(*)::int` })
          .from(svc)
          .where(where),
        context.db
          .select({
            labelerDid: svc.labelerDid,
            handle: svc.handle,
            displayName: svc.displayName,
            description: svc.description,
            avatarUrl: svc.avatarUrl,
            labelValueDefinitions: svc.labelValueDefinitions,
            subscriberCount: subscriberCount.count,
          })
          .from(svc)
          .leftJoin(
            subscriberCount,
            eq(subscriberCount.labelerDid, svc.labelerDid),
          )
          .where(where)
          .orderBy(...orderBy)
          .limit(data.limit)
          .offset(data.offset),
      ]);

      const total = countRow[0]?.count ?? 0;
      span.set("count", rows.length);
      span.set("total", total);

      const labelers = rows.map((row): LabelerListItem => {
        const defs =
          (row.labelValueDefinitions as Array<LabelValueDef> | null) ?? null;
        return {
          did: row.labelerDid,
          handle: row.handle ?? undefined,
          displayName: row.displayName ?? undefined,
          description: row.description ?? undefined,
          avatar: row.avatarUrl ?? undefined,
          labelNames: cardLabelNames(defs),
          labelCount: defs?.length ?? 0,
          subscribed: subSet.has(row.labelerDid),
          enabled: !disabledSet.has(row.labelerDid),
          subscriberCount: row.subscriberCount ?? 0,
        };
      });

      return {
        labelers,
        total,
        nextOffset:
          rows.length > 0 && data.offset + rows.length < total
            ? data.offset + rows.length
            : null,
      } satisfies KnownLabelersPage;
    }),
  );

const getLabeler = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(actorInput)
  .handler(
    observe("labelers.getLabeler", async ({ data, context }, span) => {
      span.set("actor", data.actor);
      const did = await resolveActorDid(data.actor);
      if (!did) return { labeler: null, subscribed: false };
      span.set("did", did);

      const session = await getAtprotoSessionForRequest(getRequest());
      const st = context.schema.labelSyncState;
      const [view, prefsRow, observed, syncRows] = await Promise.all([
        resolveLabelerViewPage(did, LABEL_DEFINITIONS_PAGE_SIZE),
        session
          ? readPrefs(context.db, context.schema, session.did, did)
          : Promise.resolve({
              prefs: [] as Array<LabelPref>,
              createdAt: null,
              enabled: true,
            }),
        observedLabelValues(context.db, context.schema, did),
        context.db
          .select({
            stored: st.storedCount,
            rejected: st.rejectedCount,
            error: st.lastError,
            syncedAt: st.syncedAt,
          })
          .from(st)
          .where(eq(st.labelerDid, did))
          .limit(1),
      ]);

      const syncRow = syncRows[0];
      const health: LabelerHealth = {
        stored: syncRow?.stored ?? 0,
        rejected: syncRow?.rejected ?? 0,
        error: syncRow?.error ?? null,
        syncedAt: syncRow?.syncedAt
          ? new Date(syncRow.syncedAt).toISOString()
          : null,
      };
      span.set("health.rejected", health.rejected);

      const labelCount = view?.labelCount ?? 0;
      const page = view?.labelValueDefinitions ?? [];
      // Definitions for values this labeler has actually emitted, wherever they
      // sit in its array. Without this a label pill on a feed couldn't resolve
      // its display name for any labeler declaring more than one page — the
      // value it names is usually further down.
      const emitted =
        labelCount > page.length
          ? await readLabelDefinitionsFor(did, observed)
          : [];
      // Gap-filling below compares what a labeler *emits* against what it
      // *declares*, so it needs the complete declaration — which we only have
      // when the labeler declares no more than one page. Past that we show the
      // page and say how many more there are: a labeler declaring thousands of
      // values (ATlas declares 4,995 places) is plainly not under-declaring, and
      // reasoning about "undeclared" from a partial list would invent values it
      // does declare, just further down.
      const haveAllDefinitions = labelCount <= page.length;
      const seenIdentifier = new Set(
        page.map((d: LabelValueDef) => d.identifier),
      );
      const finalDefs = [
        ...page,
        ...emitted.filter((d) => !seenIdentifier.has(d.identifier)),
      ];

      if (haveAllDefinitions) {
        // A registration record is written *about* a labeler and drifts from
        // what it actually emits. A value with no definition can't be given a
        // visibility pref at all, so when we've synced values this labeler never
        // declared, pull its own declaration and fill the gaps (rate-limited).
        const declared = new Set(page.map((d: LabelValueDef) => d.identifier));
        const undeclared = observed.filter((val: string) => !declared.has(val));
        if (undeclared.length > 0) {
          span.set("undeclaredValues", undeclared.length);
          if (await refreshLabelerDefinitions(did)) {
            const refreshed = await resolveLabelerViewPage(
              did,
              LABEL_DEFINITIONS_PAGE_SIZE,
            );
            if (refreshed) {
              finalDefs.length = 0;
              finalDefs.push(...(refreshed.labelValueDefinitions ?? []));
            }
          }
        }

        // Anything still undeclared — a labeler emitting values it documents
        // nowhere — becomes a bare definition, so the reader can still set a
        // pref for it instead of being stuck on the `warn` default.
        const covered = new Set(
          finalDefs.map((d: LabelValueDef) => d.identifier),
        );
        for (const val of observed) {
          if (!covered.has(val)) finalDefs.push({ identifier: val });
        }
      }
      span.set("labelCount", labelCount);

      let subscribed = false;
      if (session) {
        const subs = await subscribedLabelerDids(
          context.db,
          context.schema,
          session.did,
        );
        subscribed = subs.includes(did);
      }
      return {
        labeler: {
          ...((view ?? {}) as LabelerCard),
          did,
          labelValueDefinitions: finalDefs,
        } as LabelerCard,
        /** Total label values this labeler declares, not just the page above. */
        labelCount: Math.max(labelCount, finalDefs.length),
        subscribed,
        prefs: prefsRow.prefs,
        enabled: prefsRow.enabled,
        health,
      };
    }),
  );

const setLabelerPref = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(setPrefInput)
  .handler(
    observe("labelers.setPref", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to manage labelers.");
      span.set("did", session.did);
      span.set("labeler", data.labeler);
      span.set("val", data.val);

      const { prefs, createdAt, enabled } = await readPrefs(
        context.db,
        context.schema,
        session.did,
        data.labeler,
      );
      const next: Array<LabelPref> = [
        ...prefs.filter((p) => p.val !== data.val),
        { val: data.val, visibility: data.visibility },
      ];
      const when = createdAt ?? new Date().toISOString();

      // `enabled` is carried through: putRecord replaces the whole record, so
      // omitting it here would silently re-enable a labeler the reader muted
      // just because they adjusted one of its label preferences.
      const { uri, cid } = await putLabelerSubscriptionRecord(
        session.client,
        session.did,
        data.labeler,
        when,
        next,
        enabled,
      );
      await upsertLabelerSubscription(
        uri,
        session.did,
        subjectRkey(data.labeler),
        cid,
        { labeler: data.labeler, labels: next, enabled, createdAt: when },
      );
      return { ok: true as const, prefs: next };
    }),
  );

/**
 * Mute or unmute a labeler without unsubscribing from it.
 *
 * For a labeler a reader keeps on another app but doesn't want acting here:
 * the subscription and its per-label preferences stay exactly as they are, and
 * only label resolution skips it — so re-enabling restores what they had
 * rather than starting from defaults.
 */
const setLabelerEnabled = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(
    z.object({
      labeler: z.string().trim().min(1),
      enabled: z.boolean(),
    }),
  )
  .handler(
    observe("labelers.setEnabled", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to manage labelers.");
      span.set("did", session.did);
      span.set("labeler", data.labeler);
      span.set("enabled", data.enabled);

      const { prefs, createdAt } = await readPrefs(
        context.db,
        context.schema,
        session.did,
        data.labeler,
      );
      const when = createdAt ?? new Date().toISOString();

      const { uri, cid } = await putLabelerSubscriptionRecord(
        session.client,
        session.did,
        data.labeler,
        when,
        prefs,
        data.enabled,
      );
      await upsertLabelerSubscription(
        uri,
        session.did,
        subjectRkey(data.labeler),
        cid,
        {
          labeler: data.labeler,
          labels: prefs,
          enabled: data.enabled,
          createdAt: when,
        },
      );
      return { ok: true as const, enabled: data.enabled };
    }),
  );

/**
 * One page of a labeler's declared label definitions.
 *
 * Separate from {@link getLabeler} so the Labels tab can scroll through a
 * labeler that declares thousands of values without the first paint carrying
 * them all.
 */
const getLabelerLabels = createServerFn({ method: "GET" })
  .validator(labelDefinitionsInput)
  .handler(
    observe("labelers.getLabelerLabels", async ({ data }, span) => {
      const did = await resolveActorDid(data.labeler);
      if (!did) {
        return {
          definitions: [],
          total: 0,
          nextOffset: null,
        } satisfies LabelDefinitionsPage;
      }
      const { definitions, total } = await readLabelDefinitionsPage(
        did,
        data.limit,
        data.offset,
      );
      span.set("count", definitions.length);
      span.set("total", total);
      return {
        definitions,
        total,
        nextOffset:
          definitions.length > 0 && data.offset + definitions.length < total
            ? data.offset + definitions.length
            : null,
      } satisfies LabelDefinitionsPage;
    }),
  );

const getLabeledDocuments = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(labeledDocumentsInput)
  .handler(
    observe("labelers.getLabeledDocuments", async ({ data, context }, span) => {
      span.set("labeler", data.labeler);
      span.set("limit", data.limit);
      span.set("offset", data.offset);

      const dl = context.schema.documentLabels;
      const d = context.schema.documents;
      // Join to `documents` (rather than ordering by label `cts`) so the list
      // reads in reverse-chronological *publish* order, and so every uri in a
      // page is guaranteed to hydrate below (no unresolved rows to drop).
      const where = and(
        eq(dl.src, data.labeler),
        like(dl.uri, "%/site.standard.document/%"),
        eq(d.deleted, false),
        documentPublishedNotInFuture(d),
      );

      const [countRow, uriRows] = await Promise.all([
        context.db
          .select({ count: sql<number>`count(distinct ${dl.uri})::int` })
          .from(dl)
          .innerJoin(d, eq(d.uri, dl.uri))
          .where(where),
        context.db
          .selectDistinct({ uri: dl.uri, publishedAt: d.publishedAt })
          .from(dl)
          .innerJoin(d, eq(d.uri, dl.uri))
          .where(where)
          .orderBy(sql`${d.publishedAt} desc nulls last`, dl.uri)
          .limit(data.limit)
          .offset(data.offset),
      ]);

      const total = countRow[0]?.count ?? 0;
      const uris = uriRows.map((r) => r.uri);
      const valRows =
        uris.length > 0
          ? await context.db
              .select({ uri: dl.uri, val: dl.val })
              .from(dl)
              .where(and(eq(dl.src, data.labeler), inArray(dl.uri, uris)))
          : [];

      const labelsByUri: Record<string, Array<string>> = {};
      for (const row of valRows) {
        const vals = labelsByUri[row.uri] ?? [];
        if (!vals.includes(row.val)) vals.push(row.val);
        labelsByUri[row.uri] = vals;
      }

      const documents = await selectArticleCardsByUris(
        context.db,
        context.schema,
        uris,
        { lite: true },
      );
      span.set("count", documents.length);
      span.set("total", total);
      return {
        documents,
        labelsByUri,
        total,
        nextOffset:
          uris.length > 0 && data.offset + uris.length < total
            ? data.offset + uris.length
            : null,
      } satisfies LabeledDocumentsPage;
    }),
  );

const getDocumentLabels = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(uriInput)
  .handler(
    observe("labelers.getDocumentLabels", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) return { labels: [] satisfies Array<DocumentLabel> };
      span.set("uri", data.uri);

      // Read from the read-model (synced from labelers); no labeler call here.
      const out: Array<DocumentLabel> = await labelsForDocument(
        context.db,
        context.schema,
        session.did,
        data.uri,
      );
      span.set("count", out.length);
      return { labels: out };
    }),
  );

/**
 * Accounts a labeler has labeled, with the profile rows we hold for them.
 *
 * The counterpart of {@link getLabeledDocuments}: a labeler's subjects are
 * either documents or accounts, and network labelers deal almost exclusively in
 * accounts (pub-search labels a publisher, not each generated page). Without
 * this a labeler like that has an entirely empty detail page.
 *
 * Subjects are matched by `did:` prefix rather than by a join, so an account we
 * hold no profile row for still counts toward the total and renders as a bare
 * DID rather than vanishing.
 */
const getLabeledAccounts = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(labeledDocumentsInput)
  .handler(
    observe("labelers.getLabeledAccounts", async ({ data, context }, span) => {
      span.set("labeler", data.labeler);
      const dl = context.schema.documentLabels;
      const where = and(eq(dl.src, data.labeler), like(dl.uri, "did:%"));

      const [countRow, didRows] = await Promise.all([
        context.db
          .select({ count: sql<number>`count(distinct ${dl.uri})::int` })
          .from(dl)
          .where(where),
        context.db
          .selectDistinct({ did: dl.uri })
          .from(dl)
          .where(where)
          .orderBy(dl.uri)
          .limit(data.limit)
          .offset(data.offset),
      ]);

      const total = countRow[0]?.count ?? 0;
      const dids = didRows.map((r) => r.did);
      const [valRows, profileRows] = await Promise.all([
        dids.length > 0
          ? context.db
              .select({ uri: dl.uri, val: dl.val })
              .from(dl)
              .where(and(eq(dl.src, data.labeler), inArray(dl.uri, dids)))
          : Promise.resolve([]),
        dids.length > 0
          ? context.db
              .select({
                did: context.schema.profiles.did,
                handle: context.schema.profiles.handle,
                displayName: context.schema.profiles.displayName,
                avatarUrl: context.schema.profiles.avatarUrl,
              })
              .from(context.schema.profiles)
              .where(inArray(context.schema.profiles.did, dids))
          : Promise.resolve([]),
      ]);

      const labelsByDid: Record<string, Array<string>> = {};
      for (const row of valRows) {
        const vals = labelsByDid[row.uri] ?? [];
        if (!vals.includes(row.val)) vals.push(row.val);
        labelsByDid[row.uri] = vals;
      }
      const profileByDid = new Map(profileRows.map((p) => [p.did, p]));

      // A labeler can label any account on the network, and most labeled
      // accounts never publish to standard.site — so we hold no `profiles` row
      // for them and they would render as a bare `did:plc:…`. Fill those from
      // the public AppView. Bounded to the DIDs on this page (one batched call
      // per 25) and best-effort: an account that has since been deactivated is
      // simply omitted, and falls back to its DID.
      const unhydrated = dids.filter((did) => !profileByDid.has(did));
      const bskyByDid = await fetchBlueskyPublicProfiles(unhydrated);
      span.set("hydratedFromAppView", bskyByDid.size);
      span.set("unhydrated", unhydrated.length - bskyByDid.size);

      span.set("count", dids.length);
      span.set("total", total);
      return {
        accounts: dids.map((did) => {
          const local = profileByDid.get(did);
          const remote = bskyByDid.get(did);
          return {
            did,
            handle: local?.handle ?? remote?.handle ?? null,
            displayName: local?.displayName ?? remote?.displayName ?? null,
            avatarUrl: local?.avatarUrl ?? remote?.avatarUrl ?? null,
          };
        }),
        labelsByDid,
        total,
        nextOffset:
          dids.length > 0 && data.offset + dids.length < total
            ? data.offset + dids.length
            : null,
      } satisfies LabeledAccountsPage;
    }),
  );

/**
 * Labels on an **account** for the signed-in reader.
 *
 * Its own round trip rather than a field on the publication header, because the
 * header query is shared across readers (`["publication", "header", uri]`)
 * while labels are viewer-specific — they depend on which labelers the reader
 * subscribes to and the per-label visibility they chose.
 */
const getAccountLabels = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(z.object({ did: z.string().trim().min(1) }))
  .handler(
    observe("labelers.getAccountLabels", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) return { labels: [] satisfies Array<DocumentLabel> };
      span.set("subject.did", data.did);

      const byDid = await readAccountLabels(
        context.db,
        context.schema,
        session.did,
        [data.did],
      );
      const out: Array<DocumentLabel> = byDid.get(data.did) ?? [];
      span.set("count", out.length);
      return { labels: out };
    }),
  );

const subscribeLabeler = createServerFn({ method: "POST" })
  .validator(labelerInput)
  .handler(
    observe("labelers.subscribe", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to subscribe to labelers.");
      span.set("did", session.did);
      span.set("labeler", data.labeler);

      // Start every declared label at `warn` rather than leaving prefs empty:
      // an empty record made the toggles show a render-time fallback that was
      // never written anywhere, so what the reader saw wasn't what their repo
      // said — and a labeler editing its own `defaultSetting` later would
      // silently change how their existing subscription behaved.
      const view = await resolveLabelerView(data.labeler);
      const labels = subscriptionLabelPrefs(
        (view?.labelValueDefinitions ?? [])
          .map((def) => def.identifier)
          .filter((id): id is string => typeof id === "string"),
      );
      span.set("labelCount", labels.length);

      const createdAt = new Date().toISOString();
      const { uri, cid } = await putLabelerSubscriptionRecord(
        session.client,
        session.did,
        data.labeler,
        createdAt,
        labels,
      );
      await upsertLabelerSubscription(
        uri,
        session.did,
        subjectRkey(data.labeler),
        cid,
        { labeler: data.labeler, labels, createdAt },
      );
      return { ok: true as const };
    }),
  );

const unsubscribeLabeler = createServerFn({ method: "POST" })
  .validator(labelerInput)
  .handler(
    observe("labelers.unsubscribe", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to manage labelers.");
      span.set("did", session.did);
      span.set("labeler", data.labeler);

      // Both NSIDs, both sides. This previously deleted the **V2** record from
      // the PDS but the **legacy**-keyed row from the read-model — so for the V2
      // subscriptions everything now writes (including every labeler ported from
      // Bluesky) the mirror row survived, and since the DB is the read path the
      // labeler stayed subscribed and its labels kept applying. Unsubscribing
      // looked like it did nothing.
      //
      // A reader can also hold a legacy record that no longer has a V2 twin, and
      // `subscribedLabelerDids` reads both, so leaving either behind resurrects
      // the subscription.
      const rkey = subjectRkey(data.labeler);
      await Promise.all([
        deleteLabelerSubscriptionRecord(
          session.client,
          session.did,
          data.labeler,
        ),
        deleteLegacyLabelerSubscriptionRecord(
          session.client,
          session.did,
          data.labeler,
        ).catch(() => {
          // Absent for most readers; a missing record is not a failure.
        }),
      ]);
      await Promise.all([
        deleteRecord(
          buildAtUri(session.did, Collections.labelerSubscriptionV2, rkey),
          Collections.labelerSubscriptionV2,
        ),
        deleteRecord(
          buildAtUri(session.did, Collections.labelerSubscription, rkey),
          Collections.labelerSubscription,
        ),
      ]);
      return { ok: true as const };
    }),
  );

// ── React Query options (for the UI) ────────────────────────────────────────

function getLabelersQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "labelers"] as const,
    queryFn: async () => getLabelers(),
    staleTime: 5 * 60_000,
  });
}

function getKnownLabelersInfiniteQueryOptions(
  query = "",
  limit = KNOWN_LABELERS_PAGE_SIZE,
) {
  return infiniteQueryOptions({
    queryKey: ["reader", "knownLabelers", query, limit] as const,
    queryFn: async ({ pageParam }) =>
      getKnownLabelers({ data: { query, limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    staleTime: 5 * 60_000,
  });
}

function getLabelerQueryOptions(actor: string) {
  return queryOptions({
    queryKey: ["labeler", actor] as const,
    queryFn: async () => getLabeler({ data: { actor } }),
    enabled: actor.length > 0,
  });
}

function getLabelerLabelsInfiniteQueryOptions(
  labeler: string,
  limit = LABEL_DEFINITIONS_PAGE_SIZE,
) {
  return infiniteQueryOptions({
    queryKey: ["labeler", labeler, "labelDefs", limit] as const,
    queryFn: async ({ pageParam }) =>
      getLabelerLabels({ data: { labeler, limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: labeler.length > 0,
    staleTime: 5 * 60_000,
  });
}

function getLabeledDocumentsInfiniteQueryOptions(
  labeler: string,
  limit = LABELED_DOCUMENTS_PAGE_SIZE,
) {
  return infiniteQueryOptions({
    queryKey: ["labeler", labeler, "documents", limit] as const,
    queryFn: async ({ pageParam }) =>
      getLabeledDocuments({ data: { labeler, limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: labeler.length > 0,
  });
}

function getLabeledAccountsInfiniteQueryOptions(
  labeler: string,
  limit = LABELED_DOCUMENTS_PAGE_SIZE,
) {
  return infiniteQueryOptions({
    queryKey: ["labeler", labeler, "accounts", limit] as const,
    queryFn: async ({ pageParam }) =>
      getLabeledAccounts({ data: { labeler, limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: labeler.length > 0,
  });
}

function getDocumentLabelsQueryOptions(uri: string) {
  return queryOptions({
    queryKey: ["labels", uri] as const,
    queryFn: async () => getDocumentLabels({ data: { uri } }),
    enabled: uri.length > 0,
    staleTime: 60_000,
  });
}

function getAccountLabelsQueryOptions(did: string, readerScope = "guest") {
  return queryOptions({
    queryKey: ["labels", "account", readerScope, did] as const,
    queryFn: async () => getAccountLabels({ data: { did } }),
    enabled: did.length > 0,
    staleTime: 60_000,
  });
}

function setLabelerPrefMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "setLabelerPref"] as const,
    mutationFn: async (input: z.input<typeof setPrefInput>) =>
      setLabelerPref({ data: input }),
  });
}

function setLabelerEnabledMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "setLabelerEnabled"] as const,
    mutationFn: async (input: { labeler: string; enabled: boolean }) =>
      setLabelerEnabled({ data: input }),
  });
}

function subscribeLabelerMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "subscribeLabeler"] as const,
    mutationFn: async (labeler: string) =>
      subscribeLabeler({ data: { labeler } }),
  });
}

function unsubscribeLabelerMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "unsubscribeLabeler"] as const,
    mutationFn: async (labeler: string) =>
      unsubscribeLabeler({ data: { labeler } }),
  });
}

export const labelerApi = {
  getLabelers,
  getLabelersQueryOptions,
  getKnownLabelers,
  getKnownLabelersInfiniteQueryOptions,
  getLabeler,
  getLabelerQueryOptions,
  getLabelerLabels,
  getLabelerLabelsInfiniteQueryOptions,
  getLabeledDocuments,
  getLabeledDocumentsInfiniteQueryOptions,
  getLabeledAccounts,
  getLabeledAccountsInfiniteQueryOptions,
  getDocumentLabels,
  getDocumentLabelsQueryOptions,
  getAccountLabels,
  getAccountLabelsQueryOptions,
  subscribeLabeler,
  subscribeLabelerMutationOptions,
  unsubscribeLabeler,
  unsubscribeLabelerMutationOptions,
  setLabelerPref,
  setLabelerPrefMutationOptions,
  setLabelerEnabled,
  setLabelerEnabledMutationOptions,
};
