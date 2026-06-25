import type { LabelValueDef } from "#/server/labeler/resolve.server";

import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import {
  deleteLabelerSubscriptionRecord,
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
  subscribedLabelerDids,
} from "#/server/labeler/labels.server";
import {
  resolveActorDid,
  resolveLabelerView,
} from "#/server/labeler/resolve.server";
import { observe } from "#/server/observability/log";
import { selectArticleCardsByUris } from "#/server/reader/queries";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { ArticleCard, Db, Schema } from "./api-shapes";

import { dbMiddleware } from "./db-middleware";

/**
 * Labeler subscriptions (`app.standard-reader.labelerSubscription`). A labeler is
 * just a DID; we discover it the standard way (DID document → `#atproto_labeler`
 * service → descriptor). Subscriptions are records in the reader's own repo,
 * mirrored into the read-model so label lookups don't need a repo read.
 */

export type { LabelValueDef };

export interface LabelerCard {
  did: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  labelValueDefinitions?: Array<LabelValueDef>;
}

/** A labeler in the directory, with the caller's subscription state. */
export interface LabelerListItem extends LabelerCard {
  subscribed: boolean;
  subscriberCount: number;
}

export type LabelVisibility = "ignore" | "warn" | "hide";
export interface LabelPref {
  val: string;
  visibility: LabelVisibility;
}

export interface DocumentLabel {
  src: string;
  val: string;
  visibility: LabelVisibility;
}

const actorInput = z.object({ actor: z.string().trim().min(1) });
const labelerInput = z.object({ labeler: z.string().trim().min(1) });
const uriInput = z.object({ uri: z.string().trim().min(1) });
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
): Promise<{ prefs: Array<LabelPref>; createdAt: string | null }> {
  const ls = schema.labelerSubscriptions;
  const [row] = await db
    .select({ prefs: ls.prefs, createdAt: ls.createdAt })
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

const getKnownLabelers = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("labelers.getKnownLabelers", async ({ context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      const subscribed = session
        ? await subscribedLabelerDids(context.db, context.schema, session.did)
        : [];
      const subSet = new Set(subscribed);
      const ls = context.schema.labelerSubscriptions;
      const countRows = await context.db
        .select({
          labelerDid: ls.labelerDid,
          subscriberCount: sql<number>`count(*)::int`,
        })
        .from(ls)
        .where(eq(ls.deleted, false))
        .groupBy(ls.labelerDid);
      const countByDid = new Map(
        countRows.map((row) => [row.labelerDid, row.subscriberCount]),
      );

      // The registered labelers (records indexed off the network).
      const svc = context.schema.labelerServices;
      const rows = await context.db
        .select()
        .from(svc)
        .where(eq(svc.deleted, false));
      span.set("count", rows.length);

      return rows
        .map(
          (row): LabelerListItem => ({
            did: row.labelerDid,
            displayName: row.displayName ?? undefined,
            description: row.description ?? undefined,
            avatar: row.avatarUrl ?? undefined,
            labelValueDefinitions:
              (row.labelValueDefinitions as Array<LabelValueDef> | null) ??
              undefined,
            subscribed: subSet.has(row.labelerDid),
            subscriberCount: countByDid.get(row.labelerDid) ?? 0,
          }),
        )
        .toSorted(
          (a, b) => b.subscriberCount - a.subscriberCount,
        ) satisfies Array<LabelerListItem>;
    }),
  );

const getLabeler = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(actorInput)
  .handler(
    observe("labelers.getLabeler", async ({ data, context }, span) => {
      span.set("actor", data.actor);
      const did = await resolveActorDid(data.actor);
      if (!did) return { labeler: null, subscribed: false };
      span.set("did", did);

      const session = await getAtprotoSessionForRequest(getRequest());
      const [view, prefsRow] = await Promise.all([
        resolveLabelerView(did),
        session
          ? readPrefs(context.db, context.schema, session.did, did)
          : Promise.resolve({ prefs: [] as Array<LabelPref>, createdAt: null }),
      ]);
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
        labeler: (view ?? { did }) as LabelerCard,
        subscribed,
        prefs: prefsRow.prefs,
      };
    }),
  );

const setLabelerPref = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(setPrefInput)
  .handler(
    observe("labelers.setPref", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to manage labelers.");
      span.set("did", session.did);
      span.set("labeler", data.labeler);
      span.set("val", data.val);

      const { prefs, createdAt } = await readPrefs(
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

      const { uri, cid } = await putLabelerSubscriptionRecord(
        session.client,
        session.did,
        data.labeler,
        when,
        next,
      );
      await upsertLabelerSubscription(
        uri,
        session.did,
        subjectRkey(data.labeler),
        cid,
        { labeler: data.labeler, labels: next, createdAt: when },
      );
      return { ok: true as const, prefs: next };
    }),
  );

const getLabeledDocuments = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(labelerInput)
  .handler(
    observe("labelers.getLabeledDocuments", async ({ data, context }, span) => {
      span.set("labeler", data.labeler);
      const dl = context.schema.documentLabels;
      const rows = await context.db
        .select({ uri: dl.uri, val: dl.val, cts: dl.cts })
        .from(dl)
        .where(eq(dl.src, data.labeler));
      const labelsByUri: Record<string, Array<string>> = {};
      const uriLatest = new Map<string, string>();

      for (const row of rows) {
        if (!row.uri.includes("/site.standard.document/")) continue;
        const vals = labelsByUri[row.uri] ?? [];
        if (!vals.includes(row.val)) vals.push(row.val);
        labelsByUri[row.uri] = vals;
        const cts = row.cts ? row.cts.toISOString() : "";
        if ((uriLatest.get(row.uri) ?? "") < cts)
          uriLatest.set(row.uri, cts);
      }

      const uris = Object.keys(labelsByUri)
        .toSorted((a, b) =>
          (uriLatest.get(b) ?? "").localeCompare(uriLatest.get(a) ?? ""),
        )
        .slice(0, 60);
      const documents = await selectArticleCardsByUris(
        context.db,
        context.schema,
        uris,
        { lite: true },
      );
      span.set("count", documents.length);
      return {
        documents,
        labelsByUri,
      } satisfies {
        documents: Array<ArticleCard>;
        labelsByUri: Record<string, Array<string>>;
      };
    }),
  );

const getDocumentLabels = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(uriInput)
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

const subscribeLabeler = createServerFn({ method: "POST" })
  .inputValidator(labelerInput)
  .handler(
    observe("labelers.subscribe", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to subscribe to labelers.");
      span.set("did", session.did);
      span.set("labeler", data.labeler);

      const createdAt = new Date().toISOString();
      const { uri, cid } = await putLabelerSubscriptionRecord(
        session.client,
        session.did,
        data.labeler,
        createdAt,
      );
      await upsertLabelerSubscription(
        uri,
        session.did,
        subjectRkey(data.labeler),
        cid,
        { labeler: data.labeler, createdAt },
      );
      return { ok: true as const };
    }),
  );

const unsubscribeLabeler = createServerFn({ method: "POST" })
  .inputValidator(labelerInput)
  .handler(
    observe("labelers.unsubscribe", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to manage labelers.");
      span.set("did", session.did);
      span.set("labeler", data.labeler);

      await deleteLabelerSubscriptionRecord(
        session.client,
        session.did,
        data.labeler,
      );
      await deleteRecord(
        buildAtUri(
          session.did,
          Collections.labelerSubscription,
          subjectRkey(data.labeler),
        ),
        Collections.labelerSubscription,
      );
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

function getKnownLabelersQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "knownLabelers"] as const,
    queryFn: async () => getKnownLabelers(),
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

function getLabeledDocumentsQueryOptions(labeler: string) {
  return queryOptions({
    queryKey: ["labeler", labeler, "documents"] as const,
    queryFn: async () => getLabeledDocuments({ data: { labeler } }),
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

function setLabelerPrefMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "setLabelerPref"] as const,
    mutationFn: async (input: z.input<typeof setPrefInput>) =>
      setLabelerPref({ data: input }),
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
  getKnownLabelersQueryOptions,
  getLabeler,
  getLabelerQueryOptions,
  getLabeledDocuments,
  getLabeledDocumentsQueryOptions,
  getDocumentLabels,
  getDocumentLabelsQueryOptions,
  subscribeLabeler,
  subscribeLabelerMutationOptions,
  unsubscribeLabeler,
  unsubscribeLabelerMutationOptions,
  setLabelerPref,
  setLabelerPrefMutationOptions,
};
