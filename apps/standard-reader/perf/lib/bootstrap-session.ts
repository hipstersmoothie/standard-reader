import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { bootstrapAppPasswordSession } from "../../src/integrations/auth/app-password-session.server.ts";
import {
  hasPerfAppPasswordCredentials,
  perfSessionToken,
  perfTestAppPassword,
  perfTestIdentifier,
} from "./config.ts";

const AUTH_STATE_PATH = path.join(process.cwd(), "perf", ".auth-state.json");

export interface PerfAuthState {
  sessionToken?: string;
  did?: string;
  source: "app-password" | "env-token";
}

export function readPerfAuthState(): PerfAuthState | null {
  try {
    if (!existsSync(AUTH_STATE_PATH)) return null;
    return JSON.parse(readFileSync(AUTH_STATE_PATH, "utf8")) as PerfAuthState;
  } catch {
    return null;
  }
}

function writePerfAuthState(state: PerfAuthState): void {
  mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
  writeFileSync(AUTH_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/** Called from Playwright globalSetup — logs in once per test run. */
export async function bootstrapPerfAuth(): Promise<PerfAuthState | null> {
  const envToken = perfSessionToken();
  if (envToken) {
    const state: PerfAuthState = {
      sessionToken: envToken,
      source: "env-token",
    };
    writePerfAuthState(state);
    return state;
  }

  if (!hasPerfAppPasswordCredentials()) {
    writePerfAuthState({ source: "app-password" });
    return null;
  }

  const identifier = perfTestIdentifier();
  const password = perfTestAppPassword();
  if (!identifier || !password) {
    return null;
  }

  const { sessionToken, did } = await bootstrapAppPasswordSession(
    identifier,
    password,
  );

  const state: PerfAuthState = {
    sessionToken,
    did,
    source: "app-password",
  };
  writePerfAuthState(state);
  return state;
}
