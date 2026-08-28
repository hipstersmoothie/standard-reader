/**
 * TypeScript shapes for the AT Protocol records we ingest and the `tap` event
 * envelope that delivers them. These mirror the standard.site lexicons (see
 * https://standard.site/docs) and the Bluesky profile record. Everything is
 * intentionally permissive (`unknown`/optional) — records on the network may be
 * minimal, extended, or malformed, so the mapping layer validates as it reads.
 */

/** An atproto blob reference as it appears inside a record. */
export interface BlobRef {
  $type?: "blob";
  // `{$link}` when decoded from plain JSON, a bare CID string in some payloads,
  // or a multiformats `CID` instance after `@atproto/lex` `lexParse` (the tap
  // channel path). `blobCid()` normalizes all three to a CID string.
  ref?: { $link?: string; toString?: () => string } | string;
  mimeType?: string;
  size?: number;
}

/** A strong reference (`com.atproto.repo.strongRef`). */
export interface StrongRef {
  uri: string;
  cid: string;
}

/** `site.standard.theme.color#rgb` (0–255 channels). */
export interface ThemeRgb {
  $type?: string;
  r?: number;
  g?: number;
  b?: number;
}

/** `site.standard.theme.basic` (embedded in a publication's `basicTheme`). */
export interface BasicTheme {
  background?: ThemeRgb;
  foreground?: ThemeRgb;
  accent?: ThemeRgb;
  accentForeground?: ThemeRgb;
  /** Standard Reader extension (legacy): fonts lived inside basicTheme before
   * `app.standard-reader.publicationTheme` sidecar records. */
  fonts?: { title?: string; body?: string };
}

/** `site.standard.publication`. */
export interface PublicationRecord {
  $type?: string;
  url: string;
  name: string;
  description?: string;
  icon?: BlobRef;
  basicTheme?: BasicTheme;
  /**
   * The publishing platform's own richer theme, kept alongside the `basicTheme`
   * interop baseline and discriminated by `$type` (`pub.leaflet.publication#theme`,
   * `blog.pckt.theme`, `app.offprint.theme`, …). Left untyped on purpose — it is
   * third-party and open-ended; `resolvePublicationTheme`
   * (`#/lib/publication-theme-source`) narrows it per `$type`.
   */
  theme?: unknown;
  preferences?: {
    showInDiscover?: boolean;
    /**
     * `"ltr"` | `"rtl"` (lexicon default `"rtl"`). The publisher's prev/next
     * reading direction — `"ltr"` marks a serial that reads forwards from its
     * first post. See `#/lib/publication/serial`.
     */
    prevNextDirection?: string;
  };
}

/** `site.standard.document#contributor`. */
export interface DocumentContributorRecord {
  did: string;
  role?: string;
  displayName?: string;
}

/** `site.standard.document`. */
export interface DocumentRecord {
  $type?: string;
  site: string;
  title: string;
  publishedAt: string;
  path?: string;
  description?: string;
  textContent?: string;
  content?: { $type?: string } & Record<string, unknown>;
  coverImage?: BlobRef;
  tags?: Array<string>;
  updatedAt?: string;
  bskyPostRef?: StrongRef;
  contributors?: Array<DocumentContributorRecord>;
  /** Open union of related resources (see `app.standard-reader.collection#documentLink`). */
  links?: Array<{ $type?: string; uri?: string } & Record<string, unknown>>;
  /** Legacy Standard Reader extension (pre-sidecar). Prefer
   * `app.standard-reader.collection` at the same rkey. */
  readerCollection?: unknown;
}

/**
 * `site.mochott.article` — mochott's body sidecar, sitting at the same rkey as
 * its `site.standard.document` (see `#/lib/mochott/types`).
 */
export interface MochottArticleRecord {
  $type?: string;
  title?: string;
  /** TipTap document node (`{ type: "doc", content: [...] }`). */
  content?: { type?: string } & Record<string, unknown>;
  textContent?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** `app.standard-reader.collection` sidecar for a curated magazine edition. */
export interface CollectionSidecarRecord {
  $type?: string;
  document: string;
  editorial?: CollectionEditorialSidecar;
  colophon?: CollectionColophonSidecar;
  items: Array<CollectionItemSidecar>;
  createdAt: string;
  updatedAt?: string;
}

export interface CollectionEditorialSidecar {
  title?: string;
  body?: string;
}

export interface CollectionColophonSidecar {
  body?: string;
}

export interface CollectionItemSidecar {
  document: string;
  note?: string;
}

/** `app.standard-reader.collectionsPublication` — marks a publication series. */
export interface CollectionsPublicationRecord {
  $type?: string;
  publication: string;
  createdAt: string;
}

/** `app.standard-reader.publicationTheme` — typography for a publication. */
export interface PublicationThemeRecord {
  $type?: string;
  publication: string;
  fonts?: { title?: string; body?: string };
  createdAt: string;
  updatedAt?: string;
}

/** `site.standard.graph.subscription`. */
export interface SubscriptionRecord {
  $type?: string;
  publication: string;
  createdAt?: string;
}

/** `site.standard.graph.recommend`. */
export interface RecommendRecord {
  $type?: string;
  document: string;
  createdAt?: string;
}

/** `app.standard-reader.graph.follow` — follows another user by DID. */
export interface UserFollowRecord {
  $type?: string;
  subject: string;
  /** Publications of the followed user the reader has opted out of (following a
   * user subscribes to all their publications except these). */
  excludedPublications?: Array<string>;
  createdAt?: string;
}

/**
 * `app.standard-reader.graph.mute` — mutes a subject for this reader: either a
 * user (a DID) or a publication (the AT-URI of its `site.standard.publication`
 * record). Presence means muted; deleting unmutes. Hidden from the reader's
 * feeds and discovery only — direct navigation and subscriptions are untouched.
 */
export interface MuteRecord {
  $type?: string;
  /** A user DID (`did:...`) or a publication AT-URI (`at://...`). */
  subject: string;
  createdAt?: string;
}

/** `app.standard-reader.read` — an article the reader has read. */
export interface ReadRecord {
  $type?: string;
  subject: string;
  createdAt?: string;
}

/** `app.standard-reader.bookmark` — an article saved for later. */
export interface BookmarkRecord {
  $type?: string;
  subject: string;
  createdAt?: string;
}

/** A single per-label visibility override on a labeler subscription. */
export interface LabelPrefRecord {
  val: string;
  visibility: "ignore" | "warn" | "hide";
}

/**
 * `app.standard-reader.labeler.subscription` (V2) / legacy
 * `app.standard-reader.labelerSubscription` — a labeler the reader subscribes
 * to. Same record shape across both NSIDs; new writes target V2.
 */
export interface LabelerSubscriptionRecord {
  $type?: string;
  labeler: string;
  labels?: Array<LabelPrefRecord>;
  /** Absent means enabled; `false` mutes the labeler without unsubscribing. */
  enabled?: boolean;
  createdAt?: string;
}

/** `app.standard-reader.list` — a named, ordered, shareable publication list. */
export interface ListRecord {
  $type?: string;
  name: string;
  description?: string;
  /** Ordered at-uris of the `site.standard.publication` records in the list. */
  publications: Array<string>;
  /** Ordered DIDs of the users (authors) in the list. Optional. */
  users?: Array<string>;
  createdAt?: string;
}

/** `app.standard-reader.listSave` — another reader's list saved into this app. */
export interface ListSaveRecord {
  $type?: string;
  list: string;
  createdAt?: string;
}

/** `app.standard-reader.sidebarPref` — a reader's sidebar list ordering and
 * collapsed-group preferences. Singleton (rkey `self`). */
export interface SidebarPrefRecord {
  $type?: string;
  /** Legacy: ordered at-uris of the reader's list groups (own + saved).
   * Fallback top-level list order only while `treeOrder` is empty. */
  listOrder?: Array<string>;
  /** Manual top-level order of the subscriptions tree: list-group at-uris
   * interleaved with ungrouped publication at-uris / person DIDs. Supersedes
   * `listOrder` once populated. */
  treeOrder?: Array<string>;
  /** How the sidebar's subscriptions are ordered. Absent means "default". */
  subscriptionSort?: "default" | "recent" | "alpha" | "unread";
  /** At-uris of the list groups the reader has collapsed. */
  collapsed?: Array<string>;
  /** Whether "Customize sidebar" is enabled (gates `hiddenNav`). */
  customizeNav?: boolean;
  /** Stable ids of the primary nav items the reader has hidden. */
  hiddenNav?: Array<string>;
  updatedAt?: string;
}

/** `app.standard-reader.site` — how an author or one of their publications
 * presents itself as a standalone site (rkey `self`, or derived from the
 * publication's AT-URI). */
export interface SiteRecord {
  $type?: string;
  /** The publication this site presents; absent for the author's own site. */
  publication?: string;
  /** Which presentation the site is laid out in. */
  style?: string;
  /** Short line under the site's name. */
  tagline?: string;
  /** The site's own four flat colors, mirroring `site.standard.theme.basic`. */
  theme?: {
    background?: string;
    foreground?: string;
    accent?: string;
    accentForeground?: string;
  };
  /** Outbound links shown in the masthead. */
  links?: Array<{ label?: string; url?: string }>;
  /** Whether the footer links back to the Standard Reader page. */
  showStandardReaderLink?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** `app.bsky.actor.profile`. */
export interface BskyProfileRecord {
  $type?: string;
  displayName?: string;
  description?: string;
  avatar?: BlobRef;
  banner?: BlobRef;
}

// ── ingest event envelope ───────────────────────────────────────────────────
//
// The read-model's own event shape, deliberately not any upstream's. Jetstream
// commits are adapted into it (`#/server/ingest/jetstream-event`) and so is the
// PDS reconcile sweep's replay, which is what lets one dispatcher — and one set
// of handlers — serve both without a second, drifting mapping.

export type IngestAction = "create" | "update" | "delete";

export interface IngestRecordPayload {
  /** True if delivered live (firehose) vs historical backfill/resync. */
  live: boolean;
  rev: string;
  did: string;
  collection: string;
  rkey: string;
  action: IngestAction;
  /** Present for create/update; absent for delete. */
  cid?: string;
  /** The record body; absent for delete. */
  record?: Record<string, unknown>;
}

export interface IngestIdentityPayload {
  did: string;
  handle?: string;
  isActive?: boolean;
  status?: string;
}

export interface IngestRecordEvent {
  /** The stream cursor this event arrived at (Jetstream's `seq`). */
  id: number;
  type: "record";
  record: IngestRecordPayload;
}

export interface IngestIdentityEvent {
  id: number;
  type: "identity";
  identity: IngestIdentityPayload;
}

export type IngestEvent = IngestRecordEvent | IngestIdentityEvent;
