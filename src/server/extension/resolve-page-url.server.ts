import type { db } from "#/db/index.server";
import type * as schema from "#/db/schema";
import type { DiscoveryHints } from "#/lib/discovery-hints";
import type { AtprotoSessionContext } from "#/middleware/auth-session.server";
import type { ExtensionResolveResult } from "#/server/extension/types";

import {
  documentLinkParams,
  publicationLinkParams,
  readingMinutes,
} from "#/components/reader/format";
import { STANDARD_NSID } from "#/lib/atproto/nsids";
import {
  mergeDiscoveryHints,
  parseDiscoveryHintsFromHtml,
} from "#/lib/discovery-hints";
import { parseInternalRoute } from "#/lib/internal-route";
import { linkTargetVariants } from "#/lib/link-target-variants";
import { getPublicUrl } from "#/lib/public-url";
import { cdnImageUrl } from "#/server/atproto/blob";
import { countDocumentComments } from "#/server/reader/document-comments";
import { assertSafeFetchUrl } from "#/server/security/ssrf-guard";
import { and, eq, inArray, sql } from "drizzle-orm";

const PAGE_FETCH_TIMEOUT_MS = 8000;
const PAGE_FETCH_MAX_BYTES = 200_000;

function parseAtUriCollection(
  uri: string,
): { did: string; collection: string; rkey: string } | null {
  if (!uri.startsWith("at://")) return null;
  const rest = uri.slice("at://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const did = rest.slice(0, slash);
  const after = rest.slice(slash + 1);
  const nextSlash = after.indexOf("/");
  if (nextSlash === -1) return null;
  const collection = after.slice(0, nextSlash);
  const rkey = after.slice(nextSlash + 1);
  if (!did.startsWith("did:") || !rkey) return null;
  return { did, collection, rkey };
}

function buildArticleReaderUrl(documentUri: string): string {
  const params = documentLinkParams(documentUri);
  const base = getPublicUrl();
  if (!params) return base;
  return `${base}/a/${encodeURIComponent(params.did)}/${encodeURIComponent(params.rkey)}`;
}

function buildPublicationReaderUrl(publicationUri: string): string {
  const params = publicationLinkParams(publicationUri);
  const base = getPublicUrl();
  if (!params) return base;
  return `${base}/p/${encodeURIComponent(params.did)}/${encodeURIComponent(params.rkey)}`;
}

async function loadArticleStatus(
  dbClient: typeof db,
  schemaModule: typeof schema,
  session: AtprotoSessionContext | undefined,
  documentUri: string,
  publicationUri: string | null,
): Promise<{
  isBookmarked?: boolean;
  isRead?: boolean;
  isFollowing?: boolean;
  isRecommended?: boolean;
}> {
  if (!session) return {};

  const rec = schemaModule.recommends;
  const [bookmarkRow, readRow, followRow, recommendRow] = await Promise.all([
    dbClient
      .select({ uri: schemaModule.bookmarks.uri })
      .from(schemaModule.bookmarks)
      .where(
        and(
          eq(schemaModule.bookmarks.ownerDid, session.did),
          eq(schemaModule.bookmarks.documentUri, documentUri),
          eq(schemaModule.bookmarks.deleted, false),
        ),
      )
      .limit(1),
    dbClient
      .select({ uri: schemaModule.reads.uri })
      .from(schemaModule.reads)
      .where(
        and(
          eq(schemaModule.reads.ownerDid, session.did),
          eq(schemaModule.reads.documentUri, documentUri),
          eq(schemaModule.reads.deleted, false),
        ),
      )
      .limit(1),
    publicationUri
      ? dbClient
          .select({ uri: schemaModule.subscriptions.uri })
          .from(schemaModule.subscriptions)
          .where(
            and(
              eq(schemaModule.subscriptions.subscriberDid, session.did),
              eq(schemaModule.subscriptions.publicationUri, publicationUri),
              eq(schemaModule.subscriptions.deleted, false),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    dbClient
      .select({ uri: rec.uri })
      .from(rec)
      .where(
        and(
          eq(rec.recommenderDid, session.did),
          eq(rec.documentUri, documentUri),
          eq(rec.deleted, false),
        ),
      )
      .limit(1),
  ]);

  return {
    isBookmarked: Boolean(bookmarkRow[0]),
    isRead: Boolean(readRow[0]),
    isFollowing: publicationUri ? Boolean(followRow[0]) : undefined,
    isRecommended: Boolean(recommendRow[0]),
  };
}

type ArticleResolveRow = {
  uri: string;
  title: string;
  canonicalUrl: string | null;
  publicationUri: string | null;
  publishedAt: Date | null;
  textContent: string | null;
  hasRenderableBody: boolean;
  pubName: string | null;
  pubDid: string | null;
  pubIconCid: string | null;
  pubOwnerAvatarUrl: string | null;
  pubOwnerHandle: string | null;
  pubOwnerDisplayName: string | null;
  pubSubscriberCount: number | null;
  themeBackground: string | null;
  themeForeground: string | null;
  themeAccent: string | null;
  themeAccentForeground: string | null;
};

async function loadLeadAuthor(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
): Promise<{
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
}> {
  const dc = schemaModule.documentContributors;
  const pr = schemaModule.profiles;
  const [row] = await dbClient
    .select({
      displayName: dc.displayName,
      profileDisplayName: pr.displayName,
      handle: pr.handle,
      avatarUrl: pr.avatarUrl,
    })
    .from(dc)
    .leftJoin(pr, eq(pr.did, dc.did))
    .where(eq(dc.documentUri, documentUri))
    .limit(1);

  if (!row) {
    return { name: null, handle: null, avatarUrl: null };
  }

  return {
    name: row.displayName ?? row.profileDisplayName,
    handle: row.handle,
    avatarUrl: row.avatarUrl,
  };
}

function resolveAuthorFields(
  row: ArticleResolveRow,
  lead: {
    name: string | null;
    handle: string | null;
    avatarUrl: string | null;
  },
): {
  authorName: string | null;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
} {
  const handle = lead.handle ?? row.pubOwnerHandle;
  const name =
    lead.name ??
    row.pubOwnerDisplayName ??
    (handle ? `@${handle}` : null) ??
    row.pubName;

  return {
    authorName: name,
    authorHandle: handle,
    authorAvatarUrl: lead.avatarUrl ?? row.pubOwnerAvatarUrl,
  };
}

function articleResolveColumns(schemaModule: typeof schema) {
  const d = schemaModule.documents;
  const p = schemaModule.publications;
  const st = schemaModule.publicationStats;
  const pr = schemaModule.profiles;
  return {
    uri: d.uri,
    title: d.title,
    canonicalUrl: d.canonicalUrl,
    publicationUri: d.publicationUri,
    publishedAt: d.publishedAt,
    textContent: d.textContent,
    hasRenderableBody: d.hasRenderableBody,
    pubName: p.name,
    pubDid: p.did,
    pubIconCid: p.iconCid,
    pubOwnerAvatarUrl: pr.avatarUrl,
    pubOwnerHandle: pr.handle,
    pubOwnerDisplayName: pr.displayName,
    pubSubscriberCount: st.subscriberCount,
    themeBackground: p.themeBackground,
    themeForeground: p.themeForeground,
    themeAccent: p.themeAccent,
    themeAccentForeground: p.themeAccentForeground,
  };
}

async function loadArticleEngagement(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
): Promise<{ recommendCount: number; commentCount: number }> {
  const rec = schemaModule.recommends;
  const [recommendRows, commentCount] = await Promise.all([
    dbClient
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(rec)
      .where(and(eq(rec.documentUri, documentUri), eq(rec.deleted, false))),
    countDocumentComments(dbClient, schemaModule, documentUri),
  ]);

  return {
    recommendCount: recommendRows[0]?.count ?? 0,
    commentCount,
  };
}

async function buildArticleResult(
  dbClient: typeof db,
  schemaModule: typeof schema,
  session: AtprotoSessionContext | undefined,
  row: ArticleResolveRow,
): Promise<ExtensionResolveResult> {
  const [status, leadAuthor, engagement] = await Promise.all([
    loadArticleStatus(
      dbClient,
      schemaModule,
      session,
      row.uri,
      row.publicationUri,
    ),
    loadLeadAuthor(dbClient, schemaModule, row.uri),
    loadArticleEngagement(dbClient, schemaModule, row.uri),
  ]);

  const author = resolveAuthorFields(row, leadAuthor);

  return {
    kind: "article",
    documentUri: row.uri,
    title: row.title,
    publicationUri: row.publicationUri,
    publicationName: row.pubName,
    publicationHandle: row.pubOwnerHandle,
    publicationIconUrl:
      row.pubIconCid && row.pubDid
        ? cdnImageUrl(row.pubDid, row.pubIconCid, "png")
        : null,
    publicationOwnerAvatarUrl: row.pubOwnerAvatarUrl,
    publicationSubscriberCount: row.pubSubscriberCount,
    publicationReaderUrl: row.publicationUri
      ? buildPublicationReaderUrl(row.publicationUri)
      : null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    readingMinutes: readingMinutes(row.textContent),
    authorName: author.authorName,
    authorHandle: author.authorHandle,
    authorAvatarUrl: author.authorAvatarUrl,
    readerUrl: buildArticleReaderUrl(row.uri),
    canonicalUrl: row.canonicalUrl,
    hasRenderableBody: row.hasRenderableBody,
    themeBackground: row.themeBackground,
    themeForeground: row.themeForeground,
    themeAccent: row.themeAccent,
    themeAccentForeground: row.themeAccentForeground,
    recommendCount: engagement.recommendCount,
    commentCount: engagement.commentCount,
    ...status,
  };
}

function publicationResolveColumns(schemaModule: typeof schema) {
  const p = schemaModule.publications;
  const st = schemaModule.publicationStats;
  const pr = schemaModule.profiles;
  return {
    uri: p.uri,
    did: p.did,
    name: p.name,
    url: p.url,
    description: p.description,
    iconCid: p.iconCid,
    ownerAvatarUrl: pr.avatarUrl,
    ownerHandle: pr.handle,
    subscriberCount: st.subscriberCount,
    themeBackground: p.themeBackground,
    themeForeground: p.themeForeground,
    themeAccent: p.themeAccent,
    themeAccentForeground: p.themeAccentForeground,
  };
}

type PublicationResolveRow = {
  uri: string;
  did: string;
  name: string;
  url: string;
  description: string | null;
  iconCid: string | null;
  ownerAvatarUrl: string | null;
  ownerHandle: string | null;
  subscriberCount: number | null;
  themeBackground: string | null;
  themeForeground: string | null;
  themeAccent: string | null;
  themeAccentForeground: string | null;
};

function buildPublicationResult(
  row: PublicationResolveRow,
  status: { isFollowing?: boolean },
): ExtensionResolveResult {
  return {
    kind: "publication",
    publicationUri: row.uri,
    name: row.name,
    description: row.description,
    handle: row.ownerHandle,
    iconUrl: row.iconCid ? cdnImageUrl(row.did, row.iconCid, "png") : null,
    ownerAvatarUrl: row.ownerAvatarUrl,
    subscriberCount: row.subscriberCount,
    readerUrl: buildPublicationReaderUrl(row.uri),
    siteUrl: row.url,
    themeBackground: row.themeBackground,
    themeForeground: row.themeForeground,
    themeAccent: row.themeAccent,
    themeAccentForeground: row.themeAccentForeground,
    ...status,
  };
}

async function loadPublicationStatus(
  dbClient: typeof db,
  schemaModule: typeof schema,
  session: AtprotoSessionContext | undefined,
  publicationUri: string,
): Promise<{ isFollowing?: boolean }> {
  if (!session) return {};
  const [row] = await dbClient
    .select({ uri: schemaModule.subscriptions.uri })
    .from(schemaModule.subscriptions)
    .where(
      and(
        eq(schemaModule.subscriptions.subscriberDid, session.did),
        eq(schemaModule.subscriptions.publicationUri, publicationUri),
        eq(schemaModule.subscriptions.deleted, false),
      ),
    )
    .limit(1);
  return { isFollowing: Boolean(row) };
}

async function resolveDocumentByUri(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
  session: AtprotoSessionContext | undefined,
): Promise<ExtensionResolveResult> {
  const d = schemaModule.documents;
  const p = schemaModule.publications;
  const st = schemaModule.publicationStats;
  const pr = schemaModule.profiles;
  const [row] = await dbClient
    .select(articleResolveColumns(schemaModule))
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(eq(d.uri, documentUri), eq(d.deleted, false)))
    .limit(1);

  if (!row) return { kind: "unknown" };

  return buildArticleResult(dbClient, schemaModule, session, row);
}

async function resolvePublicationByUri(
  dbClient: typeof db,
  schemaModule: typeof schema,
  publicationUri: string,
  session: AtprotoSessionContext | undefined,
): Promise<ExtensionResolveResult> {
  const p = schemaModule.publications;
  const st = schemaModule.publicationStats;
  const pr = schemaModule.profiles;
  const [row] = await dbClient
    .select(publicationResolveColumns(schemaModule))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(eq(p.uri, publicationUri), eq(p.deleted, false)))
    .limit(1);

  if (!row) return { kind: "unknown" };

  const status = await loadPublicationStatus(
    dbClient,
    schemaModule,
    session,
    row.uri,
  );

  return buildPublicationResult(row, status);
}

async function resolveByCanonicalUrl(
  dbClient: typeof db,
  schemaModule: typeof schema,
  url: string,
  session: AtprotoSessionContext | undefined,
): Promise<ExtensionResolveResult> {
  const variants = linkTargetVariants(url);
  if (variants.length === 0) return { kind: "unknown" };

  const d = schemaModule.documents;
  const p = schemaModule.publications;

  const st = schemaModule.publicationStats;
  const pr = schemaModule.profiles;

  const docRows = await dbClient
    .select(articleResolveColumns(schemaModule))
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(eq(d.deleted, false), inArray(d.canonicalUrl, variants)))
    .limit(1);

  if (docRows[0]) {
    return buildArticleResult(dbClient, schemaModule, session, docRows[0]);
  }

  const pubRows = await dbClient
    .select(publicationResolveColumns(schemaModule))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(eq(p.deleted, false), inArray(p.url, variants)))
    .limit(1);

  if (pubRows[0]) {
    const row = pubRows[0];
    const status = await loadPublicationStatus(
      dbClient,
      schemaModule,
      session,
      row.uri,
    );
    return buildPublicationResult(row, status);
  }

  return { kind: "unknown" };
}

async function fetchDiscoveryHintsFromPageUrl(
  url: string,
): Promise<DiscoveryHints> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { documentUri: null, publicationUri: null };
    }

    // The URL is user-controlled (extension resolve endpoint) — reject private /
    // loopback / link-local IPs and internal hostnames before fetching to
    // prevent SSRF (security audit H3). HTTP is allowed here since many real
    // publications are served over HTTP; the guard blocks dangerous hosts.
    try {
      assertSafeFetchUrl(url, { requireHttps: false });
    } catch {
      return { documentUri: null, publicationUri: null };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "StandardReaderExtension/1.0 (+https://standard-reader.app)",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { documentUri: null, publicationUri: null };
    }

    const body = await response.text();
    const html = body.slice(0, PAGE_FETCH_MAX_BYTES);
    return parseDiscoveryHintsFromHtml(html);
  } catch {
    return { documentUri: null, publicationUri: null };
  }
}

async function resolveByDiscoveryHints(
  dbClient: typeof db,
  schemaModule: typeof schema,
  hints: DiscoveryHints,
  session: AtprotoSessionContext | undefined,
): Promise<ExtensionResolveResult | null> {
  if (hints.documentUri) {
    const result = await resolveDocumentByUri(
      dbClient,
      schemaModule,
      hints.documentUri,
      session,
    );
    if (result.kind !== "unknown") return result;
  }

  if (hints.publicationUri) {
    const result = await resolvePublicationByUri(
      dbClient,
      schemaModule,
      hints.publicationUri,
      session,
    );
    if (result.kind !== "unknown") return result;
  }

  return null;
}

export async function resolvePageUrl(
  dbClient: typeof db,
  schemaModule: typeof schema,
  url: string,
  session: AtprotoSessionContext | undefined,
  pageHints?: DiscoveryHints,
): Promise<ExtensionResolveResult> {
  const trimmed = url.trim();
  if (!trimmed) return { kind: "unknown" };

  const appOrigin = getPublicUrl();
  const internal = parseInternalRoute(trimmed, appOrigin);
  if (internal) {
    if (internal.to === "/a/$did/$rkey" && internal.params) {
      const documentUri = `at://${internal.params.did}/${STANDARD_NSID.document}/${internal.params.rkey}`;
      return resolveDocumentByUri(dbClient, schemaModule, documentUri, session);
    }
    if (internal.to === "/p/$did/$rkey" && internal.params) {
      const publicationUri = `at://${internal.params.did}/${STANDARD_NSID.publication}/${internal.params.rkey}`;
      return resolvePublicationByUri(
        dbClient,
        schemaModule,
        publicationUri,
        session,
      );
    }
    try {
      const parsed = new URL(trimmed, appOrigin);
      if (parsed.origin === new URL(appOrigin).origin) {
        return {
          kind: "reader-link",
          readerUrl: parsed.pathname + parsed.search,
        };
      }
    } catch {
      return { kind: "reader-link", readerUrl: trimmed };
    }
  }

  const atParsed = parseAtUriCollection(trimmed);
  if (atParsed) {
    if (atParsed.collection === STANDARD_NSID.document) {
      const documentUri = `at://${atParsed.did}/${atParsed.collection}/${atParsed.rkey}`;
      return resolveDocumentByUri(dbClient, schemaModule, documentUri, session);
    }
    if (atParsed.collection === STANDARD_NSID.publication) {
      const publicationUri = `at://${atParsed.did}/${atParsed.collection}/${atParsed.rkey}`;
      return resolvePublicationByUri(
        dbClient,
        schemaModule,
        publicationUri,
        session,
      );
    }
  }

  return resolveByCanonicalUrl(dbClient, schemaModule, trimmed, session).then(
    async (canonicalResult) => {
      if (canonicalResult.kind !== "unknown") return canonicalResult;

      const fetchedHints =
        pageHints?.documentUri || pageHints?.publicationUri
          ? { documentUri: null, publicationUri: null }
          : await fetchDiscoveryHintsFromPageUrl(trimmed);
      const hints = mergeDiscoveryHints(pageHints, fetchedHints);
      const hinted = await resolveByDiscoveryHints(
        dbClient,
        schemaModule,
        hints,
        session,
      );
      return hinted ?? { kind: "unknown" };
    },
  );
}

export async function resolvePageUrls(
  dbClient: typeof db,
  schemaModule: typeof schema,
  urls: Array<string>,
  session: AtprotoSessionContext | undefined,
): Promise<Record<string, ExtensionResolveResult>> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(
    0,
    20,
  );
  const entries = await Promise.all(
    unique.map(
      async (url) =>
        [
          url,
          await resolvePageUrl(dbClient, schemaModule, url, session),
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}
