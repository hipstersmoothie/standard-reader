import { AT_META_NAME } from "#/lib/at-meta-tags";
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
const META_TAG_RE = /<meta\b[^>]*>/gi;
const ATTR_RE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/**
 * Where a hint came from, best first. The `at:` meta tags say *why* a record is
 * on the page, so a canonical record outranks one the page merely shows, and
 * both outrank the unregistered `rel` values they replace. See
 * `#/lib/at-meta-tags` for the convention.
 */
const HINT_RANK = { canonical: 0, alternate: 1, legacyRel: 2 } as const;
type HintRank = (typeof HINT_RANK)[keyof typeof HINT_RANK];

type HintAccumulator = {
  documentUri: string | null;
  documentRank: HintRank | null;
  publicationUri: string | null;
  publicationRank: HintRank | null;
};

function emptyAccumulator(): HintAccumulator {
  return {
    documentUri: null,
    documentRank: null,
    publicationUri: null,
    publicationRank: null,
  };
}

function parseTagAttributes(tag: string): Record<string, string> {
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

/** Keep a hint only when nothing better-ranked already claimed that slot. */
function offerHint(acc: HintAccumulator, uri: string, rank: HintRank): void {
  if (isDocumentUri(uri)) {
    if (acc.documentRank === null || rank < acc.documentRank) {
      acc.documentUri = uri;
      acc.documentRank = rank;
    }
    return;
  }
  if (
    isPublicationUri(uri) &&
    (acc.publicationRank === null || rank < acc.publicationRank)
  ) {
    acc.publicationUri = uri;
    acc.publicationRank = rank;
  }
}

/** `at:canonical` / `at:alternate` — the convention that replaces the rels. */
function collectAtMetaHint(
  acc: HintAccumulator,
  name: string | undefined,
  content: string | undefined,
): void {
  const uri = content?.trim();
  if (!name || !uri || !isAtUri(uri)) return;
  const key = name.trim().toLowerCase();
  if (key === AT_META_NAME.canonical) offerHint(acc, uri, HINT_RANK.canonical);
  else if (key === AT_META_NAME.alternate) {
    offerHint(acc, uri, HINT_RANK.alternate);
  }
}

/** Legacy `<link rel="site.standard.*">` hints, kept for sites still on them. */
function collectLegacyRelHint(
  acc: HintAccumulator,
  rel: string | undefined,
  href: string | undefined,
): void {
  const uri = href?.trim();
  if (!rel || !uri || !isAtUri(uri)) return;
  for (const token of normalizeHintRel(rel)) {
    if (token === DISCOVERY_HINT_REL.document && isDocumentUri(uri)) {
      offerHint(acc, uri, HINT_RANK.legacyRel);
    }
    if (token === DISCOVERY_HINT_REL.publication && isPublicationUri(uri)) {
      offerHint(acc, uri, HINT_RANK.legacyRel);
    }
  }
}

function toHints(acc: HintAccumulator): DiscoveryHints {
  return {
    documentUri: acc.documentUri,
    publicationUri: acc.publicationUri,
  };
}

/**
 * Parse discovery hints from an HTML document string.
 *
 * Reads both the `at:` meta tags and the older `site.standard.*` link rels —
 * sites are mid-migration and many (SkyPress among them) emit both.
 */
export function parseDiscoveryHintsFromHtml(html: string): DiscoveryHints {
  const acc = emptyAccumulator();

  for (const match of html.matchAll(META_TAG_RE)) {
    const tag = match[0];
    if (!tag) continue;
    const attrs = parseTagAttributes(tag);
    collectAtMetaHint(acc, attrs.name ?? attrs.property, attrs.content);
  }

  for (const match of html.matchAll(LINK_TAG_RE)) {
    const tag = match[0];
    if (!tag) continue;
    const attrs = parseTagAttributes(tag);
    collectLegacyRelHint(acc, attrs.rel, attrs.href);
  }

  return toHints(acc);
}

/** Read discovery hints from a live document (extension content scripts). */
export function readDiscoveryHintsFromDocument(doc: Document): DiscoveryHints {
  const acc = emptyAccumulator();

  for (const meta of doc.querySelectorAll("meta[content]")) {
    collectAtMetaHint(
      acc,
      meta.getAttribute("name") ?? meta.getAttribute("property") ?? undefined,
      meta.getAttribute("content") ?? undefined,
    );
  }

  for (const link of doc.querySelectorAll("link[rel][href]")) {
    collectLegacyRelHint(
      acc,
      link.getAttribute("rel") ?? undefined,
      link.getAttribute("href") ?? undefined,
    );
  }

  return toHints(acc);
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
