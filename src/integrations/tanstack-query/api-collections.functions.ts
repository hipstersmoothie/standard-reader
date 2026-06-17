import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { Client } from "@atcute/client";
import { APP_NSID, STANDARD_NSID } from "#/lib/atproto/nsids";
import {
  collectionDocumentUri,
  collectionsPublicationUri,
} from "#/lib/atproto/collection-uris";
import { hexToRgb, rgbToHex } from "#/lib/collections/color";
import { composeCollectionNewsletterContent } from "#/lib/collections/compose-newsletter";
import {
  collectionManifestFromSources,
  parseCollectionManifest,
} from "#/lib/collections/manifest";
import { getPublicUrl } from "#/lib/public-url";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import { blobCid, getBlobUrl } from "#/server/atproto/blob";
import { resolveIdentity } from "#/server/atproto/identity";
import {
  getCollectionRecord,
  getDocumentRecord,
  getPublicationThemeRecord,
} from "#/server/atproto/repo-get-records";
import { ensureTracked } from "#/server/ingest/tap-client";
import { observe } from "#/server/observability/log";
import { parseAtUri } from "#/server/atproto/uri";
import { selectArticleCardsByUris } from "#/server/reader/queries";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import type { ArticleCard } from "./api-shapes";

import { dbMiddleware } from "./db-middleware";

/** Server-only repo writers — dynamic import keeps `node:crypto` out of the client bundle. */
async function repoRecords() {
  return import("#/server/atproto/repo-records");
}

type RepoClient = Client;

/**
 * Collections — curated, magazine-rendered editions. A collection is a
 * `site.standard.document` shell (markpub newsletter `content`) plus an
 * `app.standard-reader.collection` sidecar manifest at the same rkey, published
 * under a `site.standard.publication` marked by
 * `app.standard-reader.collectionsPublication`. Like lists, the user's own
 * collections are read straight from their repo (strongly consistent, no ingest
 * lag); the wider read-model still indexes them so they render and surface in feeds.
 */

/** Plain JSON (TanStack server-fn returns must be serializable; `unknown` isn't). */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A blob ref is plain JSON; narrow the server-only `unknown` to a JSON object. */
function asJsonObject(value: unknown): JsonObject {
  return value as JsonObject;
}

function rkeyFromUri(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

function didFromUri(uri: string): string {
  return uri.slice("at://".length, uri.indexOf("/", "at://".length));
}

export interface CollectionsTheme {
  background: string | null;
  foreground: string | null;
  accent: string | null;
  accentForeground: string | null;
  fontTitle: string | null;
  fontBody: string | null;
}

export interface CollectionsPublication {
  uri: string;
  rkey: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  theme: CollectionsTheme;
}

export interface CollectionCard {
  uri: string;
  did: string;
  rkey: string;
  /** The publication this collection is published under (its `site` ref). */
  publicationUri: string | null;
  title: string;
  itemCount: number;
  hasEditorial: boolean;
  updatedAt: string | null;
}

export interface CollectionEditItem {
  document: string;
  title: string;
  note: string | null;
  /** Full card for a recognizable row; `null` if the document isn't indexed. */
  card: ArticleCard | null;
}

export interface CollectionsPublicationSummary {
  uri: string;
  rkey: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  theme: CollectionsTheme;
  subscriberCount: number;
}

export interface CollectionForEdit {
  rkey: string;
  title: string;
  /** The publication this collection is published under (its `site` ref). */
  publicationUri: string | null;
  editorial: { title: string | null; body: string | null } | null;
  colophon: { body: string | null } | null;
  items: Array<CollectionEditItem>;
  /** Existing cover blob ref (to preserve on save) + a resolved preview URL. */
  coverImage: JsonObject | null;
  coverImageUrl: string | null;
}

const putPublicationInput = z.object({
  publicationRkey: z.string().min(1),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(300).optional(),
  /** Blob ref from `uploadPublicationIcon`, or `null` to remove the icon. */
  icon: z.record(z.string(), z.unknown()).nullable().optional(),
});

const ensurePublicationInput = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(300).optional(),
  /** Blob ref from `uploadPublicationIcon`. */
  icon: z.record(z.string(), z.unknown()).optional(),
});

const collectionItemInput = z.object({
  document: z.string().min(1),
  note: z.string().trim().max(2000).optional(),
});

const putCollectionInput = z.object({
  publicationUri: z.string().min(1),
  rkey: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(120),
  editorial: z
    .object({
      title: z.string().trim().max(160).optional(),
      body: z.string().trim().max(8000).optional(),
    })
    .optional(),
  colophon: z
    .object({
      body: z.string().trim().max(8000).optional(),
    })
    .optional(),
  items: z.array(collectionItemInput).min(1).max(42),
  /** A blob ref from `uploadCollectionCover` (or the existing one, to preserve it). */
  coverImage: z.record(z.string(), z.unknown()).nullish(),
  publishedAt: z.string().datetime().optional(),
});

const MAX_COVER_BYTES = 4_000_000;
const uploadCoverInput = z.object({
  dataBase64: z.string().min(1),
  mimeType: z.string().regex(/^image\//),
});

const rkeyInput = z.object({ rkey: z.string().min(1) });

function rgbFieldToHex(value: unknown): string | null {
  if (
    isRecord(value) &&
    typeof value.r === "number" &&
    typeof value.g === "number" &&
    typeof value.b === "number"
  ) {
    return rgbToHex({ r: value.r, g: value.g, b: value.b });
  }
  return null;
}

function fontField(fonts: unknown, key: "title" | "body"): string | null {
  if (isRecord(fonts) && typeof fonts[key] === "string" && fonts[key].trim()) {
    return (fonts[key] as string).trim();
  }
  return null;
}

/** Build a `basicTheme` record object (RGB colors only) from editor input. */
function buildBasicThemeColors(
  colors: Partial<
    Record<"background" | "foreground" | "accent" | "accentForeground", string>
  >,
): Record<string, unknown> | undefined {
  const theme: Record<string, unknown> = {};
  for (const key of [
    "background",
    "foreground",
    "accent",
    "accentForeground",
  ] as const) {
    const rgb = colors[key] ? hexToRgb(colors[key] as string) : null;
    if (rgb) theme[key] = { r: rgb.r, g: rgb.g, b: rgb.b };
  }
  return Object.keys(theme).length > 0 ? theme : undefined;
}

/** Whether a publication record is marked as a collections series (legacy). */
function isLegacyCollectionsPublication(
  value: Record<string, unknown>,
): boolean {
  return value.readerCollections === true;
}

/** Resolve collections-series publications from sidecar + legacy markers. */
async function publicationUrisReferencedByCollections(
  client: RepoClient,
  did: string,
): Promise<Set<string>> {
  const { listCollectionRecords } = await repoRecords();
  const [documents, collectionSidecars] = await Promise.all([
    listCollectionRecords(client, did, STANDARD_NSID.document),
    listCollectionRecords(client, did, APP_NSID.collection),
  ]);
  const sidecarByRkey = new Map(
    collectionSidecars.map((sidecar) => [sidecar.rkey, sidecar.value]),
  );
  const uris = new Set<string>();
  for (const document of documents) {
    if (!isRecord(document.value)) continue;
    const manifest = collectionManifestFromSources({
      sidecar: sidecarByRkey.get(document.rkey),
      legacyDocument: document.value,
    });
    if (!manifest) continue;
    const site = document.value.site;
    if (typeof site === "string" && site.startsWith("at://")) {
      uris.add(site);
    }
  }
  return uris;
}

function publicationRkeyFromOwnerUri(
  publicationUri: string,
  ownerDid: string,
): string | null {
  const parsed = parseAtUri(publicationUri);
  if (!parsed) return null;
  if (parsed.did !== ownerDid) return null;
  if (parsed.collection !== STANDARD_NSID.publication) return null;
  return parsed.rkey;
}

/** Ensure the collections-series marker exists for one publication URI. */
async function ensureCollectionsPublicationSidecarForUri(
  client: RepoClient,
  did: string,
  publicationUri: string,
): Promise<void> {
  const rkey = publicationRkeyFromOwnerUri(publicationUri, did);
  if (!rkey) return;

  const { listCollectionRecords, putCollectionsPublicationRecord } =
    await repoRecords();
  const sidecars = await listCollectionRecords(
    client,
    did,
    APP_NSID.collectionsPublication,
  );
  if (sidecars.some((sidecar) => sidecar.rkey === rkey)) return;

  await putCollectionsPublicationRecord(
    client,
    did,
    rkey,
    publicationUri,
    new Date().toISOString(),
  );
}

/**
 * Backfill missing `app.standard-reader.collectionsPublication` sidecars for
 * every publication referenced by collection documents in this repo.
 */
async function repairMissingCollectionsPublicationSidecars(
  client: RepoClient,
  did: string,
): Promise<void> {
  const { listCollectionRecords, putCollectionsPublicationRecord } =
    await repoRecords();
  const [referencedUris, sidecars] = await Promise.all([
    publicationUrisReferencedByCollections(client, did),
    listCollectionRecords(client, did, APP_NSID.collectionsPublication),
  ]);
  const sidecarRkeys = new Set(sidecars.map((sidecar) => sidecar.rkey));
  const now = new Date().toISOString();
  await Promise.all(
    [...referencedUris].flatMap((uri) => {
      const rkey = publicationRkeyFromOwnerUri(uri, did);
      if (!rkey || sidecarRkeys.has(rkey)) return [];
      return [putCollectionsPublicationRecord(client, did, rkey, uri, now)];
    }),
  );
}

async function listCollectionsPublicationRecords(
  client: RepoClient,
  did: string,
  options?: { repairSidecars?: boolean },
) {
  const { listCollectionRecords } = await repoRecords();
  const [sidecars, publications, referencedUris] = await Promise.all([
    listCollectionRecords(client, did, APP_NSID.collectionsPublication),
    listCollectionRecords(client, did, STANDARD_NSID.publication),
    publicationUrisReferencedByCollections(client, did),
  ]);
  const publicationByRkey = new Map(
    publications.map((record) => [record.rkey, record]),
  );
  const publicationByUri = new Map(
    publications.map((record) => [record.uri, record]),
  );
  const marked = new Map<string, (typeof publications)[number]>();

  for (const sidecar of sidecars) {
    const publication = publicationByRkey.get(sidecar.rkey);
    if (publication && isRecord(publication.value)) {
      marked.set(publication.rkey, publication);
    }
  }

  for (const publication of publications) {
    if (
      !marked.has(publication.rkey) &&
      isRecord(publication.value) &&
      isLegacyCollectionsPublication(publication.value)
    ) {
      marked.set(publication.rkey, publication);
    }
  }

  for (const uri of referencedUris) {
    const publication = publicationByUri.get(uri);
    if (publication && isRecord(publication.value)) {
      marked.set(publication.rkey, publication);
    }
  }

  const records = [...marked.values()];
  if (options?.repairSidecars) {
    await repairMissingCollectionsPublicationSidecars(client, did);
  }
  return records;
}

/** Find the user's first collections publication (legacy: first marked pub). */
async function findCollectionsPublication(
  client: RepoClient,
  did: string,
  options?: { repairSidecars?: boolean },
) {
  const records = await listCollectionsPublicationRecords(client, did, options);
  return records[0];
}

/** Find a reader-collections publication by rkey. */
async function findCollectionsPublicationByRkey(
  client: RepoClient,
  did: string,
  rkey: string,
) {
  const records = await listCollectionsPublicationRecords(client, did);
  const found = records.find((record) => record.rkey === rkey);
  if (found) return found;

  // Recover when a re-save stripped the legacy marker before the sidecar existed.
  const { listCollectionRecords } = await repoRecords();
  const publications = await listCollectionRecords(
    client,
    did,
    STANDARD_NSID.publication,
  );
  const publication = publications.find((record) => record.rkey === rkey);
  if (!publication || !isRecord(publication.value)) return undefined;

  const referencedUris = await publicationUrisReferencedByCollections(
    client,
    did,
  );
  return referencedUris.has(publication.uri) ? publication : undefined;
}

async function themeFromPublicationRecord(
  client: RepoClient,
  did: string,
  rkey: string,
  value: Record<string, unknown>,
): Promise<CollectionsTheme> {
  const basicTheme = isRecord(value.basicTheme) ? value.basicTheme : {};
  const sidecar = await getPublicationThemeRecord(client, did, rkey);
  const sidecarFonts =
    isRecord(sidecar) && isRecord(sidecar.fonts)
      ? (sidecar.fonts as Record<string, unknown>)
      : null;
  return {
    background: rgbFieldToHex(basicTheme.background),
    foreground: rgbFieldToHex(basicTheme.foreground),
    accent: rgbFieldToHex(basicTheme.accent),
    accentForeground: rgbFieldToHex(basicTheme.accentForeground),
    fontTitle:
      cleanSidecarFont(sidecarFonts?.title) ??
      fontField(basicTheme.fonts, "title"),
    fontBody:
      cleanSidecarFont(sidecarFonts?.body) ??
      fontField(basicTheme.fonts, "body"),
  };
}

function cleanSidecarFont(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

async function manifestForCollectionRkey(
  client: RepoClient,
  did: string,
  rkey: string,
  documentValue?: unknown,
): Promise<ReturnType<typeof parseCollectionManifest>> {
  const sidecar = await getCollectionRecord(client, did, rkey);
  const fromSidecar = sidecar
    ? collectionManifestFromSources({ sidecar })
    : null;
  if (fromSidecar) return fromSidecar;

  const document =
    documentValue ?? (await getDocumentRecord(client, did, rkey));
  return collectionManifestFromSources({ legacyDocument: document });
}

function iconFromRecord(
  value: Record<string, unknown>,
): JsonObject | undefined {
  return isRecord(value.icon) ? asJsonObject(value.icon) : undefined;
}

function publicationBaseFromRecord(value: Record<string, unknown>) {
  return {
    name: typeof value.name === "string" ? value.name : "Series",
    url: typeof value.url === "string" ? value.url : getPublicUrl(),
    description:
      typeof value.description === "string" ? value.description : undefined,
    icon: iconFromRecord(value),
    basicTheme: basicThemeColorsOnly(
      isRecord(value.basicTheme)
        ? (value.basicTheme as Record<string, unknown>)
        : undefined,
    ),
  };
}

/** Strip legacy `fonts` from a publication `basicTheme` before re-writing. */
function basicThemeColorsOnly(
  theme: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!theme) return undefined;
  const { fonts: _fonts, ...colors } = theme;
  return Object.keys(colors).length > 0 ? colors : undefined;
}

async function publicationFromRecord(
  client: RepoClient,
  did: string,
  uri: string,
  rkey: string,
  value: Record<string, unknown>,
): Promise<CollectionsPublicationSummary> {
  return {
    uri,
    rkey,
    name: typeof value.name === "string" ? value.name : "Series",
    description:
      typeof value.description === "string" ? value.description : null,
    iconUrl: await resolveBlobUrl(did, value.icon),
    theme: await themeFromPublicationRecord(client, did, rkey, value),
    subscriberCount: 0,
  };
}

const getCollectionsPublication = createServerFn({ method: "GET" }).handler(
  observe("collections.getPublication", async (_, span) => {
    const session = await getAtprotoSessionForRequest(getRequest());
    if (!session) return null;
    span.set("did", session.did);

    const found = await findCollectionsPublication(
      session.client,
      session.did,
      {
        repairSidecars: true,
      },
    );
    if (!found || !isRecord(found.value)) return null;
    const value = found.value;
    return {
      uri: found.uri,
      rkey: found.rkey,
      name: typeof value.name === "string" ? value.name : "Series",
      description:
        typeof value.description === "string" ? value.description : null,
      iconUrl: await resolveBlobUrl(session.did, value.icon),
      theme: await themeFromPublicationRecord(
        session.client,
        session.did,
        found.rkey,
        value,
      ),
    } satisfies CollectionsPublication;
  }),
);

const ensureCollectionsPublication = createServerFn({ method: "POST" })
  .inputValidator(ensurePublicationInput)
  .handler(
    observe("collections.ensurePublication", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to create collections.");
      span.set("did", session.did);

      const existing = await findCollectionsPublication(
        session.client,
        session.did,
      );
      if (existing) {
        return { uri: existing.uri, rkey: existing.rkey, created: false };
      }

      const {
        newCollectionRkey,
        putPublicationRecord,
        putCollectionsPublicationRecord,
      } = await repoRecords();
      const rkey = newCollectionRkey();
      const now = new Date().toISOString();
      const { uri } = await putPublicationRecord(
        session.client,
        session.did,
        rkey,
        {
          name: data.name,
          url: getPublicUrl(),
          description: data.description || undefined,
        },
      );
      await putCollectionsPublicationRecord(
        session.client,
        session.did,
        rkey,
        uri,
        now,
      );
      await ensureTracked(session.did, "reader");
      return { uri, rkey, created: true };
    }),
  );

/** Every publication the reader can publish a collection under. */
const listCollectionsPublications = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("collections.listPublications", async ({ context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) return [] satisfies Array<CollectionsPublicationSummary>;
      span.set("did", session.did);

      const records = await listCollectionsPublicationRecords(
        session.client,
        session.did,
        { repairSidecars: true },
      );
      const publications = await Promise.all(
        records
          .filter((r): r is typeof r & { value: Record<string, unknown> } =>
            isRecord(r.value),
          )
          .map((r) =>
            publicationFromRecord(
              session.client,
              session.did,
              r.uri,
              r.rkey,
              r.value,
            ),
          ),
      );

      const uris = publications.map((publication) => publication.uri);
      const subscriberByUri = new Map<string, number>();
      if (uris.length > 0) {
        const { db, schema } = context;
        const st = schema.publicationStats;
        const rows = await db
          .select({
            publicationUri: st.publicationUri,
            subscriberCount: st.subscriberCount,
          })
          .from(st)
          .where(inArray(st.publicationUri, uris));
        for (const row of rows) {
          subscriberByUri.set(row.publicationUri, row.subscriberCount ?? 0);
        }
      }

      span.set("count", publications.length);
      return publications.map((publication) => ({
        ...publication,
        subscriberCount: subscriberByUri.get(publication.uri) ?? 0,
      })) satisfies Array<CollectionsPublicationSummary>;
    }),
  );

/** Create a new, separate publication to publish collections under. */
const createCollectionsPublication = createServerFn({ method: "POST" })
  .inputValidator(ensurePublicationInput)
  .handler(
    observe("collections.createPublication", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to create collections.");
      span.set("did", session.did);

      const {
        newCollectionRkey,
        putPublicationRecord,
        putCollectionsPublicationRecord,
      } = await repoRecords();
      const rkey = newCollectionRkey();
      const icon = data.icon ? asJsonObject(data.icon) : undefined;
      const now = new Date().toISOString();
      const { uri } = await putPublicationRecord(
        session.client,
        session.did,
        rkey,
        {
          name: data.name,
          url: getPublicUrl(),
          description: data.description || undefined,
          ...(icon ? { icon } : {}),
        },
      );
      await putCollectionsPublicationRecord(
        session.client,
        session.did,
        rkey,
        uri,
        now,
      );
      await ensureTracked(session.did, "reader");
      const iconUrl = icon ? await resolveBlobUrl(session.did, icon) : null;
      return {
        uri,
        rkey,
        name: data.name,
        description: data.description ?? null,
        iconUrl,
        theme: {
          background: null,
          foreground: null,
          accent: null,
          accentForeground: null,
          fontTitle: null,
          fontBody: null,
        },
        subscriberCount: 0,
      } satisfies CollectionsPublicationSummary;
    }),
  );

const getMyCollections = createServerFn({ method: "GET" }).handler(
  observe("collections.getMine", async (_, span) => {
    const session = await getAtprotoSessionForRequest(getRequest());
    if (!session) return [] satisfies Array<CollectionCard>;
    span.set("did", session.did);

    await repairMissingCollectionsPublicationSidecars(
      session.client,
      session.did,
    );

    const { listCollectionRecords } = await repoRecords();
    const [records, sidecars] = await Promise.all([
      listCollectionRecords(
        session.client,
        session.did,
        STANDARD_NSID.document,
      ),
      listCollectionRecords(session.client, session.did, APP_NSID.collection),
    ]);
    const sidecarByRkey = new Map(
      sidecars.map((sidecar) => [sidecar.rkey, sidecar.value]),
    );
    const cards: Array<CollectionCard> = [];
    for (const record of records) {
      if (!isRecord(record.value)) continue;
      const manifest = collectionManifestFromSources({
        sidecar: sidecarByRkey.get(record.rkey),
        legacyDocument: record.value,
      });
      if (!manifest) continue;
      cards.push({
        uri: record.uri,
        did: session.did,
        rkey: record.rkey,
        publicationUri:
          typeof record.value.site === "string" ? record.value.site : null,
        title:
          typeof record.value.title === "string"
            ? record.value.title
            : "Untitled collection",
        itemCount: manifest.items.length,
        hasEditorial: Boolean(
          manifest.editorial?.title || manifest.editorial?.body,
        ),
        updatedAt:
          typeof record.value.updatedAt === "string"
            ? record.value.updatedAt
            : typeof record.value.publishedAt === "string"
              ? record.value.publishedAt
              : null,
      });
    }
    // Newest first by updated/published timestamp.
    cards.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    span.set("count", cards.length);
    return cards satisfies Array<CollectionCard>;
  }),
);

/** Resolve a record blob ref to a getBlob URL on the owner's PDS. */
async function resolveBlobUrl(
  did: string,
  blob: unknown,
): Promise<string | null> {
  const cid = blobCid(blob as Parameters<typeof blobCid>[0]);
  if (!cid) return null;
  const identity = await resolveIdentity(did).catch(() => null);
  return identity?.pds ? getBlobUrl(identity.pds, did, cid) : null;
}

const uploadCollectionCover = createServerFn({ method: "POST" })
  .inputValidator(uploadCoverInput)
  .handler(
    observe("collections.uploadCover", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to upload a cover.");
      span.set("did", session.did);

      const bytes = new Uint8Array(Buffer.from(data.dataBase64, "base64"));
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_BYTES) {
        throw new Error("Cover image must be under 4 MB.");
      }
      const { uploadBlob } = await repoRecords();
      const blob = await uploadBlob(session.client, bytes, data.mimeType);
      const url = await resolveBlobUrl(session.did, blob);
      return { blob: asJsonObject(blob), url };
    }),
  );

const uploadPublicationIcon = createServerFn({ method: "POST" })
  .inputValidator(uploadCoverInput)
  .handler(
    observe("collections.uploadPublicationIcon", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to upload an icon.");
      span.set("did", session.did);

      const bytes = new Uint8Array(Buffer.from(data.dataBase64, "base64"));
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_BYTES) {
        throw new Error("Icon must be under 4 MB.");
      }
      const { uploadBlob } = await repoRecords();
      const blob = await uploadBlob(session.client, bytes, data.mimeType);
      const url = await resolveBlobUrl(session.did, blob);
      return { blob: asJsonObject(blob), url };
    }),
  );

const getCollectionForEdit = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(rkeyInput)
  .handler(
    observe("collections.getForEdit", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) return null;
      span.set("did", session.did);
      span.set("rkey", data.rkey);

      // Read from the repo (no ingest lag — edit right after create works).
      const value = await getDocumentRecord(
        session.client,
        session.did,
        data.rkey,
      );
      if (!isRecord(value)) return null;
      const manifest = await manifestForCollectionRkey(
        session.client,
        session.did,
        data.rkey,
        value,
      );
      if (!manifest) return null;

      const { db, schema } = context;
      const cards = await selectArticleCardsByUris(
        db,
        schema,
        manifest.items.map((item) => item.document),
        { lite: true },
      );
      const cardByUri = new Map(cards.map((card) => [card.uri, card]));

      const coverImage = isRecord(value.coverImage)
        ? asJsonObject(value.coverImage)
        : null;
      return {
        rkey: data.rkey,
        title: typeof value.title === "string" ? value.title : "",
        publicationUri: typeof value.site === "string" ? value.site : null,
        editorial: manifest.editorial
          ? {
              title: manifest.editorial.title ?? null,
              body: manifest.editorial.body ?? null,
            }
          : null,
        colophon: manifest.colophon
          ? {
              body: manifest.colophon.body ?? null,
            }
          : null,
        items: manifest.items.map((item) => {
          const card = cardByUri.get(item.document) ?? null;
          return {
            document: item.document,
            title: card?.title ?? item.document,
            note: item.note ?? null,
            card,
          };
        }),
        coverImage,
        coverImageUrl: await resolveBlobUrl(session.did, coverImage),
      } satisfies CollectionForEdit;
    }),
  );

const putCollection = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(putCollectionInput)
  .handler(
    observe("collections.putCollection", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to manage collections.");
      span.set("did", session.did);
      span.set("items", data.items.length);

      const { db, schema } = context;
      const cards = await selectArticleCardsByUris(
        db,
        schema,
        data.items.map((item) => item.document),
        { lite: true },
      );
      const cardByUri = new Map(cards.map((card) => [card.uri, card]));

      const content = composeCollectionNewsletterContent({
        editorial: data.editorial,
        colophon: data.colophon,
        manifestItems: data.items,
        cardsByUri: cardByUri,
        baseUrl: getPublicUrl(),
      });

      const editorial =
        data.editorial && (data.editorial.title || data.editorial.body)
          ? data.editorial
          : undefined;
      const colophon =
        data.colophon && data.colophon.body ? data.colophon : undefined;

      const { newCollectionRkey, putCollectionRecord, putDocumentRecord } =
        await repoRecords();
      const rkey = data.rkey ?? newCollectionRkey();
      span.set("rkey", rkey);
      const now = new Date().toISOString();
      const manifest = {
        ...(editorial ? { editorial } : {}),
        ...(colophon ? { colophon } : {}),
        items: data.items.map((item) => ({
          document: item.document,
          ...(item.note ? { note: item.note } : {}),
        })),
      };
      const documentUri = collectionDocumentUri(session.did, rkey);
      await putDocumentRecord(session.client, session.did, rkey, {
        site: data.publicationUri,
        title: data.title,
        description: editorial?.body?.slice(0, 280) || undefined,
        coverImage: data.coverImage ?? undefined,
        content,
        publishedAt: data.publishedAt ?? now,
        updatedAt: data.rkey ? now : undefined,
      });
      await putCollectionRecord(session.client, session.did, rkey, {
        documentUri,
        manifest,
        createdAt: data.publishedAt ?? now,
        updatedAt: data.rkey ? now : undefined,
      });
      await ensureCollectionsPublicationSidecarForUri(
        session.client,
        session.did,
        data.publicationUri,
      );
      await ensureTracked(session.did, "reader");
      return { ok: true as const, rkey };
    }),
  );

const deleteCollection = createServerFn({ method: "POST" })
  .inputValidator(rkeyInput)
  .handler(
    observe("collections.deleteCollection", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to manage collections.");
      span.set("did", session.did);
      span.set("rkey", data.rkey);

      const { deleteCollectionRecord, deleteDocumentRecord } =
        await repoRecords();
      await deleteDocumentRecord(session.client, session.did, data.rkey);
      await deleteCollectionRecord(session.client, session.did, data.rkey);
      return { ok: true as const };
    }),
  );

const hexColor = z
  .string()
  .regex(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/)
  .optional();

const putThemeInput = z.object({
  publicationRkey: z.string().min(1),
  colors: z.object({
    background: hexColor,
    foreground: hexColor,
    accent: hexColor,
    accentForeground: hexColor,
  }),
  fonts: z.object({
    title: z.string().trim().max(60).optional(),
    body: z.string().trim().max(60).optional(),
  }),
});

const putCollectionsTheme = createServerFn({ method: "POST" })
  .inputValidator(putThemeInput)
  .handler(
    observe("collections.putTheme", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to theme collections.");
      span.set("did", session.did);

      const existing = await findCollectionsPublicationByRkey(
        session.client,
        session.did,
        data.publicationRkey,
      );
      if (!existing || !isRecord(existing.value)) {
        throw new Error("Publication not found.");
      }
      const value = existing.value;
      const base = publicationBaseFromRecord(value);
      const now = new Date().toISOString();
      const publicationUri = collectionsPublicationUri(
        session.did,
        existing.rkey,
      );
      const {
        putCollectionsPublicationRecord,
        putPublicationRecord,
        putPublicationThemeRecord,
      } = await repoRecords();
      await putPublicationRecord(session.client, session.did, existing.rkey, {
        ...base,
        basicTheme: buildBasicThemeColors(data.colors),
      });
      await putCollectionsPublicationRecord(
        session.client,
        session.did,
        existing.rkey,
        existing.uri,
        now,
      );
      await putPublicationThemeRecord(
        session.client,
        session.did,
        existing.rkey,
        {
          publicationUri,
          fonts: {
            ...(data.fonts.title ? { title: data.fonts.title } : {}),
            ...(data.fonts.body ? { body: data.fonts.body } : {}),
          },
          createdAt: now,
          updatedAt: now,
        },
      );
      await ensureTracked(session.did, "reader");
      return { ok: true as const };
    }),
  );

const putCollectionsPublication = createServerFn({ method: "POST" })
  .inputValidator(putPublicationInput)
  .handler(
    observe("collections.putPublication", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) throw new Error("Sign in to edit series.");
      span.set("did", session.did);

      const existing = await findCollectionsPublicationByRkey(
        session.client,
        session.did,
        data.publicationRkey,
      );
      if (!existing || !isRecord(existing.value)) {
        throw new Error("Publication not found.");
      }
      const value = existing.value;
      const base = publicationBaseFromRecord(value);
      const icon =
        data.icon === null
          ? undefined
          : data.icon
            ? asJsonObject(data.icon)
            : base.icon;
      const { putCollectionsPublicationRecord, putPublicationRecord } =
        await repoRecords();
      await putPublicationRecord(session.client, session.did, existing.rkey, {
        name: data.name,
        url: base.url,
        description: data.description || undefined,
        ...(icon ? { icon } : {}),
        ...(base.basicTheme ? { basicTheme: base.basicTheme } : {}),
      });
      await putCollectionsPublicationRecord(
        session.client,
        session.did,
        existing.rkey,
        existing.uri,
        new Date().toISOString(),
      );
      await ensureTracked(session.did, "reader");
      const iconUrl = icon ? await resolveBlobUrl(session.did, icon) : null;
      return {
        ok: true as const,
        name: data.name,
        description: data.description ?? null,
        iconUrl,
      };
    }),
  );

// ── React Query options ─────────────────────────────────────────────────────

function getCollectionsPublicationQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "collectionsPublication"] as const,
    queryFn: async () => getCollectionsPublication(),
    staleTime: 5 * 60_000,
  });
}

function listCollectionsPublicationsQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "collectionsPublications"] as const,
    queryFn: async () => listCollectionsPublications(),
    staleTime: 5 * 60_000,
  });
}

function createCollectionsPublicationMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "createCollectionsPublication"] as const,
    mutationFn: async (input: z.input<typeof ensurePublicationInput>) =>
      createCollectionsPublication({ data: input }),
  });
}

function getMyCollectionsQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "collections"] as const,
    queryFn: async () => getMyCollections(),
    staleTime: 5 * 60_000,
  });
}

function getCollectionForEditQueryOptions(rkey: string) {
  return queryOptions({
    queryKey: ["reader", "collectionEdit", rkey] as const,
    queryFn: async () => getCollectionForEdit({ data: { rkey } }),
    staleTime: 5 * 60_000,
  });
}

function ensureCollectionsPublicationMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "ensureCollectionsPublication"] as const,
    mutationFn: async (input: z.input<typeof ensurePublicationInput>) =>
      ensureCollectionsPublication({ data: input }),
  });
}

function putCollectionMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "putCollection"] as const,
    mutationFn: async (input: z.input<typeof putCollectionInput>) =>
      putCollection({ data: input }),
  });
}

function uploadCollectionCoverMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "uploadCollectionCover"] as const,
    mutationFn: async (input: z.input<typeof uploadCoverInput>) =>
      uploadCollectionCover({ data: input }),
  });
}

function deleteCollectionMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "deleteCollection"] as const,
    mutationFn: async (rkey: string) => deleteCollection({ data: { rkey } }),
  });
}

function putCollectionsPublicationMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "putCollectionsPublication"] as const,
    mutationFn: async (input: z.input<typeof putPublicationInput>) =>
      putCollectionsPublication({ data: input }),
  });
}

function uploadPublicationIconMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "uploadPublicationIcon"] as const,
    mutationFn: async (input: z.input<typeof uploadCoverInput>) =>
      uploadPublicationIcon({ data: input }),
  });
}

function putCollectionsThemeMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "putCollectionsTheme"] as const,
    mutationFn: async (input: z.input<typeof putThemeInput>) =>
      putCollectionsTheme({ data: input }),
  });
}

export const collectionsApi = {
  getCollectionsPublication,
  listCollectionsPublications,
  createCollectionsPublication,
  getMyCollections,
  getCollectionForEdit,
  ensureCollectionsPublication,
  putCollection,
  deleteCollection,
  putCollectionsTheme,
  putCollectionsPublication,
  uploadCollectionCover,
  uploadPublicationIcon,
  getCollectionsPublicationQueryOptions,
  listCollectionsPublicationsQueryOptions,
  createCollectionsPublicationMutationOptions,
  getMyCollectionsQueryOptions,
  getCollectionForEditQueryOptions,
  ensureCollectionsPublicationMutationOptions,
  putCollectionMutationOptions,
  deleteCollectionMutationOptions,
  putCollectionsThemeMutationOptions,
  putCollectionsPublicationMutationOptions,
  uploadCollectionCoverMutationOptions,
  uploadPublicationIconMutationOptions,
};

export { didFromUri, rkeyFromUri };
