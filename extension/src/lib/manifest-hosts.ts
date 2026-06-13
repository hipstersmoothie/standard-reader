/** Production host permissions for store builds (build / zip). */
export const PRODUCTION_HOST_PERMISSIONS = [
  "https://standard-reader.app/*",
  "https://bsky.app/*",
  "<all_urls>",
] as const;

/** Extra hosts for local dev and staging (`pnpm extension:dev`). */
export const DEV_HOST_PERMISSIONS = [
  "https://staging.standard-reader.app/*",
  "http://127.0.0.1:3000/*",
  "http://127.0.0.1:3001/*",
  "https://staging.bsky.app/*",
] as const;

export function hostPermissions(includeDev: boolean): Array<string> {
  return includeDev
    ? [...PRODUCTION_HOST_PERMISSIONS, ...DEV_HOST_PERMISSIONS]
    : [...PRODUCTION_HOST_PERMISSIONS];
}

const APP_HOSTS = ["standard-reader.app"] as const;
const DEV_APP_HOSTS = ["staging.standard-reader.app"] as const;
const BSKY_HOSTS = ["bsky.app"] as const;
const DEV_BSKY_HOSTS = ["staging.bsky.app"] as const;
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
    "*://bsky.app/*",
  ];
  if (includeDev) {
    excludes.push(
      "*://staging.standard-reader.app/*",
      "*://staging.bsky.app/*",
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
  return includeDev
    ? ["https://bsky.app/*", "https://staging.bsky.app/*"]
    : ["https://bsky.app/*"];
}
