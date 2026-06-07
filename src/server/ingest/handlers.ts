import { documentSearchText } from "#/lib/document/search-text";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { GREENGALE_CONTENT_REF } from "#/lib/greengale/types";
import { isExcludedPublicationUrl } from "#/lib/publication/exclusions";
import { resolveGreengaleContent } from "#/server/greengale/resolve";
import { resolveLeafletContent } from "#/server/leaflet/resolve";
import { resolvePcktContent } from "#/server/pckt/resolve";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type {
  BskyProfileRecord,
  DocumentRecord,
  PublicationRecord,
  ReadRecord,
  RecommendRecord,
  SubscriptionRecord,
  TapIdentityPayload,
} from "../atproto/types.ts";

import { db } from "../../db/index.ts";
import {
  documentContributors,
  documents,
  profiles,
  publicationStats,
  publications,
  reads,
  recommends,
  subscriptions,
} from "../../db/schema.ts";
import { blobCid, bskyImageUrl, getBlobUrl } from "../atproto/blob.ts";
import {
  authorPds,
  getCachedIdentity,
  primeIdentityHandle,
} from "../atproto/identity.ts";
import {
  Collections,
  didFromAtUri,
  isAtUri,
  parseAtUri,
} from "../atproto/uri.ts";
import {
  buildCanonicalUrl,
  cleanOptional,
  flattenTheme,
  parseDate,
  sanitizeJson,
  stripNullBytes,
} from "./mappers.ts";
import { ensureTracked } from "./tap-client.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Enforce one canonical publication per `(did, url)`: the record with the
 * greatest rkey (newest TID) survives; older same-site records are hidden
 * (`deleted = true`) and their documents repointed to the survivor so they stay
 * visible. Publishers sometimes re-create their publication record (new rkey,
 * same url) and *both* records persist in the repo, so tap re-delivers both and
 * a DB unique constraint would just wedge ingest — we keep the read-model
 * deduped instead. Idempotent; safe to call from the hot path and the recompute
 * sweep. (Repo deletes hard-delete publication rows, so `deleted` is free to
 * mean "superseded duplicate" here.)
 */
export async function reconcilePublicationGroup(
  did: string,
  url: string,
): Promise<void> {
  const rows = await db
    .select({ uri: publications.uri, rkey: publications.rkey })
    .from(publications)
    .where(and(eq(publications.did, did), eq(publications.url, url)));
  if (rows.length <= 1) {
    return;
  }
  let canonical = rows[0];
  for (const row of rows) {
    if (row.rkey > canonical.rkey) {
      canonical = row;
    }
  }
  const losers = rows
    .filter((row) => row.uri !== canonical.uri)
    .map((row) => row.uri);
  if (losers.length === 0) {
    return;
  }
  await db
    .update(documents)
    .set({ publicationUri: canonical.uri, updatedAt: sql`now()` })
    .where(inArray(documents.publicationUri, losers));
  await db
    .update(publications)
    .set({ deleted: true, updatedAt: sql`now()` })
    .where(inArray(publications.uri, losers));
  await db
    .update(publications)
    .set({ deleted: false })
    .where(eq(publications.uri, canonical.uri));
}

/**
 * Enforce one canonical document per `(did, cid)`: identical-content records
 * (same CID, different rkey — a re-published duplicate) collapse to the newest
 * rkey; older copies are hidden. We dedup on CID rather than path/canonical_url
 * because distinct articles legitimately share a path (e.g. a publisher that
 * sets every post's path to `/posts/index`), so collapsing on path would delete
 * real content. Soft-deleting keeps the loser row, so reader activity that
 * references it stays referentially valid (and drops out of `deleted = false`
 * joins). Idempotent.
 */
export async function reconcileDocumentDup(
  did: string,
  cid: string | null | undefined,
): Promise<void> {
  if (!cid) {
    return;
  }
  const rows = await db
    .select({ uri: documents.uri, rkey: documents.rkey })
    .from(documents)
    .where(and(eq(documents.did, did), eq(documents.cid, cid)));
  if (rows.length <= 1) {
    return;
  }
  let canonical = rows[0];
  for (const row of rows) {
    if (row.rkey > canonical.rkey) {
      canonical = row;
    }
  }
  const losers = rows
    .filter((row) => row.uri !== canonical.uri)
    .map((row) => row.uri);
  if (losers.length === 0) {
    return;
  }
  await db
    .update(documents)
    .set({ deleted: true, updatedAt: sql`now()` })
    .where(inArray(documents.uri, losers));
  await db
    .update(documents)
    .set({ deleted: false })
    .where(eq(documents.uri, canonical.uri));
}

/** Ensure a minimal profile row exists for a DID we'll show in the UI. */
async function ensureProfileStub(
  did: string,
  handle?: string | null,
): Promise<void> {
  await db
    .insert(profiles)
    .values({ did, handle: handle ?? null })
    .onConflictDoNothing({ target: profiles.did });
}

export async function upsertPublication(
  uri: string,
  did: string,
  rkey: string,
  cid: string | undefined,
  record: PublicationRecord,
): Promise<void> {
  // Required lexicon fields; skip malformed records rather than crash.
  if (typeof record.url !== "string" || typeof record.name !== "string") {
    return;
  }

  const owner = getCachedIdentity(did);
  const ownerPds = await authorPds(did, owner?.pds ?? null);
  const iconCid = blobCid(record.icon);
  const iconUrl =
    iconCid && ownerPds ? getBlobUrl(ownerPds, did, iconCid) : null;
  const theme = flattenTheme(record.basicTheme);

  await ensureProfileStub(did, owner?.handle);

  const values = {
    uri,
    cid: cid ?? null,
    did,
    rkey,
    name: stripNullBytes(record.name),
    url: stripNullBytes(record.url),
    description: cleanOptional(record.description),
    iconCid,
    iconMime: record.icon?.mimeType ?? null,
    iconUrl,
    ...theme,
    themeJson: sanitizeJson(record.basicTheme),
    showInDiscover:
      (record.preferences?.showInDiscover ?? true) &&
      !isExcludedPublicationUrl(record.url),
    deleted: false,
    updatedAt: sql`now()`,
  };

  await db
    .insert(publications)
    .values(values)
    .onConflictDoUpdate({ target: publications.uri, set: values });

  // Keep a 1:1 stats row so directory/feed joins are clean.
  await db
    .insert(publicationStats)
    .values({ publicationUri: uri })
    .onConflictDoNothing({ target: publicationStats.publicationUri });

  // Reconcile documents that referenced this publication (by at-uri or base
  // URL) before it was indexed: attach them and backfill their canonical URL.
  const trimmedUrl = record.url.replace(/\/+$/, "");
  await db
    .update(documents)
    .set({
      publicationUri: uri,
      canonicalUrl: sql`${trimmedUrl} || case when ${documents.path} is null then '' when left(${documents.path}, 1) = '/' then ${documents.path} else '/' || ${documents.path} end`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        isNull(documents.publicationUri),
        or(
          eq(documents.siteUri, uri),
          eq(documents.siteUri, record.url),
          eq(documents.siteUri, trimmedUrl),
        ),
      ),
    );

  // Collapse any older same-site publication record to this canonical one.
  await reconcilePublicationGroup(did, values.url);

  await ensureTracked(did, "publication");
}

export async function upsertDocument(
  uri: string,
  did: string,
  rkey: string,
  cid: string | undefined,
  record: DocumentRecord,
): Promise<void> {
  // Required lexicon fields; skip malformed records.
  if (typeof record.site !== "string" || typeof record.title !== "string") {
    return;
  }
  const site = stripNullBytes(record.site);

  // Resolve the owning publication + its base URL (for the canonical link).
  let publicationUri: string | null = null;
  let publicationBaseUrl: string | null = null;
  if (isAtUri(site)) {
    const parsed = parseAtUri(site);
    if (parsed?.collection === Collections.publication) {
      publicationUri = site;
      const found = await db
        .select({ url: publications.url })
        .from(publications)
        .where(eq(publications.uri, site))
        .limit(1);
      publicationBaseUrl = found[0]?.url ?? null;
    }
  } else {
    const found = await db
      .select({ uri: publications.uri, url: publications.url })
      .from(publications)
      .where(eq(publications.url, site))
      .limit(1);
    if (found[0]) {
      publicationUri = found[0].uri;
      publicationBaseUrl = found[0].url;
    }
  }

  const base = publicationBaseUrl ?? (isAtUri(site) ? null : site);
  const canonicalUrl = buildCanonicalUrl(base, cleanOptional(record.path));

  const owner = getCachedIdentity(did);
  const ownerPds = await authorPds(did, owner?.pds ?? null);
  const coverCid = blobCid(record.coverImage);
  const coverImageUrl =
    coverCid && ownerPds ? getBlobUrl(ownerPds, did, coverCid) : null;

  const publishedAt =
    parseDate(record.publishedAt) ?? parseDate(record.updatedAt) ?? new Date();

  await ensureProfileStub(did, owner?.handle);

  let contentJson = sanitizeJson(record.content);
  let contentFormat = cleanOptional(record.content?.$type);
  if (contentFormat === "pub.leaflet.content" && contentJson) {
    contentJson = sanitizeJson(
      await resolveLeafletContent(contentJson, did, ownerPds),
    );
  }
  if (contentFormat === "blog.pckt.content" && contentJson) {
    contentJson = sanitizeJson(
      await resolvePcktContent(contentJson, did, ownerPds),
    );
  }
  if (contentFormat === GREENGALE_CONTENT_REF && contentJson) {
    contentJson = sanitizeJson(
      await resolveGreengaleContent(contentJson, did, ownerPds),
    );
    if (
      isRecord(contentJson) &&
      contentJson.$type === STANDARD_MARKDOWN_CONTENT
    ) {
      contentFormat = STANDARD_MARKDOWN_CONTENT;
    }
  }
  const textContent = documentSearchText({
    textContent: cleanOptional(record.textContent),
    contentJson,
    contentFormat,
  });

  const values = {
    uri,
    cid: cid ?? null,
    did,
    rkey,
    title: stripNullBytes(record.title),
    siteUri: site,
    publicationUri,
    path: cleanOptional(record.path),
    canonicalUrl,
    description: cleanOptional(record.description),
    textContent,
    contentJson,
    contentFormat,
    coverImageCid: coverCid,
    coverImageMime: record.coverImage?.mimeType ?? null,
    coverImageUrl,
    tags: Array.isArray(record.tags)
      ? record.tags
          .filter((t) => typeof t === "string")
          .map((t) => stripNullBytes(t))
      : null,
    bskyPostUri: record.bskyPostRef?.uri ?? null,
    bskyPostCid: record.bskyPostRef?.cid ?? null,
    publishedAt,
    recordUpdatedAt: parseDate(record.updatedAt),
    deleted: false,
    updatedAt: sql`now()`,
  };

  await db
    .insert(documents)
    .values(values)
    .onConflictDoUpdate({ target: documents.uri, set: values });

  // Replace contributor rows for this document.
  await db
    .delete(documentContributors)
    .where(eq(documentContributors.documentUri, uri));
  const contributors = Array.isArray(record.contributors)
    ? record.contributors
    : [];
  if (contributors.length > 0) {
    await db
      .insert(documentContributors)
      .values(
        contributors
          .filter((c) => typeof c.did === "string")
          .map((c) => ({
            documentUri: uri,
            did: c.did,
            role: cleanOptional(c.role),
            displayName: cleanOptional(c.displayName),
          })),
      )
      .onConflictDoNothing();
    for (const c of contributors) {
      if (typeof c.did !== "string") {
        continue;
      }
      await ensureProfileStub(c.did, null);
      await ensureTracked(c.did, "contributor");
    }
  }

  // Collapse any identical-content duplicate of this document.
  await reconcileDocumentDup(did, cid ?? null);

  await ensureTracked(did, "document");
}

export async function upsertSubscription(
  uri: string,
  did: string,
  rkey: string,
  cid: string | undefined,
  record: SubscriptionRecord,
): Promise<void> {
  if (typeof record.publication !== "string") {
    return;
  }
  const publicationDid = didFromAtUri(record.publication);

  const values = {
    uri,
    cid: cid ?? null,
    subscriberDid: did,
    rkey,
    publicationUri: record.publication,
    publicationDid,
    createdAt: parseDate(record.createdAt),
    deleted: false,
    updatedAt: sql`now()`,
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.uri, set: values });

  await ensureTracked(did, "subscriber");
  if (publicationDid) {
    await ensureTracked(publicationDid, "publication");
  }
}

export async function upsertRecommend(
  uri: string,
  did: string,
  rkey: string,
  cid: string | undefined,
  record: RecommendRecord,
): Promise<void> {
  if (typeof record.document !== "string") {
    return;
  }
  const documentDid = didFromAtUri(record.document);

  const values = {
    uri,
    cid: cid ?? null,
    recommenderDid: did,
    rkey,
    documentUri: record.document,
    documentDid,
    createdAt: parseDate(record.createdAt),
    deleted: false,
    updatedAt: sql`now()`,
  };

  await db
    .insert(recommends)
    .values(values)
    .onConflictDoUpdate({ target: recommends.uri, set: values });

  await ensureTracked(did, "recommender");
  if (documentDid) {
    await ensureTracked(documentDid, "document");
  }
}

export async function upsertRead(
  uri: string,
  did: string,
  rkey: string,
  cid: string | undefined,
  record: ReadRecord,
): Promise<void> {
  if (typeof record.subject !== "string") {
    return;
  }
  const documentDid = didFromAtUri(record.subject);

  const values = {
    uri,
    cid: cid ?? null,
    ownerDid: did,
    rkey,
    documentUri: record.subject,
    documentDid,
    createdAt: parseDate(record.createdAt),
    deleted: false,
    updatedAt: sql`now()`,
  };

  await db
    .insert(reads)
    .values(values)
    .onConflictDoUpdate({ target: reads.uri, set: values });

  await ensureTracked(did, "reader");
}

export async function upsertBskyProfile(
  uri: string,
  did: string,
  cid: string | undefined,
  record: BskyProfileRecord,
): Promise<void> {
  const avatarCid = blobCid(record.avatar);
  const bannerCid = blobCid(record.banner);

  const values = {
    did,
    displayName: cleanOptional(record.displayName),
    description: cleanOptional(record.description),
    avatarUrl: avatarCid ? bskyImageUrl("avatar", did, avatarCid) : null,
    bannerUrl: bannerCid ? bskyImageUrl("banner", did, bannerCid) : null,
    bskyProfileUri: uri,
    bskyProfileCid: cid ?? null,
    profileFetchedAt: sql`now()`,
    updatedAt: sql`now()`,
  };

  await db
    .insert(profiles)
    .values(values)
    .onConflictDoUpdate({ target: profiles.did, set: values });
}

export async function applyIdentity(
  payload: TapIdentityPayload,
): Promise<void> {
  if (payload.handle) {
    primeIdentityHandle(payload.did, payload.handle);
  }
  const isActive = payload.isActive ?? payload.status !== "deactivated";
  const values = {
    did: payload.did,
    handle: payload.handle ?? null,
    isActive,
    updatedAt: sql`now()`,
  };
  await db
    .insert(profiles)
    .values(values)
    .onConflictDoUpdate({
      target: profiles.did,
      set: {
        handle: values.handle,
        isActive: values.isActive,
        updatedAt: values.updatedAt,
      },
    });
}

/** Hard-delete a record row on a `delete` action (cascades clean up children). */
export async function deleteRecord(
  uri: string,
  collection: string,
): Promise<void> {
  switch (collection) {
    case Collections.publication: {
      await db.delete(publications).where(eq(publications.uri, uri));
      return;
    }
    case Collections.document: {
      await db.delete(documents).where(eq(documents.uri, uri));
      return;
    }
    case Collections.subscription: {
      await db.delete(subscriptions).where(eq(subscriptions.uri, uri));
      return;
    }
    case Collections.recommend: {
      await db.delete(recommends).where(eq(recommends.uri, uri));
      return;
    }
    case Collections.read: {
      await db.delete(reads).where(eq(reads.uri, uri));
      return;
    }
    default: {
      // Unknown / profile deletes: nothing to remove from the read-model.
      return;
    }
  }
}
