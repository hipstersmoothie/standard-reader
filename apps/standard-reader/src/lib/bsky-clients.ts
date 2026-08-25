/**
 * The Bluesky clients we can hand a reader off to, with the two things the
 * waypoints catalog doesn't carry: a vendored app icon and whether the client
 * implements Bluesky's `/intent/compose` route.
 *
 * The *list* of clients that can render a post is not hard-coded here — that
 * comes from `@aturi.to/waypoints` at call time (see
 * `#/lib/comment-destinations`), so a client added to that catalog shows up
 * without a change to this file. This catalog decorates the ones we know and
 * adds the ones the catalog hasn't picked up yet (`inCatalog: false`).
 *
 * Icons are each app's own touch icon, fetched once and vendored under
 * `public/brand/clients/` rather than hot-linked: several of these hosts sit
 * behind bot protection or serve their SPA shell for unknown asset paths, so a
 * runtime fetch is unreliable, and vendoring keeps the dialog from pinging nine
 * third parties every time it opens.
 *   bluesky   web-cdn.bsky.app/static/apple-touch-icon.png
 *   deer      deer.social/pwa/apple-touch-icon/apple-touch-icon-180.png
 *   mu        mu.social/pwa/apple-touch-icon/apple-touch-icon-180.png
 *   blacksky  blacksky.community/static/apple-touch-icon.png
 *   reddwarf  reddwarf.app/redstar.png
 *   anisota   anisota.net/anisota-192.png
 *   bluepy    bluepy.social/apple-touch-icon.png
 *   witchsky  witchsky.app/favicon.ico (a 64×64 PNG despite the extension)
 */

export interface BskyClient {
  /** Matches the `@aturi.to/waypoints` waypoint id where the catalog has one. */
  id: string;
  label: string;
  origin: string;
  /** Vendored app icon, or null when we couldn't get one from the app. */
  iconUrl: string | null;
  /**
   * Implements `/intent/compose`. True for the official app and for forks of
   * it, which inherit the route; independent implementations (Anisota, Bluepy)
   * are reply-only until we can confirm otherwise, and Catsky is left out
   * because its host wasn't reachable when this list was built.
   * @see https://docs.bsky.app/docs/advanced-guides/intent-links
   */
  supportsComposeIntent: boolean;
  /**
   * False for clients the waypoints catalog doesn't list yet — those are
   * appended by hand, using the official app's `/profile/:did/post/:rkey`
   * permalink shape.
   */
  inCatalog: boolean;
}

const ICON_BASE = "/brand/clients";

/** Bluesky first; the rest as the waypoints catalog orders them. */
export const BSKY_CLIENTS: ReadonlyArray<BskyClient> = [
  {
    id: "bluesky",
    label: "Bluesky",
    origin: "https://bsky.app",
    iconUrl: `${ICON_BASE}/bluesky.png`,
    supportsComposeIntent: true,
    inCatalog: true,
  },
  {
    id: "blacksky",
    label: "blacksky.community",
    origin: "https://blacksky.community",
    iconUrl: `${ICON_BASE}/blacksky.png`,
    supportsComposeIntent: true,
    inCatalog: true,
  },
  {
    id: "deer",
    label: "deer.social",
    origin: "https://deer.social",
    iconUrl: `${ICON_BASE}/deer.png`,
    supportsComposeIntent: true,
    inCatalog: true,
  },
  {
    id: "witchsky",
    label: "witchsky.app",
    origin: "https://witchsky.app",
    iconUrl: `${ICON_BASE}/witchsky.png`,
    supportsComposeIntent: true,
    inCatalog: true,
  },
  {
    id: "reddwarf",
    label: "reddwarf.app",
    origin: "https://reddwarf.app",
    iconUrl: `${ICON_BASE}/reddwarf.png`,
    supportsComposeIntent: true,
    inCatalog: true,
  },
  // Not in the waypoints catalog (yet). It's a fork of the official app — same
  // PWA asset paths and the same `/profile/:did/post/:rkey` permalinks — so it
  // gets both the permalink shape and the compose intent.
  {
    id: "mu",
    label: "mu.social",
    origin: "https://mu.social",
    iconUrl: `${ICON_BASE}/mu.png`,
    supportsComposeIntent: true,
    inCatalog: false,
  },
  {
    id: "catsky",
    label: "catsky.social",
    origin: "https://catsky.social",
    iconUrl: null,
    supportsComposeIntent: false,
    inCatalog: true,
  },
  {
    id: "anisota",
    label: "Anisota",
    origin: "https://anisota.net",
    iconUrl: `${ICON_BASE}/anisota.png`,
    supportsComposeIntent: false,
    inCatalog: true,
  },
  {
    id: "bluepy",
    label: "Bluepy",
    origin: "https://bluepy.social",
    iconUrl: `${ICON_BASE}/bluepy.png`,
    supportsComposeIntent: false,
    inCatalog: true,
  },
];

const BY_ID = new Map(BSKY_CLIENTS.map((client) => [client.id, client]));

export function bskyClientById(id: string): BskyClient | undefined {
  return BY_ID.get(id);
}

/** Clients that can be handed a pre-filled draft. */
export const BSKY_COMPOSE_CLIENTS: ReadonlyArray<BskyClient> =
  BSKY_CLIENTS.filter((client) => client.supportsComposeIntent);

/** Clients we list but the waypoints catalog doesn't resolve for us. */
export const BSKY_CLIENTS_OFF_CATALOG: ReadonlyArray<BskyClient> =
  BSKY_CLIENTS.filter((client) => !client.inCatalog);
