import { homedir } from "node:os";
import { join } from "node:path";

import { STANDARD_READER_SERVICE } from "@standard-reader/lexicons";

/** Default PDS/entryway used when a handle can't hint at one. */
export const DEFAULT_PDS_SERVICE = "https://bsky.social";

export interface McpServerConfig {
  /**
   * Base URL of the Standard Reader AppView (its XRPC service lives under
   * `/xrpc`). Override with `STANDARD_READER_SERVICE` to target a preview
   * deployment or a local `pnpm dev` instance.
   */
  service: string;
  /**
   * PDS / entryway used for `createSession` at login time. The real PDS is
   * re-derived from the account's DID document once the session exists, so
   * this only matters for the initial handshake.
   */
  pdsService: string;
  /** Where the persisted session lives on disk. */
  sessionFile: string;
  /**
   * Credentials supplied out-of-band (env vars). When both are present the
   * server signs in on demand without a prior `login`, which is what headless
   * hosts (CI, containers) need.
   */
  identifier: string | undefined;
  password: string | undefined;
}

function defaultSessionFile(): string {
  const xdg = process.env.XDG_STATE_HOME?.trim();
  const base = xdg || join(homedir(), ".local", "state");
  return join(base, "standard-reader-mcp", "session.json");
}

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next || undefined;
}

/** Resolve server configuration from the environment. */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): McpServerConfig {
  return {
    service: (
      trimmed(env.STANDARD_READER_SERVICE) ?? STANDARD_READER_SERVICE
    ).replace(/\/+$/, ""),
    pdsService: (
      trimmed(env.STANDARD_READER_PDS) ?? DEFAULT_PDS_SERVICE
    ).replace(/\/+$/, ""),
    sessionFile:
      trimmed(env.STANDARD_READER_SESSION_FILE) ?? defaultSessionFile(),
    identifier: trimmed(env.STANDARD_READER_IDENTIFIER),
    password: trimmed(env.STANDARD_READER_APP_PASSWORD),
  };
}
