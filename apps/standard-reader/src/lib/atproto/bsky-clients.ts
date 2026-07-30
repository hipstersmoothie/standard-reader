/**
 * Bluesky web clients — `bsky.app` plus the alternate clients forked from its
 * `social-app` codebase (Witchsky, mu.social, deer.social, …). They all share
 * the same URL grammar (`/profile/<ident>`, `/profile/<ident>/post/<rkey>`, …)
 * and address the same AT Protocol records, so a link to any of them is a link
 * to the *record*, not to a third-party website.
 *
 * Keep this module dependency-free: it is imported by the browser extension's
 * manifest generation, which loads outside the app's bundler.
 */

/**
 * Hosts whose URLs address AT Protocol records via the `social-app` grammar.
 * Adding a fork here makes every link to it resolve in-app: profile links
 * become mention chips routed to `/u/$did`, and post / feed / list / starter
 * pack cards become native embeds.
 */
export const BSKY_WEB_CLIENT_HOSTS = [
  "bsky.app",
  "staging.bsky.app",
  "main.bsky.dev",
  "deer.social",
  "witchsky.app",
  "mu.social",
  // Blacksky's client. Not `blackskyweb.xyz` — that is their WordPress site,
  // and it is the host their articles usually link to.
  "blacksky.community",
] as const;

const HOSTS = new Set<string>(BSKY_WEB_CLIENT_HOSTS);

/** True when `hostname` is a known Bluesky web client (case-insensitive). */
export function isBskyClientHost(hostname: string): boolean {
  return HOSTS.has(hostname.trim().toLowerCase());
}

/** The AT Protocol record kinds a `social-app` URL can address. */
export type BskyClientRefKind =
  | "profile"
  | "post"
  | "feed"
  | "list"
  | "starterPack";

/**
 * A record addressed by a Bluesky web client URL. `ident` is whatever the URL
 * carried — a DID or a handle — and `rkey` is absent only for `profile`.
 */
export interface BskyClientRef {
  kind: BskyClientRefKind;
  /** Client host the link pointed at, e.g. `witchsky.app`. */
  host: string;
  /** DID or handle of the record's repo. */
  ident: string;
  /** Record key, for everything but a bare profile. */
  rkey?: string;
}

/** `app.bsky.*` collection each ref kind lives in (`profile` has no record). */
const COLLECTION: Record<Exclude<BskyClientRefKind, "profile">, string> = {
  feed: "app.bsky.feed.generator",
  list: "app.bsky.graph.list",
  post: "app.bsky.feed.post",
  starterPack: "app.bsky.graph.starterpack",
};

/** Path segment `social-app` uses for each record kind under `/profile/…`. */
const PROFILE_SUBPATH: Record<string, BskyClientRefKind> = {
  feed: "feed",
  lists: "list",
  post: "post",
};

function cleanIdent(raw: string): string | null {
  let ident: string;
  try {
    ident = decodeURIComponent(raw);
  } catch {
    ident = raw;
  }
  ident = ident.trim();
  if (ident.startsWith("@")) ident = ident.slice(1);
  // A handle needs a dot; a DID is taken verbatim. Guards against `/profile/`
  // junk (`me`, `settings`, …) resolving to a bogus record reference.
  if (!ident) return null;
  if (!ident.startsWith("did:") && !ident.includes(".")) return null;
  return ident;
}

/**
 * Parse a Bluesky web client URL into the AT Protocol record it addresses.
 * Returns null for any other URL, including client pages that are not records
 * (`/settings`, `/search`, a bare `https://witchsky.app/`).
 */
export function parseBskyClientUrl(url: string): BskyClientRef | null {
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!isBskyClientHost(host)) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);

  // `/starter-pack/<ident>/<rkey>` — the one record route outside `/profile`.
  if (segments[0] === "starter-pack" && segments.length === 3) {
    const ident = cleanIdent(segments[1] ?? "");
    const rkey = segments[2];
    if (!ident || !rkey) return null;
    return { host, ident, kind: "starterPack", rkey };
  }

  if (segments[0] !== "profile") return null;

  const ident = cleanIdent(segments[1] ?? "");
  if (!ident) return null;

  if (segments.length === 2) return { host, ident, kind: "profile" };

  if (segments.length === 4) {
    const kind = PROFILE_SUBPATH[segments[2] ?? ""];
    const rkey = segments[3];
    if (!kind || !rkey) return null;
    return { host, ident, kind, rkey };
  }

  return null;
}

/**
 * AT-URI for a parsed ref, or null when the ident is a handle (an AT-URI needs
 * a DID) or the ref is a bare profile.
 */
export function bskyClientRefAtUri(ref: BskyClientRef): string | null {
  if (ref.kind === "profile" || !ref.rkey) return null;
  if (!ref.ident.startsWith("did:")) return null;
  return `at://${ref.ident}/${COLLECTION[ref.kind]}/${ref.rkey}`;
}

/**
 * If `url` is a Bluesky client link to a *bare profile*, return the user's
 * ident (handle or DID). A post, feed, or list is about that object rather
 * than a mention of its owner, so those return null.
 */
export function bskyClientProfileIdent(url: string): string | null {
  const ref = parseBskyClientUrl(url);
  return ref?.kind === "profile" ? ref.ident : null;
}
