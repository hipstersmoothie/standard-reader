/**
 * The Standard Reader "Collection" manifest — the structured representation our
 * renderer reads. Stored in the user's repo as an `app.standard-reader.collection`
 * sidecar record (same rkey as the `site.standard.document` shell). Editorial,
 * colophon, and item notes are stored as `at.markpub.markdown` in the repo;
 * this module normalizes them to plain markdown strings on read. Theme/fonts
 * live on the owning publication via `app.standard-reader.publicationTheme`.
 *
 * Client-safe (no server-only imports): used by the ingest mapper, the write
 * composer, the read-model shapes, and the magazine/collection renderers.
 */

import { markdownFromCollectionField } from "#/lib/markpub/collection-fields";

/** Legacy extension field on `site.standard.document` (pre-sidecar). */
export const LEGACY_READER_COLLECTION_FIELD = "readerCollection";

/** An optional editorial intro. Both title and body are optional. */
export interface CollectionEditorial {
  title?: string;
  /** Plain markdown extracted from stored `at.markpub.markdown` (or legacy string). */
  body?: string;
}

/** Optional closing credits on the magazine end spread (markdown body). */
export interface CollectionColophon {
  /** Plain markdown extracted from stored `at.markpub.markdown` (or legacy string). */
  body?: string;
}

/** One curated entry: an article at-uri plus an optional explanatory note (markdown). */
export interface CollectionItem {
  /** at-uri of the included `site.standard.document`. */
  document: string;
  /** Optional markdown note extracted from stored `at.markpub.markdown` (or legacy string). */
  note?: string;
}

export interface CollectionManifest {
  editorial?: CollectionEditorial;
  colophon?: CollectionColophon;
  items: Array<CollectionItem>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseEditorial(value: unknown): CollectionEditorial | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const title = cleanString(raw.title);
  const body = markdownFromCollectionField(raw.body);
  if (title === undefined && body === undefined) return undefined;
  return { ...(title ? { title } : {}), ...(body ? { body } : {}) };
}

function parseColophon(value: unknown): CollectionColophon | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = markdownFromCollectionField(
    (value as Record<string, unknown>).body,
  );
  if (body === undefined) return undefined;
  return { body };
}

function parseItem(value: unknown): CollectionItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const document = cleanString(raw.document);
  if (!document) return null;
  const note = markdownFromCollectionField(raw.note);
  return { document, ...(note ? { note } : {}) };
}

/**
 * Validate and normalize a raw manifest value into a {@link CollectionManifest},
 * or `null` when it isn't well-formed. Accepts either a sidecar record body or
 * the legacy nested `readerCollection` object shape.
 */
export function parseCollectionManifest(
  value: unknown,
): CollectionManifest | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.items)) return null;

  const items = raw.items
    .map(parseItem)
    .filter((item): item is CollectionItem => item != null);
  if (items.length === 0) return null;

  const editorial = parseEditorial(raw.editorial);
  const colophon = parseColophon(raw.colophon);
  return {
    ...(editorial ? { editorial } : {}),
    ...(colophon ? { colophon } : {}),
    items,
  };
}

/**
 * Resolve a collection manifest from sidecar + legacy document sources.
 * Sidecar wins when both are present.
 */
export function collectionManifestFromSources(sources: {
  sidecar?: unknown;
  legacyDocument?: unknown;
}): CollectionManifest | null {
  const fromSidecar = sources.sidecar
    ? parseCollectionManifest(sources.sidecar)
    : null;
  if (fromSidecar) return fromSidecar;

  if (isRecord(sources.legacyDocument)) {
    return parseCollectionManifest(
      sources.legacyDocument[LEGACY_READER_COLLECTION_FIELD],
    );
  }
  return null;
}

/** Whether a parsed manifest carries any editorial content. */
export function hasEditorial(manifest: CollectionManifest): boolean {
  return Boolean(manifest.editorial?.title || manifest.editorial?.body);
}

/** Whether a parsed manifest carries colophon body copy. */
export function hasColophon(manifest: CollectionManifest): boolean {
  return Boolean(manifest.colophon?.body);
}
