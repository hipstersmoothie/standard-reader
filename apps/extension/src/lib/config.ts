import { parseReaderVoicePreference } from "#/lib/reader-voice";

import type { ExtensionSettings } from "./types";

export const AUTH_SESSION_COOKIE = "standard-reader-auth.session_token";

export const DEFAULT_SETTINGS = {
  overlayEnabled: true,
  bskyBadgesEnabled: true,
  readerVoice: "auto",
} as const satisfies Pick<
  ExtensionSettings,
  "overlayEnabled" | "bskyBadgesEnabled" | "readerVoice"
>;

/** Loopback default for local dev (`pnpm extension:dev`). */
export const DEFAULT_API_ORIGIN = "http://127.0.0.1:3000";

export const PRODUCTION_API_ORIGIN = "https://standard-reader.app";

function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin.replace(/\/$/, "") || origin).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

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
  // Store / production builds must never ship with a loopback default.
  if (import.meta.env.PROD) return PRODUCTION_API_ORIGIN;
  return DEFAULT_API_ORIGIN;
}

function storageBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.sync.get([
    "overlayEnabled",
    "bskyBadgesEnabled",
    "readerVoice",
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
    readerVoice: parseReaderVoicePreference(stored.readerVoice),
    apiOrigin:
      typeof stored.apiOrigin === "string" ? stored.apiOrigin : undefined,
  };
}

export async function getEffectiveApiOrigin(): Promise<string> {
  const settings = await loadSettings();
  const stored = settings.apiOrigin?.replace(/\/$/, "");
  const baked = getApiOrigin();
  // Ignore stale loopback origins left in sync storage from local dev.
  if (stored && !(import.meta.env.PROD && isLoopbackOrigin(stored))) {
    return normalizeDevApiOrigin(stored);
  }
  return normalizeDevApiOrigin(baked);
}

export const LOGIN_PATH = "/login?redirect=/extension/connected";
