import { STANDARD_NSID } from "#/lib/atproto/nsids";

/** standard.site discovery hint rel values — see standard.site/docs/verification */
export const DISCOVERY_HINT_REL = {
  document: "site.standard.document",
  publication: "site.standard.publication",
} as const;

export type DiscoveryHints = {
  documentUri: string | null;
  publicationUri: string | null;
};

const EMPTY_HINTS: DiscoveryHints = {
  documentUri: null,
  publicationUri: null,
};

const LINK_TAG_RE = /<link\b[^>]*>/gi;
const ATTR_RE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function parseLinkTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(ATTR_RE)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name) attrs[name] = value;
  }
  return attrs;
}

function normalizeHintRel(rel: string): Array<string> {
  return rel
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isAtUri(value: string): boolean {
  return value.startsWith("at://");
}

function isDocumentUri(uri: string): boolean {
  if (!isAtUri(uri)) return false;
  return uri.includes(`/${STANDARD_NSID.document}/`);
}

function isPublicationUri(uri: string): boolean {
  if (!isAtUri(uri)) return false;
  return uri.includes(`/${STANDARD_NSID.publication}/`);
}

/** Parse standard.site discovery hints from an HTML document string. */
export function parseDiscoveryHintsFromHtml(html: string): DiscoveryHints {
  const hints: DiscoveryHints = { ...EMPTY_HINTS };

  for (const match of html.matchAll(LINK_TAG_RE)) {
    const tag = match[0];
    if (!tag) continue;
    const attrs = parseLinkTagAttributes(tag);
    const rel = attrs.rel;
    const href = attrs.href?.trim();
    if (!rel || !href || !isAtUri(href)) continue;

    for (const token of normalizeHintRel(rel)) {
      if (
        !hints.documentUri &&
        token === DISCOVERY_HINT_REL.document &&
        isDocumentUri(href)
      ) {
        hints.documentUri = href;
      }
      if (
        !hints.publicationUri &&
        token === DISCOVERY_HINT_REL.publication &&
        isPublicationUri(href)
      ) {
        hints.publicationUri = href;
      }
    }
  }

  return hints;
}

/** Read discovery hints from a live document (extension content scripts). */
export function readDiscoveryHintsFromDocument(
  doc: Document,
): DiscoveryHints {
  const hints: DiscoveryHints = { ...EMPTY_HINTS };

  for (const link of doc.querySelectorAll("link[rel][href]")) {
    const rel = link.getAttribute("rel");
    const href = link.getAttribute("href")?.trim();
    if (!rel || !href || !isAtUri(href)) continue;

    for (const token of normalizeHintRel(rel)) {
      if (
        !hints.documentUri &&
        token === DISCOVERY_HINT_REL.document &&
        isDocumentUri(href)
      ) {
        hints.documentUri = href;
      }
      if (
        !hints.publicationUri &&
        token === DISCOVERY_HINT_REL.publication &&
        isPublicationUri(href)
      ) {
        hints.publicationUri = href;
      }
    }
  }

  return hints;
}

export function mergeDiscoveryHints(
  ...sources: Array<DiscoveryHints | null | undefined>
): DiscoveryHints {
  const merged: DiscoveryHints = { ...EMPTY_HINTS };
  for (const source of sources) {
    if (!source) continue;
    if (!merged.documentUri && source.documentUri) {
      merged.documentUri = source.documentUri;
    }
    if (!merged.publicationUri && source.publicationUri) {
      merged.publicationUri = source.publicationUri;
    }
  }
  return merged;
}
