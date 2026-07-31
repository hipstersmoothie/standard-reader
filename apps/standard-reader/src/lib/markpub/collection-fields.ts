import type {
  CollectionColophon,
  CollectionEditorial,
  CollectionItem,
  CollectionManifest,
} from "#/lib/collections/manifest";

import { markpubPlaintext } from "./markdown";
import { MARKPUB_MARKDOWN, MARKPUB_TEXT } from "./types";

/** Wrap curator markdown as an `at.markpub.markdown` record field. */
export function collectionMarkpubContent(
  markdown: string,
): Record<string, unknown> {
  const trimmed = markdown.trim();
  return {
    $type: MARKPUB_MARKDOWN,
    flavor: "gfm",
    text: { $type: MARKPUB_TEXT, markdown: trimmed },
  };
}

/**
 * Read editorial/colophon body or item note from repo storage. Accepts legacy
 * plain markdown strings during migration.
 */
export function markdownFromCollectionField(
  value: unknown,
): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  const plaintext = markpubPlaintext(value);
  if (!plaintext) return undefined;
  const trimmed = plaintext.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function collectionFieldFromMarkdown(
  markdown: string | undefined,
): Record<string, unknown> | undefined {
  const trimmed = markdown?.trim();
  if (!trimmed) return undefined;
  return collectionMarkpubContent(trimmed);
}

function serializeEditorial(
  editorial: CollectionEditorial,
): Record<string, unknown> | undefined {
  const title = editorial.title?.trim();
  const body = collectionFieldFromMarkdown(editorial.body);
  if (!title && !body) return undefined;
  return {
    ...(title ? { title } : {}),
    ...(body ? { body } : {}),
  };
}

function serializeColophon(
  colophon: CollectionColophon,
): Record<string, unknown> | undefined {
  const body = collectionFieldFromMarkdown(colophon.body);
  if (!body) return undefined;
  return { body };
}

function serializeItem(item: CollectionItem): Record<string, unknown> {
  const note = collectionFieldFromMarkdown(item.note);
  return {
    document: item.document,
    ...(note ? { note } : {}),
  };
}

/** Encode a parsed manifest for `app.standard-reader.collection` repo writes. */
export function serializeCollectionManifestForRepo(
  manifest: CollectionManifest,
): {
  editorial?: Record<string, unknown>;
  colophon?: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
} {
  return {
    ...(manifest.editorial
      ? {
          editorial: serializeEditorial(manifest.editorial),
        }
      : {}),
    ...(manifest.colophon
      ? {
          colophon: serializeColophon(manifest.colophon),
        }
      : {}),
    items: manifest.items.map(serializeItem),
  };
}
