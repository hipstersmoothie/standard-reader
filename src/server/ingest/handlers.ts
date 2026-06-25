import {
  collectionManifestFromSources,
  parseCollectionManifest,
} from "#/lib/collections/manifest";
import { hasRenderableArticleBody } from "#/lib/document/renderable";
import { documentSearchText } from "#/lib/document/search-text";
import { isExcludedPublicationUrl } from "#/lib/publication/exclusions";
import {
  FETCHED_CONTENT_FORMATS,
  resolveFetchedContent,
} from "#/server/content/resolve";
import { resolveLeafletContent } from "#/server/leaflet/resolve";
import { resolvePcktContent } from "#/server/pckt/resolve";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type {
  BookmarkRecord,
  BskyProfileRecord,
  CollectionSidecarRecord,
  DocumentRecord,
  LabelerServiceRecord,
  LabelerSubscriptionRecord,
  PublicationRecord,
  PublicationThemeRecord,
  ReadRecord,
  RecommendRecord,
  SubscriptionRecord,
  TapIdentityPayload,
} from "../atproto/types.ts";

import { db } from "../../db/index.ts";
import {
  bookmarks,
  documentContributors,
  documents,
  labelerServices,
  labelerSubscriptions,
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
  resolveIdentity,
} from "../atproto/identity.ts";
import {
  Collections,
  buildAtUri,
  didFromAtUri,
  isAtUri,
  parseAtUri,
} from "../atproto/uri.ts";
import {
  buildCanonicalUrl,
  cleanOptional,
  flattenTheme,
  normalizePublicationUrl,
  parseDate,
  sanitizeJson,
  stripNullBytes,
} from "./mappers.ts";
import { ensureTracked } from "./tap-client.ts";

/**
 * Enforce one canonical publication per `(did, url)`: the record with the
 * greatest rkey (newest TID) survives; older same-site records are hidden
 * (`deleted = true`) and their documents and subscriptions repointed to the
 * survivor so they stay visible. Publishers sometimes re-create their
 * publication record (new rkey, same url) and *both* records persist in the
 * repo, so tap re-delivers both and a DB unique constraint would just wedge
 * ingest — we keep the read-model deduped instead. URL matching is
 * trailing-slash-insensitive: re-created records show up as `https://x.com/`
 * vs `https://x.com`, and exact matching left both live with documents split
 * between them. Idempotent; safe to call from the hot path and the recompute
 * sweep. (Repo deletes hard-delete publication rows, so `deleted` is free to
 * mean "superseded duplicate" here.)
 */
export async function reconcilePublicationGroup(
  did: string,
  url: string,
): Promise<void> {
  const normalizedUrl = normalizePublicationUrl(url);
  const rows = await db
    .select({ uri: publications.uri, rkey: publications.rkey })
    .from(publications)
    .where(
      and(
        eq(publications.did, did),
        sql`rtrim(${publications.url}, '/') = ${normalizedUrl}`,
      ),
    );
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
    .update(subscriptions)
    .set({ publicationUri: canonical.uri, updatedAt: sql`now()` })
    .where(inArray(subscriptions.publicationUri, losers));
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

  const url = normalizePublicationUrl(record.url);

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
    url,
    description: cleanOptional(record.description),
    iconCid,
    iconMime: record.icon?.mimeType ?? null,
    iconUrl,
    ...theme,
    themeJson: sanitizeJson(record.basicTheme),
    showInDiscover:
      (record.preferences?.showInDiscover ?? true) &&
      !isExcludedPublicationUrl(url),
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
  await db
    .update(documents)
    .set({
      publicationUri: uri,
      canonicalUrl: sql`${url} || case when ${documents.path} is null then '' when left(${documents.path}, 1) = '/' then ${documents.path} else '/' || ${documents.path} end`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        isNull(documents.publicationUri),
        or(
          eq(documents.siteUri, uri),
          eq(documents.siteUri, record.url),
          eq(documents.siteUri, url),
          eq(documents.siteUri, `${url}/`),
        ),
      ),
    );

  // Duplicate `(did, url)` publications are collapsed by the recompute sweep
  // (`dedupeRecords`), not on the hot path: the read-modify-write contends on
  // shared rows under concurrent ingest and isn't time-critical.
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
      .where(
        sql`rtrim(${publications.url}, '/') = ${normalizePublicationUrl(site)}`,
      )
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
  if (FETCHED_CONTENT_FORMATS.includes(contentFormat ?? "") && contentJson) {
    const resolved = await resolveFetchedContent(
      contentFormat,
      contentJson,
      did,
      ownerPds,
    );
    contentJson = sanitizeJson(resolved.content);
    contentFormat = resolved.contentFormat;
  }
  const textContent = documentSearchText({
    textContent: cleanOptional(record.textContent),
    contentJson,
    contentFormat,
  });
  // Collection manifest: legacy extension on the document, or indexed earlier
  // from an `app.standard-reader.collection` sidecar at the same rkey.
  const legacyManifest = collectionManifestFromSources({
    legacyDocument: record,
  });
  let collectionManifest = legacyManifest;
  if (!collectionManifest) {
    const existing = await db
      .select({ collectionJson: documents.collectionJson })
      .from(documents)
      .where(eq(documents.uri, uri))
      .limit(1);
    collectionManifest =
      (existing[0]?.collectionJson as ReturnType<
        typeof parseCollectionManifest
      >) ?? null;
  }
  const renderableBody =
    collectionManifest != null ||
    hasRenderableArticleBody({
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
    collectionJson: collectionManifest,
    hasRenderableBody: renderableBody,
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

  // Identical-content `(did, cid)` duplicates are collapsed by the recompute
  // sweep (`dedupeRecords`), not on the hot path (see upsertPublication).
  await ensureTracked(did, "document");
}

const LEAFLET_PUBLICATION_NSID = "pub.leaflet.publication";

/**
 * Map a `pub.leaflet.publication` reference to its `site.standard.publication`
 * twin. Leaflet's standard.site migration dual-writes both records under the
 * same rkey, but older subscription records still point at the leaflet URI,
 * which matches no documents in our read model (documents only ever carry
 * site.standard publication URIs).
 */
function normalizePublicationRef(ref: string): string {
  const parsed = parseAtUri(ref);
  if (parsed?.collection === LEAFLET_PUBLICATION_NSID) {
    return buildAtUri(parsed.did, Collections.publication, parsed.rkey);
  }
  return ref;
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
  const publicationUri = normalizePublicationRef(record.publication);
  const publicationDid = didFromAtUri(publicationUri);

  const values = {
    uri,
    cid: cid ?? null,
    subscriberDid: did,
    rkey,
    publicationUri,
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

export async function upsertLabelerSubscription(
  uri: string,
  did: string,
  rkey: string,
  cid: string | undefined,
  record: LabelerSubscriptionRecord,
): Promise<void> {
  if (typeof record.labeler !== "string") {
    return;
  }
  const prefs = Array.isArray(record.labels)
    ? record.labels.filter(
        (p): p is { val: string; visibility: "ignore" | "warn" | "hide" } =>
          typeof p?.val === "string" &&
          (p.visibility === "ignore" ||
            p.visibility === "warn" ||
            p.visibility === "hide"),
      )
    : null;

  const values = {
    uri,
    cid: cid ?? null,
    subscriberDid: did,
    rkey,
    labelerDid: record.labeler,
    prefs,
    createdAt: parseDate(record.createdAt),
    deleted: false,
    updatedAt: sql`now()`,
  };

  await db
    .insert(labelerSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: labelerSubscriptions.uri, set: values });

  // The labeler itself is an external (often did:web) service we don't track via
  // tap; only keep the subscribing reader's repo tracked.
  await ensureTracked(did, "reader");
}

/**
 * `app.standard-reader.labeler.service` — a labeler registered by its owner
 * (the record author). Drives the Labelers directory + where to query labels.
 * The avatar blob lives in the owner's repo, so resolve it via the owner's PDS.
 */
export async function upsertLabelerService(
  uri: string,
  did: string,
  rkey: string,
  cid: string | undefined,
  record: LabelerServiceRecord,
): Promise<void> {
  if (
    typeof record.did !== "string" ||
    typeof record.serviceEndpoint !== "string"
  ) {
    return;
  }

  const owner = getCachedIdentity(did);
  const ownerPds = await authorPds(did, owner?.pds ?? null);
  const avatarBlobCid = blobCid(record.avatar);
  const avatarUrl =
    avatarBlobCid && ownerPds ? getBlobUrl(ownerPds, did, avatarBlobCid) : null;
  const labelValueDefinitions = Array.isArray(
    record.policies?.labelValueDefinitions,
  )
    ? record.policies.labelValueDefinitions
    : null;

  const values = {
    uri,
    cid: cid ?? null,
    ownerDid: did,
    rkey,
    labelerDid: record.did,
    serviceEndpoint: record.serviceEndpoint,
    displayName: cleanOptional(record.displayName),
    description: cleanOptional(record.description),
    avatarUrl,
    labelValueDefinitions,
    createdAt: parseDate(record.createdAt),
    deleted: false,
    updatedAt: sql`now()`,
  };

  await db
    .insert(labelerServices)
    .values(values)
    .onConflictDoUpdate({ target: labelerServices.uri, set: values });

  await ensureTracked(did, "manual");
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

export async function upsertBookmark(
  uri: string,
  did: string,
  rkey: string,
  cid: string | undefined,
  record: BookmarkRecord,
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
    .insert(bookmarks)
    .values(values)
    .onConflictDoUpdate({ target: bookmarks.uri, set: values });

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

/** Index an `app.standard-reader.collection` sidecar onto its document row. */
export async function upsertCollectionSidecar(
  did: string,
  rkey: string,
  record: CollectionSidecarRecord,
): Promise<void> {
  const manifest = parseCollectionManifest(record);
  if (!manifest) return;

  const documentUri =
    typeof record.document === "string" ? record.document : null;
  const where = documentUri
    ? or(
        eq(documents.uri, documentUri),
        and(eq(documents.did, did), eq(documents.rkey, rkey)),
      )
    : and(eq(documents.did, did), eq(documents.rkey, rkey));

  await db
    .update(documents)
    .set({
      collectionJson: manifest,
      hasRenderableBody: true,
      updatedAt: sql`now()`,
    })
    .where(where);
}

/** Merge `app.standard-reader.publicationTheme` fonts into a publication row. */
export async function upsertPublicationTheme(
  did: string,
  rkey: string,
  record: PublicationThemeRecord,
): Promise<void> {
  const publicationUri =
    typeof record.publication === "string" ? record.publication : null;
  const where = publicationUri
    ? eq(publications.uri, publicationUri)
    : and(eq(publications.did, did), eq(publications.rkey, rkey));

  const existing = await db
    .select({ themeJson: publications.themeJson })
    .from(publications)
    .where(where)
    .limit(1);
  const base =
    existing[0]?.themeJson && typeof existing[0].themeJson === "object"
      ? (existing[0].themeJson as Record<string, unknown>)
      : {};
  const fonts =
    record.fonts && typeof record.fonts === "object" ? record.fonts : undefined;

  await db
    .update(publications)
    .set({
      themeJson: sanitizeJson({
        ...base,
        ...(fonts ? { fonts } : {}),
      }),
      updatedAt: sql`now()`,
    })
    .where(where);
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
    case Collections.labelerSubscription: {
      await db
        .delete(labelerSubscriptions)
        .where(eq(labelerSubscriptions.uri, uri));
      return;
    }
    case Collections.labelerService: {
      await db.delete(labelerServices).where(eq(labelerServices.uri, uri));
      return;
    }
    case Collections.read: {
      await db.delete(reads).where(eq(reads.uri, uri));
      return;
    }
    case Collections.bookmark: {
      await db.delete(bookmarks).where(eq(bookmarks.uri, uri));
      return;
    }
    case Collections.collection: {
      const parsed = parseAtUri(uri);
      if (!parsed) return;
      await db
        .update(documents)
        .set({ collectionJson: null, updatedAt: sql`now()` })
        .where(
          and(eq(documents.did, parsed.did), eq(documents.rkey, parsed.rkey)),
        );
      return;
    }
    case Collections.publicationTheme: {
      const parsed = parseAtUri(uri);
      if (!parsed) return;
      const existing = await db
        .select({ uri: publications.uri, themeJson: publications.themeJson })
        .from(publications)
        .where(
          and(
            eq(publications.did, parsed.did),
            eq(publications.rkey, parsed.rkey),
          ),
        )
        .limit(1);
      const row = existing[0];
      if (!row?.themeJson || typeof row.themeJson !== "object") return;
      const { fonts: _fonts, ...rest } = row.themeJson as Record<
        string,
        unknown
      >;
      await db
        .update(publications)
        .set({ themeJson: sanitizeJson(rest), updatedAt: sql`now()` })
        .where(eq(publications.uri, row.uri));
      return;
    }
    default: {
      // Unknown / profile deletes: nothing to remove from the read-model.
      return;
    }
  }
}

const SUBSCRIPTION_LIST_PAGE = 100;
const SUBSCRIPTION_FETCH_TIMEOUT_MS = 8000;

/**
 * Pull a reader repo's subscription records straight from its PDS into Neon.
 * Used when tap backfill lags behind a follow, or to hydrate repos that were
 * tracked before tap registration succeeded.
 */
export async function backfillSubscriptionsFromRepo(
  did: string,
): Promise<number> {
  const identity = await resolveIdentity(did);
  if (!identity.pds) {
    return 0;
  }

  let count = 0;
  let cursor: string | undefined;

  try {
    do {
      const url = new URL("/xrpc/com.atproto.repo.listRecords", identity.pds);
      url.searchParams.set("repo", did);
      url.searchParams.set("collection", Collections.subscription);
      url.searchParams.set("limit", String(SUBSCRIPTION_LIST_PAGE));
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const res = await fetch(url, {
        signal: AbortSignal.timeout(SUBSCRIPTION_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        break;
      }

      const body = (await res.json()) as {
        cursor?: string;
        records?: Array<{
          cid?: string;
          uri: string;
          value?: SubscriptionRecord;
        }>;
      };

      for (const record of body.records ?? []) {
        const rkey = record.uri.slice(record.uri.lastIndexOf("/") + 1);
        if (!record.value) {
          continue;
        }
        await upsertSubscription(
          record.uri,
          did,
          rkey,
          record.cid,
          record.value,
        );
        count += 1;
      }

      cursor =
        (body.records?.length ?? 0) === SUBSCRIPTION_LIST_PAGE
          ? body.cursor
          : undefined;
    } while (cursor);
  } catch (error: unknown) {
    console.warn(`[ingest] subscription backfill failed for ${did}`, error);
  }

  return count;
}
