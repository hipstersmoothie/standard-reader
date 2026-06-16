import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { hexToRgb, rgbToHex } from "#/lib/collections/color";
import {
  collectionMarkpubContent,
  composeCollectionNewsletter,
} from "#/lib/collections/compose-newsletter";
import { parseCollectionManifest } from "#/lib/collections/manifest";
import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { getPublicUrl } from "#/lib/public-url";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import { blobCid, getBlobUrl } from "#/server/atproto/blob";
import { resolveIdentity } from "#/server/atproto/identity";
import {
  deleteDocumentRecord,
  getDocumentRecord,
  listCollectionRecords,
  newCollectionRkey,
  putDocumentRecord,
  putPublicationRecord,
  uploadBlob,
} from "#/server/atproto/repo-records";
import { ensureTracked } from "#/server/ingest/tap-client";
import { observe } from "#/server/observability/log";
import { selectArticleCardsByUris } from "#/server/reader/queries";
import { z } from "zod";

import type { ArticleCard } from "./api-shapes";

import { dbMiddleware } from "./db-middleware";

/**
 * Collections — curated, magazine-rendered editions. A collection is a
 * `site.standard.document` (markpub newsletter `content` + a `readerCollection`
 * manifest), all hung off one auto-created `site.standard.publication` per user
 * (marked `readerCollections: true`). Like lists, the user's own collections are
 * read straight from their repo (strongly consistent, no ingest lag); the wider
 * read-model still indexes them so they render and surface in feeds.
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
  theme: CollectionsTheme;
}

export interface CollectionForEdit {
  rkey: string;
  title: string;
  /** The publication this collection is published under (its `site` ref). */
  publicationUri: string | null;
  editorial: { title: string | null; body: string | null } | null;
  items: Array<CollectionEditItem>;
  /** Existing cover blob ref (to preserve on save) + a resolved preview URL. */
  coverImage: JsonObject | null;
  coverImageUrl: string | null;
}

const ensurePublicationInput = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(300).optional(),
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

/** Read the theme + fonts (as hex/names) out of a publication record value. */
function themeFromRecord(value: Record<string, unknown>): CollectionsTheme {
  const basicTheme = isRecord(value.basicTheme) ? value.basicTheme : {};
  return {
    background: rgbFieldToHex(basicTheme.background),
    foreground: rgbFieldToHex(basicTheme.foreground),
    accent: rgbFieldToHex(basicTheme.accent),
    accentForeground: rgbFieldToHex(basicTheme.accentForeground),
    fontTitle: fontField(basicTheme.fonts, "title"),
    fontBody: fontField(basicTheme.fonts, "body"),
  };
}

/** Build a `basicTheme` record object (RGB colors + fonts) from editor input. */
function buildBasicTheme(
  colors: Partial<
    Record<"background" | "foreground" | "accent" | "accentForeground", string>
  >,
  fonts: { title?: string; body?: string },
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
  const fontObj: Record<string, string> = {};
  if (fonts.title) fontObj.title = fonts.title;
  if (fonts.body) fontObj.body = fonts.body;
  if (Object.keys(fontObj).length > 0) theme.fonts = fontObj;
  return Object.keys(theme).length > 0 ? theme : undefined;
}

/** Find the user's collections publication record (marked `readerCollections`). */
async function findCollectionsPublication(
  client: Parameters<typeof listCollectionRecords>[0],
  did: string,
) {
  const records = await listCollectionRecords(
    client,
    did,
    STANDARD_NSID.publication,
  );
  return records.find(
    (r) => isRecord(r.value) && r.value.readerCollections === true,
  );
}

function publicationFromRecord(
  uri: string,
  rkey: string,
  value: Record<string, unknown>,
): CollectionsPublicationSummary {
  return {
    uri,
    rkey,
    name: typeof value.name === "string" ? value.name : "Series",
    description:
      typeof value.description === "string" ? value.description : null,
    theme: themeFromRecord(value),
  };
}

/** Find a reader-collections publication by rkey. */
async function findCollectionsPublicationByRkey(
  client: Parameters<typeof listCollectionRecords>[0],
  did: string,
  rkey: string,
) {
  const records = await listCollectionRecords(
    client,
    did,
    STANDARD_NSID.publication,
  );
  return records.find(
    (r) =>
      r.rkey === rkey &&
      isRecord(r.value) &&
      r.value.readerCollections === true,
  );
}

const getCollectionsPublication = createServerFn({ method: "GET" }).handler(
  observe("collections.getPublication", async (_, span) => {
    const session = await getAtprotoSessionForRequest(getRequest());
    if (!session) return null;
    span.set("did", session.did);

    const found = await findCollectionsPublication(session.client, session.did);
    if (!found || !isRecord(found.value)) return null;
    const value = found.value;
    return {
      uri: found.uri,
      rkey: found.rkey,
      name: typeof value.name === "string" ? value.name : "Series",
      description:
        typeof value.description === "string" ? value.description : null,
      theme: themeFromRecord(value),
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

      const rkey = newCollectionRkey();
      const { uri } = await putPublicationRecord(
        session.client,
        session.did,
        rkey,
        {
          name: data.name,
          url: getPublicUrl(),
          description: data.description || undefined,
          readerCollections: true,
        },
      );
      await ensureTracked(session.did, "reader");
      return { uri, rkey, created: true };
    }),
  );

/** Every publication the reader can publish a collection under. */
const listCollectionsPublications = createServerFn({ method: "GET" }).handler(
  observe("collections.listPublications", async (_, span) => {
    const session = await getAtprotoSessionForRequest(getRequest());
    if (!session) return [] satisfies Array<CollectionsPublicationSummary>;
    span.set("did", session.did);

    const records = await listCollectionRecords(
      session.client,
      session.did,
      STANDARD_NSID.publication,
    );
    const publications = records
      .filter(
        (r): r is typeof r & { value: Record<string, unknown> } =>
          isRecord(r.value) && r.value.readerCollections === true,
      )
      .map((r) => publicationFromRecord(r.uri, r.rkey, r.value));
    span.set("count", publications.length);
    return publications satisfies Array<CollectionsPublicationSummary>;
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

      const rkey = newCollectionRkey();
      const { uri } = await putPublicationRecord(
        session.client,
        session.did,
        rkey,
        {
          name: data.name,
          url: getPublicUrl(),
          description: data.description || undefined,
          readerCollections: true,
        },
      );
      await ensureTracked(session.did, "reader");
      return {
        uri,
        rkey,
        name: data.name,
        description: data.description ?? null,
        theme: {
          background: null,
          foreground: null,
          accent: null,
          accentForeground: null,
          fontTitle: null,
          fontBody: null,
        },
      } satisfies CollectionsPublicationSummary;
    }),
  );

const getMyCollections = createServerFn({ method: "GET" }).handler(
  observe("collections.getMine", async (_, span) => {
    const session = await getAtprotoSessionForRequest(getRequest());
    if (!session) return [] satisfies Array<CollectionCard>;
    span.set("did", session.did);

    const records = await listCollectionRecords(
      session.client,
      session.did,
      STANDARD_NSID.document,
    );
    const cards: Array<CollectionCard> = [];
    for (const record of records) {
      if (!isRecord(record.value)) continue;
      const manifest = parseCollectionManifest(record.value.readerCollection);
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

/** Resolve a record's `coverImage` blob ref to a getBlob URL on the owner's PDS. */
async function resolveCoverUrl(
  did: string,
  coverImage: unknown,
): Promise<string | null> {
  const cid = blobCid(coverImage as Parameters<typeof blobCid>[0]);
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
      const blob = await uploadBlob(session.client, bytes, data.mimeType);
      const url = await resolveCoverUrl(session.did, blob);
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
      const manifest = parseCollectionManifest(value.readerCollection);
      if (!manifest) return null;

      const { db, schema } = context;
      const cards = await selectArticleCardsByUris(
        db,
        schema,
        manifest.items.map((item) => item.document),
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
        coverImageUrl: await resolveCoverUrl(session.did, coverImage),
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
      );
      const cardByUri = new Map(cards.map((card) => [card.uri, card]));

      const newsletter = composeCollectionNewsletter({
        editorial: data.editorial,
        items: data.items.map((item) => {
          const card = cardByUri.get(item.document);
          return {
            title: card?.title ?? "Untitled",
            byline: card?.publicationName ?? null,
            url: card?.canonicalUrl ?? null,
            note: item.note,
          };
        }),
      });

      const editorial =
        data.editorial && (data.editorial.title || data.editorial.body)
          ? data.editorial
          : undefined;

      const rkey = data.rkey ?? newCollectionRkey();
      span.set("rkey", rkey);
      const now = new Date().toISOString();
      await putDocumentRecord(session.client, session.did, rkey, {
        site: data.publicationUri,
        title: data.title,
        description: editorial?.body?.slice(0, 280) || undefined,
        coverImage: data.coverImage ?? undefined,
        content: collectionMarkpubContent(newsletter),
        readerCollection: {
          ...(editorial ? { editorial } : {}),
          items: data.items.map((item) => ({
            document: item.document,
            ...(item.note ? { note: item.note } : {}),
          })),
        },
        publishedAt: data.publishedAt ?? now,
        updatedAt: data.rkey ? now : undefined,
      });
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

      await deleteDocumentRecord(session.client, session.did, data.rkey);
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
      await putPublicationRecord(session.client, session.did, existing.rkey, {
        name: typeof value.name === "string" ? value.name : "Series",
        url: typeof value.url === "string" ? value.url : getPublicUrl(),
        description:
          typeof value.description === "string" ? value.description : undefined,
        basicTheme: buildBasicTheme(data.colors, data.fonts),
        readerCollections: true,
      });
      await ensureTracked(session.did, "reader");
      return { ok: true as const };
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
  });
}

function getCollectionForEditQueryOptions(rkey: string) {
  return queryOptions({
    queryKey: ["reader", "collectionEdit", rkey] as const,
    queryFn: async () => getCollectionForEdit({ data: { rkey } }),
    staleTime: 0,
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
  uploadCollectionCover,
  getCollectionsPublicationQueryOptions,
  listCollectionsPublicationsQueryOptions,
  createCollectionsPublicationMutationOptions,
  getMyCollectionsQueryOptions,
  getCollectionForEditQueryOptions,
  ensureCollectionsPublicationMutationOptions,
  putCollectionMutationOptions,
  deleteCollectionMutationOptions,
  putCollectionsThemeMutationOptions,
  uploadCollectionCoverMutationOptions,
};

export { didFromUri, rkeyFromUri };
