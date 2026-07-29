import { BSKY_WEB_CLIENT_HOSTS } from "../../../standard-reader/src/lib/atproto/bsky-clients.ts";

// bsky.app and web clients forked from its `social-app` codebase share the
// same post/embed DOM shape, so they all get the in-embed "Save to Standard
// Reader" button. The host list is shared with the reader app (which resolves
// links to these clients into in-app embeds); add a fork there and every
// permission / content script match / exclusion list below picks it up.
const DEV_BSKY_HOSTS: ReadonlyArray<string> = [
  "staging.bsky.app",
  "main.bsky.dev",
];
const BSKY_HOSTS: ReadonlyArray<string> = BSKY_WEB_CLIENT_HOSTS.filter(
  (host) => !DEV_BSKY_HOSTS.includes(host),
);

/** Production host permissions for store builds (build / zip). */
export const PRODUCTION_HOST_PERMISSIONS = [
  "https://standard-reader.app/*",
  ...BSKY_HOSTS.map((host) => `https://${host}/*`),
  "<all_urls>",
] as const;

/** Extra hosts for local dev and staging (`pnpm extension:dev`). */
export const DEV_HOST_PERMISSIONS: ReadonlyArray<string> = [
  "https://staging.standard-reader.app/*",
  "http://127.0.0.1:3000/*",
  "http://127.0.0.1:3001/*",
  ...DEV_BSKY_HOSTS.map((host) => `https://${host}/*`),
];

export function hostPermissions(includeDev: boolean): Array<string> {
  return includeDev
    ? [...PRODUCTION_HOST_PERMISSIONS, ...DEV_HOST_PERMISSIONS]
    : [...PRODUCTION_HOST_PERMISSIONS];
}

const APP_HOSTS = ["standard-reader.app"] as const;
const DEV_APP_HOSTS = ["staging.standard-reader.app"] as const;
const DEV_LOOPBACK_HOSTS = ["localhost", "127.0.0.1"] as const;

export function appHosts(includeDev: boolean): ReadonlyArray<string> {
  return includeDev ? [...APP_HOSTS, ...DEV_APP_HOSTS] : APP_HOSTS;
}

export function bskyHosts(includeDev: boolean): ReadonlyArray<string> {
  return includeDev ? [...BSKY_HOSTS, ...DEV_BSKY_HOSTS] : BSKY_HOSTS;
}

export function overlayExcludedHosts(includeDev: boolean): Set<string> {
  return new Set([
    ...appHosts(includeDev),
    ...bskyHosts(includeDev),
    ...(includeDev ? DEV_LOOPBACK_HOSTS : []),
  ]);
}

export function pageOverlayExcludeMatches(includeDev: boolean): Array<string> {
  const excludes = [
    "*://standard-reader.app/*",
    "*://*.standard-reader.app/*",
    ...BSKY_HOSTS.map((host) => `*://${host}/*`),
  ];
  if (includeDev) {
    excludes.push(
      "*://staging.standard-reader.app/*",
      ...DEV_BSKY_HOSTS.map((host) => `*://${host}/*`),
      "*://localhost/*",
      "*://127.0.0.1/*",
    );
  }
  return excludes;
}

export function authCallbackMatches(includeDev: boolean): Array<string> {
  const matches = ["https://standard-reader.app/extension/connected*"];
  if (includeDev) {
    matches.push(
      "http://127.0.0.1/extension/connected*",
      "https://staging.standard-reader.app/extension/connected*",
    );
  }
  return matches;
}

export function bskyEmbedMatches(includeDev: boolean): Array<string> {
  const matches = BSKY_HOSTS.map((host) => `https://${host}/*`);
  if (includeDev) {
    matches.push(...DEV_BSKY_HOSTS.map((host) => `https://${host}/*`));
  }
  return matches;
}
