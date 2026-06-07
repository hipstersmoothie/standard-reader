import type { PublicationRecord } from "#/server/atproto/types";

import { isDid } from "@atcute/lexicons/syntax";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { blobCid, getBlobUrl } from "#/server/atproto/blob";
import { resolveIdentity } from "#/server/atproto/identity";
import { ensureTracked } from "#/server/ingest/tap-client";
import { observe } from "#/server/observability/log";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { ArticleCard, PublicationCard } from "./api-shapes";

import {
  articleCardColumns,
  publicationCardColumns,
  toArticleCard,
  toPublicationCard,
} from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

/**
 * Search (`APP_VISION.md` §5): full-text search over the read-model's GIN
 * `tsvector` columns (title, description, and body text derived from record
 * `textContent` plus structured content blocks), split into Publications and
 * Articles. Plus handle resolution for the Add/Follow modal — an AT Proto
 * handle/domain → publication preview, resolved from the read-model first
 * and falling back to the author's PDS (kicking off tap tracking) for
 * publications we haven't indexed yet.
 */

const PUBLIC_APPVIEW = "https://public.api.bsky.app";
const RESOLVE_TIMEOUT_MS = 5000;

const searchInput = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50).default(20),
});

const resolveInput = z.object({
  handle: z.string().trim().min(1).max(253),
});

export interface SearchResults {
  query: string;
  publications: Array<PublicationCard>;
  articles: Array<ArticleCard>;
}

export interface ResolvedPublicationPreview {
  did: string | null;
  handle: string | null;
  publications: Array<PublicationCard>;
  /** Where the previews came from: the read-model, the author's repo, or none. */
  source: "index" | "repo" | "none";
}

const search = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(searchInput)
  .handler(
    observe("search.query", async ({ data, context }, span) => {
      const { db, schema } = context;
      const p = schema.publications;
      const st = schema.publicationStats;
      const d = schema.documents;
      const pr = schema.profiles;
      span.set("q", data.q);

      const tsq = sql`websearch_to_tsquery('english', ${data.q})`;

      const [publicationRows, articleRows] = await Promise.all([
        db
          .select(publicationCardColumns(schema))
          .from(p)
          .leftJoin(st, eq(st.publicationUri, p.uri))
          .leftJoin(pr, eq(pr.did, p.did))
          .where(
            and(
              eq(p.deleted, false),
              eq(p.showInDiscover, true),
              sql`${p.searchVector} @@ ${tsq}`,
            ),
          )
          .orderBy(sql`ts_rank(${p.searchVector}, ${tsq}) desc`)
          .limit(data.limit),
        db
          .select(articleCardColumns(schema))
          .from(d)
          .leftJoin(p, eq(p.uri, d.publicationUri))
          .leftJoin(pr, eq(pr.did, p.did))
          .where(and(eq(d.deleted, false), sql`${d.searchVector} @@ ${tsq}`))
          .orderBy(sql`ts_rank(${d.searchVector}, ${tsq}) desc`)
          .limit(data.limit),
      ]);

      span.set("publications", publicationRows.length);
      span.set("articles", articleRows.length);
      return {
        query: data.q,
        publications: publicationRows.map((row) => toPublicationCard(row)),
        articles: articleRows.map((row) => toArticleCard(row)),
      } satisfies SearchResults;
    }),
  );

/** Normalize user input ("@alice.dev", "https://alice.dev/foo") to a handle. */
function normalizeHandle(input: string): string {
  let handle = input.trim();
  if (handle.startsWith("@")) {
    handle = handle.slice(1);
  }
  handle = handle.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return handle.toLowerCase();
}

/** Resolve a handle (or pass through a DID) to a DID, or null on failure. */
async function resolveToDid(handle: string): Promise<string | null> {
  if (isDid(handle)) {
    return handle;
  }
  try {
    const url = new URL(
      "/xrpc/com.atproto.identity.resolveHandle",
      PUBLIC_APPVIEW,
    );
    url.searchParams.set("handle", handle);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { did?: string };
    return body.did && isDid(body.did) ? body.did : null;
  } catch {
    return null;
  }
}

/** List a repo's `site.standard.publication` records straight from its PDS. */
async function listRepoPublications(
  pds: string,
  did: string,
): Promise<Array<PublicationCard>> {
  try {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", pds);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", STANDARD_NSID.publication);
    url.searchParams.set("limit", "20");
    const res = await fetch(url, {
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as {
      records?: Array<{ uri: string; value: PublicationRecord }>;
    };
    return (body.records ?? []).map((entry) => {
      const record = entry.value;
      const cid = blobCid(record.icon);
      return {
        uri: entry.uri,
        did,
        name: record.name ?? "Untitled publication",
        url: record.url ?? "",
        description: record.description ?? null,
        iconUrl: cid ? getBlobUrl(pds, did, cid) : null,
        ownerAvatarUrl: null,
        ownerHandle: null,
        topic: null,
        verified: false,
        subscriberCount: 0,
        documentCount: 0,
        lastDocumentAt: null,
      } satisfies PublicationCard;
    });
  } catch {
    return [];
  }
}

const resolvePublicationByHandle = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(resolveInput)
  .handler(
    observe(
      "search.resolveHandle",
      async ({ data, context }, span): Promise<ResolvedPublicationPreview> => {
        const { db, schema } = context;
        const wasDid = isDid(data.handle.trim());
        const handle = wasDid ? null : normalizeHandle(data.handle);
        const lookup = wasDid ? data.handle.trim() : (handle ?? data.handle);
        span.set("input", lookup);

        const did = await resolveToDid(lookup);
        if (!did) {
          span.set("resolved", false);
          return { did: null, handle, publications: [], source: "none" };
        }
        span.set("did", did);

        const p = schema.publications;
        const st = schema.publicationStats;
        const indexed = await db
          .select(publicationCardColumns(schema))
          .from(p)
          .leftJoin(st, eq(st.publicationUri, p.uri))
          .where(and(eq(p.did, did), eq(p.deleted, false)))
          .orderBy(sql`coalesce(${st.subscriberCount}, 0) desc`)
          .limit(20);

        if (indexed.length > 0) {
          span.set("source", "index");
          return {
            did,
            handle,
            publications: indexed.map((row) => toPublicationCard(row)),
            source: "index",
          };
        }

        // Not in our index yet: read straight from the author's repo and ask
        // tap to start tracking it so the read-model catches up.
        void ensureTracked(did, "manual").catch(() => {});
        const identity = await resolveIdentity(did);
        const publications = identity.pds
          ? await listRepoPublications(identity.pds, did)
          : [];

        span.set("source", publications.length > 0 ? "repo" : "none");
        return {
          did,
          handle: handle ?? identity.handle,
          publications,
          source: publications.length > 0 ? "repo" : "none",
        };
      },
    ),
  );

function searchQueryOptions({
  q = "",
  limit = 20,
}: { q?: string; limit?: number } = {}) {
  const trimmed = q.trim();
  return queryOptions({
    queryKey: ["search", trimmed, limit] as const,
    queryFn: async () => search({ data: { q: trimmed, limit } }),
    enabled: trimmed.length > 0,
  });
}

function resolvePublicationByHandleQueryOptions(handle: string) {
  const trimmed = handle.trim();
  return queryOptions({
    queryKey: ["resolve", "publication", trimmed] as const,
    queryFn: async () =>
      resolvePublicationByHandle({ data: { handle: trimmed } }),
    enabled: trimmed.length > 0,
  });
}

export const searchApi = {
  search,
  searchQueryOptions,
  resolvePublicationByHandle,
  resolvePublicationByHandleQueryOptions,
};
