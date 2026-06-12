import type { BrowserContext } from "@playwright/test";

import { readPerfAuthState } from "./bootstrap-session.ts";
import {
  SESSION_COOKIE_NAME,
  hasPerfAppPasswordCredentials,
  perfBaseUrl,
  perfSessionToken,
} from "./config.ts";

export function hasPerfSignedInCredentials(): boolean {
  if (perfSessionToken()) return true;
  if (hasPerfAppPasswordCredentials()) return true;
  const state = readPerfAuthState();
  return Boolean(state?.sessionToken);
}

function resolveSessionToken(): string | undefined {
  return perfSessionToken() ?? readPerfAuthState()?.sessionToken ?? undefined;
}

export async function applyPerfSessionCookie(
  context: BrowserContext,
): Promise<void> {
  const token = resolveSessionToken();
  if (!token) {
    throw new Error(
      "Signed-in perf tests need PERF_TEST_IDENTIFIER + PERF_TEST_APP_PASSWORD (or PERF_TEST_SESSION_TOKEN).",
    );
  }

  const base = new URL(perfBaseUrl());

  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      domain: base.hostname,
      path: "/",
      httpOnly: true,
      secure: base.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}
