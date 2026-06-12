import type { ExtensionSettings } from "./types";

export const AUTH_SESSION_COOKIE = "standard-reader-auth.session_token";

export const DEFAULT_SETTINGS = {
  overlayEnabled: true,
  bskyBadgesEnabled: true,
} as const;

/** Default until `/api/extension/*` ships on production. Override via `extension/.env`. */
export const DEFAULT_API_ORIGIN = "http://127.0.0.1:3000";

export const PRODUCTION_API_ORIGIN = "https://standard-reader.app";

/** Bluesky OAuth requires loopback IP — normalize legacy localhost origins. */
export function normalizeDevApiOrigin(origin: string): string {
  try {
    const parsed = new URL(origin.replace(/\/$/, "") || origin);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.origin;
  } catch {
    return origin.replace(/\/$/, "");
  }
}

export function getApiOrigin(): string {
  const configured = import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, "");
  if (configured) return normalizeDevApiOrigin(configured);
  return DEFAULT_API_ORIGIN;
}

function storageBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.sync.get([
    "overlayEnabled",
    "bskyBadgesEnabled",
    "apiOrigin",
  ]);
  return {
    overlayEnabled: storageBool(
      stored.overlayEnabled,
      DEFAULT_SETTINGS.overlayEnabled,
    ),
    bskyBadgesEnabled: storageBool(
      stored.bskyBadgesEnabled,
      DEFAULT_SETTINGS.bskyBadgesEnabled,
    ),
    apiOrigin:
      typeof stored.apiOrigin === "string" ? stored.apiOrigin : undefined,
  };
}

export async function getEffectiveApiOrigin(): Promise<string> {
  const settings = await loadSettings();
  const configured = settings.apiOrigin?.replace(/\/$/, "") ?? getApiOrigin();
  return normalizeDevApiOrigin(configured);
}

export const LOGIN_PATH = "/login?redirect=/extension/connected";
