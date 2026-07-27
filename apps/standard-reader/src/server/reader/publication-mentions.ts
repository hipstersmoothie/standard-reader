import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import { publicationDisplayName } from "#/integrations/tanstack-query/api-shapes";
import { isAppOriginHref } from "#/lib/app-origin";
import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
import type {
  ActorMentionMap,
  DocumentMentionMap,
  InlineMentionRefs,
  InlineMentions,
  PublicationMentionMap,
} from "#/lib/leaflet/publication-mentions";
import {
  mentionUrlKey,
  normalizeMentionUrl,
} from "#/lib/leaflet/publication-mentions";
import { getPublicUrl } from "#/lib/public-url";
import { cdnImageUrl } from "#/server/atproto/blob";

async function resolvePublications(
  db: Db,
  schema: Schema,
  atUris: Array<string>,
  urls: Array<string>,
): Promise<PublicationMentionMap> {
  const p = schema.publications;
  // A homepage `#link` pointing at our own app is app navigation, not a
  // third-party publication — drop it so a record carrying our domain as its
  // `url` isn't surfaced as that link's mention.
  const appOrigin = getPublicUrl();
  const normalizedUrls = [
    ...new Set(
      urls
        .filter((url) => !isAppOriginHref(url, appOrigin))
        .map((url) => normalizeMentionUrl(url)),
    ),
  ];

  const predicates = [];
  if (atUris.length > 0) predicates.push(inArray(p.uri, atUris));
  if (normalizedUrls.length > 0) {
    // Stored `url` is normalized on ingest; `rtrim` guards legacy slash variants.
    predicates.push(inArray(sql`rtrim(${p.url}, '/')`, normalizedUrls));
  }
  if (predicates.length === 0) return {};

  const rows = await db
    .select({
      uri: p.uri,
      did: p.did,
      rkey: p.rkey,
      name: p.name,
      url: p.url,
      iconCid: p.iconCid,
    })
    .from(p)
    .where(and(eq(p.deleted, false), or(...predicates)));

  const map: PublicationMentionMap = {};
  for (const row of rows) {
    const mention = {
      atUri: row.uri,
      did: row.did,
      rkey: row.rkey,
      name: publicationDisplayName(row.name, row.url),
      // Icons may carry alpha (square logos on themed backgrounds); keep PNG.
      iconUrl: row.iconCid ? cdnImageUrl(row.did, row.iconCid, "png") : null,
    };
    map[row.uri] = mention;
    map[mentionUrlKey(row.url)] = mention;
  }
  return map;
}

async function resolveDocuments(
  db: Db,
  schema: Schema,
  atUris: Array<string>,
): Promise<DocumentMentionMap> {
  if (atUris.length === 0) return {};
  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const rows = await db
    .select({
      uri: d.uri,
      did: d.did,
      rkey: d.rkey,
      title: d.title,
      pubDid: p.did,
      pubIconCid: p.iconCid,
      ownerAvatarUrl: pr.avatarUrl,
    })
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(eq(d.deleted, false), inArray(d.uri, atUris)));

  const map: DocumentMentionMap = {};
  for (const row of rows) {
    map[row.uri] = {
      atUri: row.uri,
      did: row.did,
      rkey: row.rkey,
      title: row.title,
      iconUrl:
        row.pubIconCid && row.pubDid
          ? cdnImageUrl(row.pubDid, row.pubIconCid, "png")
          : row.ownerAvatarUrl,
    };
  }
  return map;
}

async function resolveActors(
  db: Db,
  schema: Schema,
  dids: Array<string>,
): Promise<ActorMentionMap> {
  if (dids.length === 0) return {};
  const pr = schema.profiles;
  const rows = await db
    .select({ did: pr.did, handle: pr.handle, avatarUrl: pr.avatarUrl })
    .from(pr)
    .where(inArray(pr.did, dids));

  const map: ActorMentionMap = {};
  for (const row of rows) {
    map[row.did] = {
      did: row.did,
      handle: row.handle,
      avatarUrl: row.avatarUrl,
    };
  }

  // Mentions can target any atproto account, not just ones this reader has
  // indexed (e.g. `@bsky.app`). Fall back to the public Bluesky profile for
  // DIDs we don't have locally so the mention chip still gets a handle + avatar.
  const missing = dids.filter((did) => !map[did]);
  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (did) => {
        const profile = await fetchBlueskyPublicProfileFields(did);
        if (!profile) return;
        map[did] = {
          did,
          handle: profile.handle,
          avatarUrl: profile.avatarUrl,
        };
      }),
    );
  }

  return map;
}

/**
 * Resolve `#link` facets that point at a user profile (in-app `/u/…` or a
 * Bluesky profile/post) to actor identity + avatar, so they render as avatar
 * chips. Idents may be DIDs or handles; the returned map is keyed by whichever
 * the link carried (and also by DID) so the renderer can look up either.
 */
async function resolveActorLinks(
  db: Db,
  schema: Schema,
  idents: Array<string>,
): Promise<ActorMentionMap> {
  if (idents.length === 0) return {};
  const pr = schema.profiles;
  const dids = idents.filter((ident) => ident.startsWith("did:"));
  const handles = idents.filter((ident) => !ident.startsWith("did:"));

  const predicates = [];
  if (dids.length > 0) predicates.push(inArray(pr.did, dids));
  if (handles.length > 0) predicates.push(inArray(pr.handle, handles));
  if (predicates.length === 0) return {};

  const rows = await db
    .select({ did: pr.did, handle: pr.handle, avatarUrl: pr.avatarUrl })
    .from(pr)
    .where(or(...predicates));

  const map: ActorMentionMap = {};
  for (const row of rows) {
    const entry = {
      did: row.did,
      handle: row.handle,
      avatarUrl: row.avatarUrl,
    };
    map[row.did] = entry;
    if (row.handle) map[row.handle] = entry;
  }
  return map;
}

/**
 * Resolve inline Leaflet references — publication `#atMention`s / homepage
 * `#link`s, document `#atMention`s, and actor `#didMention`s — to Standard
 * Reader publications, documents, and profiles, so the reader can render them
 * as chips/links to `/p/$did/$rkey`, `/a/$did/$rkey`, and `/u/$did` (matching
 * how Leaflet renders them) instead of bare text or off-site links. Resolved
 * lazily on the client after the article paints, so it never blocks the
 * article's initial (SSR) render.
 */
export async function resolveInlineMentions(
  db: Db,
  schema: Schema,
  refs: InlineMentionRefs,
): Promise<InlineMentions> {
  const [publications, documents, actors, actorLinks] = await Promise.all([
    resolvePublications(
      db,
      schema,
      refs.publicationAtUris,
      refs.publicationUrls,
    ),
    resolveDocuments(db, schema, refs.documentAtUris),
    resolveActors(db, schema, refs.actorDids),
    resolveActorLinks(db, schema, refs.actorLinks),
  ]);
  return { publications, documents, actors, actorLinks };
}
