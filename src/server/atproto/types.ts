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
  ref?: { $link: string } | string;
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
}

/** `site.standard.publication`. */
export interface PublicationRecord {
  $type?: string;
  url: string;
  name: string;
  description?: string;
  icon?: BlobRef;
  basicTheme?: BasicTheme;
  preferences?: { showInDiscover?: boolean };
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

/** `app.standard-reader.bookmark` — a reader's saved article. */
export interface BookmarkRecord {
  $type?: string;
  subject: string;
  createdAt?: string;
}

/** `app.standard-reader.read` — an article the reader has read. */
export interface ReadRecord {
  $type?: string;
  subject: string;
  createdAt?: string;
}

/** `app.bsky.actor.profile`. */
export interface BskyProfileRecord {
  $type?: string;
  displayName?: string;
  description?: string;
  avatar?: BlobRef;
  banner?: BlobRef;
}

// ── tap event envelope (see cmd/tap README "Event Format") ──────────────────

export type TapAction = "create" | "update" | "delete";

export interface TapRecordPayload {
  /** True if delivered live (firehose) vs historical backfill/resync. */
  live: boolean;
  rev: string;
  did: string;
  collection: string;
  rkey: string;
  action: TapAction;
  /** Present for create/update; absent for delete. */
  cid?: string;
  /** The record body; absent for delete. */
  record?: Record<string, unknown>;
}

export interface TapIdentityPayload {
  did: string;
  handle?: string;
  isActive?: boolean;
  status?: string;
}

export interface TapRecordEvent {
  id: number;
  type: "record";
  record: TapRecordPayload;
}

export interface TapIdentityEvent {
  id: number;
  type: "identity";
  identity: TapIdentityPayload;
}

export type TapEvent = TapRecordEvent | TapIdentityEvent;
