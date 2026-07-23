import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { normalizeAuthorRef } from "#/lib/author-profile";

/**
 * A Standard Reader publication resolved for an inline Leaflet reference — a
 * `pub.leaflet.richtext.facet#atMention` (by AT-URI) or a `#link` whose target
 * is a publication homepage. Rendered as an avatar chip linking to
 * `/p/$did/$rkey` instead of bare text or an off-site Leaflet link.
 */
export interface ResolvedPublicationMention {
  /** Publication AT-URI (`at://<did>/site.standard.publication/<rkey>`). */
  atUri: string;
  did: string;
  rkey: string;
  name: string;
  iconUrl: string | null;
}

/** Lookup keyed by publication AT-URI and by `url:<normalized-homepage>`. */
export type PublicationMentionMap = Record<string, ResolvedPublicationMention>;

/**
 * The `#feature` suffix of any AT-Proto rich-text facet `$type`, regardless of
 * lexicon namespace — `pub.leaflet.richtext.facet#didMention`,
 * `blog.pckt.richtext.facet#didMention`, and `app.bsky.richtext.facet#mention`
 * all yield their trailing kind. Namespace-agnostic so inline mentions resolve
 * across every content format, not just Leaflet.
 */
function facetKind($type: unknown): string | null {
  if (typeof $type !== "string") return null;
  const hash = $type.lastIndexOf("#");
  if (hash === -1) return null;
  return $type.slice(hash + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Leaflet's publication lexicon. Standard Reader mirrors each
 * `pub.leaflet.publication` to a `site.standard.publication` twin **at the same
 * rkey**, so a mention targeting either collection resolves to the same row.
 */
const LEAFLET_PUBLICATION_NSID = "pub.leaflet.publication";

const PUBLICATION_COLLECTIONS = new Set<string>([
  STANDARD_NSID.publication,
  LEAFLET_PUBLICATION_NSID,
]);

/**
 * Leaflet's document lexicon. Standard Reader mirrors each
 * `pub.leaflet.document` to a `site.standard.document` twin **at the same
 * rkey**, so an `#atMention` targeting either collection resolves to the same
 * row (mirroring how publications work above).
 */
const LEAFLET_DOCUMENT_NSID = "pub.leaflet.document";

const DOCUMENT_COLLECTIONS = new Set<string>([
  STANDARD_NSID.document,
  LEAFLET_DOCUMENT_NSID,
]);

/**
 * If `atUri` targets a publication — via `site.standard.publication` or its
 * `pub.leaflet.publication` twin — return the canonical
 * `site.standard.publication` AT-URI used as the mention map key; else null.
 */
export function publicationMentionKey(atUri: string): string | null {
  if (!atUri.startsWith("at://")) return null;
  const parts = atUri.slice("at://".length).split("/");
  if (parts.length < 3) return null;
  const [did, collection, ...rest] = parts;
  const rkey = rest.join("/");
  if (!did || !collection || !rkey) return null;
  if (!PUBLICATION_COLLECTIONS.has(collection)) return null;
  return `at://${did}/${STANDARD_NSID.publication}/${rkey}`;
}

/**
 * If `atUri` targets a document — via `site.standard.document` or its
 * `pub.leaflet.document` twin — return the canonical `site.standard.document`
 * AT-URI used as the mention map key; else null.
 */
export function documentMentionKey(atUri: string): string | null {
  if (!atUri.startsWith("at://")) return null;
  const parts = atUri.slice("at://".length).split("/");
  if (parts.length < 3) return null;
  const [did, collection, ...rest] = parts;
  const rkey = rest.join("/");
  if (!did || !collection || !rkey) return null;
  if (!DOCUMENT_COLLECTIONS.has(collection)) return null;
  return `at://${did}/${STANDARD_NSID.document}/${rkey}`;
}

/**
 * Normalize a homepage URL to match the value stored in `publications.url`,
 * which is trailing-slash-stripped on ingest (see `normalizePublicationUrl`).
 * So a `#link` to `https://news.atproto.com.br/` matches the stored
 * `https://news.atproto.com.br`.
 */
export function normalizeMentionUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Map key for a publication homepage link. */
export function mentionUrlKey(url: string): string {
  return `url:${normalizeMentionUrl(url)}`;
}

const BSKY_PROFILE_HOSTS = new Set(["bsky.app", "staging.bsky.app"]);

/**
 * If a `#link` facet's target is a *user profile*, return the user's ident
 * (handle or DID) so the segment can render as an actor mention (avatar chip +
 * hovercard, linking in-app to `/u/$did`) instead of a bare off-site link.
 * Recognizes an in-app author path (`/u/<handle-or-did>`, relative) and a bare
 * Bluesky profile link (`bsky.app/profile/<handle-or-did>`). Returns null for
 * any other link.
 */
export function actorLinkIdent(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  let host: string | null = null;
  let pathname = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      host = url.hostname.toLowerCase();
      pathname = url.pathname;
    } catch {
      return null;
    }
  } else {
    // Relative path: drop any query/hash before matching.
    pathname = trimmed.split(/[?#]/)[0] ?? trimmed;
  }

  if (host && BSKY_PROFILE_HOSTS.has(host)) {
    // ONLY a bare profile counts as a person reference. A post
    // (`/profile/<ident>/post/…`), list, or feed is about that object, not a
    // mention of its owner — keep it a plain link to the original.
    const match = /^\/profile\/([^/]+)\/?$/.exec(pathname);
    if (match?.[1]) {
      const ident = normalizeAuthorRef(decodeURIComponent(match[1]));
      // A handle needs a dot; a DID is taken verbatim. Guards against
      // `/profile/` junk resolving to a bogus mention.
      if (ident.startsWith("did:") || ident.includes(".")) return ident;
    }
    return null;
  }

  // Only trust a relative `/u/<ident>` path (single segment) — a full off-site
  // URL that happens to carry a `/u/` segment is not our profile route.
  if (host === null) {
    const match = /^\/u\/([^/]+)\/?$/.exec(pathname);
    if (match?.[1])
      return normalizeAuthorRef(decodeURIComponent(match[1])) || null;
  }
  return null;
}

/** An actor (user) resolved for an inline `#didMention` facet. */
export interface ResolvedActorMention {
  did: string;
  handle: string | null;
  avatarUrl: string | null;
}

/** Resolved actor mentions keyed by DID. */
export type ActorMentionMap = Record<string, ResolvedActorMention>;

/**
 * A Standard Reader document resolved for an inline `#atMention` facet whose
 * target is a `pub.leaflet.document` (or its `site.standard.document` twin).
 * Rendered as an inline link to `/a/$did/$rkey` instead of bare text.
 */
export interface ResolvedDocumentMention {
  /** Canonical `site.standard.document` AT-URI. */
  atUri: string;
  did: string;
  rkey: string;
  title: string;
  /** Owning publication's icon (owner avatar fallback), shown beside the title. */
  iconUrl: string | null;
}

/** Resolved document mentions keyed by canonical document AT-URI. */
export type DocumentMentionMap = Record<string, ResolvedDocumentMention>;

/** The full set of inline references resolved for a document. */
export interface InlineMentions {
  publications: PublicationMentionMap;
  documents: DocumentMentionMap;
  actors: ActorMentionMap;
  /**
   * Actors referenced by a `#link` facet pointing at a user profile (in-app or
   * Bluesky), keyed by the ident ({@link actorLinkIdent}) — DID or handle — so
   * the chip can show an avatar. Separate from {@link actors} (keyed by DID from
   * `#didMention` facets) because these are keyed by whatever the link carried.
   */
  actorLinks: ActorMentionMap;
}

export const EMPTY_INLINE_MENTIONS: InlineMentions = {
  publications: {},
  documents: {},
  actors: {},
  actorLinks: {},
};

/** References an inline facet may point at, gathered from a document's content. */
export interface InlineMentionRefs {
  /** Canonical `site.standard.publication` AT-URIs from `#atMention` facets. */
  publicationAtUris: Array<string>;
  /** Homepage URLs from `#link` facets (candidate publications). */
  publicationUrls: Array<string>;
  /** Canonical `site.standard.document` AT-URIs from `#atMention` facets. */
  documentAtUris: Array<string>;
  /** Actor DIDs from `#didMention` / `#mention` facets. */
  actorDids: Array<string>;
  /** User idents (handle or DID) from `#link` facets targeting a profile. */
  actorLinks: Array<string>;
}

/** True when there is at least one reference worth resolving. */
export function hasInlineMentionRefs(refs: InlineMentionRefs): boolean {
  return (
    refs.publicationAtUris.length > 0 ||
    refs.publicationUrls.length > 0 ||
    refs.documentAtUris.length > 0 ||
    refs.actorDids.length > 0 ||
    refs.actorLinks.length > 0
  );
}

/**
 * Walk a Leaflet content/document payload for inline facet features worth
 * resolving: publication `#atMention`s (by AT-URI) and `#link`s (by homepage
 * URL), plus actor `#didMention`s. Structure-agnostic — recurses any object
 * carrying a `features` array, so it covers text, headings, blockquotes, and
 * nested list items alike.
 */
export function collectInlineMentionRefs(content: unknown): InlineMentionRefs {
  const publicationAtUris = new Set<string>();
  const publicationUrls = new Set<string>();
  const documentAtUris = new Set<string>();
  const actorDids = new Set<string>();
  const actorLinks = new Set<string>();

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isRecord(node)) return;

    const features = node.features;
    if (Array.isArray(features)) {
      for (const feature of features) {
        if (!isRecord(feature)) continue;
        const kind = facetKind(feature.$type);
        if (kind === "atMention" && typeof feature.atURI === "string") {
          // An `#atMention` targets either a publication or a document; the two
          // key helpers are mutually exclusive by collection.
          const pubKey = publicationMentionKey(feature.atURI);
          if (pubKey) publicationAtUris.add(pubKey);
          const docKey = documentMentionKey(feature.atURI);
          if (docKey) documentAtUris.add(docKey);
        } else if (kind === "link" && typeof feature.uri === "string") {
          // A `#link` to a user profile is an actor mention; anything else is a
          // candidate publication homepage.
          const ident = actorLinkIdent(feature.uri);
          if (ident) actorLinks.add(ident);
          else publicationUrls.add(feature.uri);
        } else if (
          (kind === "didMention" || kind === "mention") &&
          typeof feature.did === "string"
        ) {
          actorDids.add(feature.did);
        }
      }
    }

    for (const key of Object.keys(node)) walk(node[key]);
  };

  walk(content);
  return {
    publicationAtUris: [...publicationAtUris],
    publicationUrls: [...publicationUrls],
    documentAtUris: [...documentAtUris],
    actorDids: [...actorDids],
    actorLinks: [...actorLinks],
  };
}

/** Actor a `#didMention` / `#mention` facet segment references, if resolved. */
export function lookupActorMention(
  features: ReadonlyArray<unknown>,
  actors: ActorMentionMap,
): ResolvedActorMention | null {
  for (const feature of features) {
    if (!isRecord(feature)) continue;
    const kind = facetKind(feature.$type);
    if (
      (kind === "didMention" || kind === "mention") &&
      typeof feature.did === "string"
    ) {
      const hit = actors[feature.did];
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * If a facet segment carries a `#link` to a user profile, return its ident
 * ({@link actorLinkIdent}) plus the resolved actor when available. The ident is
 * returned even before resolution so the segment can render as a mention link
 * immediately; the avatar fills in once `actorLinks` resolves.
 */
export function lookupActorLinkMention(
  features: ReadonlyArray<unknown>,
  actorLinks: ActorMentionMap,
): { ident: string; actor: ResolvedActorMention | null } | null {
  for (const feature of features) {
    if (!isRecord(feature)) continue;
    if (
      facetKind(feature.$type) === "link" &&
      typeof feature.uri === "string"
    ) {
      const ident = actorLinkIdent(feature.uri);
      if (ident) return { ident, actor: actorLinks[ident] ?? null };
    }
  }
  return null;
}

/**
 * Resolve the publication a facet segment references against a resolved map, if
 * any. Explicit `#atMention` targets win over homepage `#link`s.
 */
export function lookupPublicationMention(
  features: ReadonlyArray<unknown>,
  mentions: PublicationMentionMap,
): ResolvedPublicationMention | null {
  for (const feature of features) {
    if (!isRecord(feature)) continue;
    if (
      facetKind(feature.$type) === "atMention" &&
      typeof feature.atURI === "string"
    ) {
      const key = publicationMentionKey(feature.atURI);
      const hit = key ? mentions[key] : undefined;
      if (hit) return hit;
    }
  }
  for (const feature of features) {
    if (!isRecord(feature)) continue;
    if (
      facetKind(feature.$type) === "link" &&
      typeof feature.uri === "string"
    ) {
      const hit = mentions[mentionUrlKey(feature.uri)];
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Resolve the document an `#atMention` facet segment references against a
 * resolved map, if any.
 */
export function lookupDocumentMention(
  features: ReadonlyArray<unknown>,
  documents: DocumentMentionMap,
): ResolvedDocumentMention | null {
  for (const feature of features) {
    if (!isRecord(feature)) continue;
    if (
      facetKind(feature.$type) === "atMention" &&
      typeof feature.atURI === "string"
    ) {
      const key = documentMentionKey(feature.atURI);
      const hit = key ? documents[key] : undefined;
      if (hit) return hit;
    }
  }
  return null;
}
