import type { Did } from "@atcute/lexicons";

import { Client } from "@atcute/client";
import {
  isAppPasswordAuthEnabled,
  restoreAppPasswordClient,
} from "#/integrations/auth/app-password-session.server";
import { restoreAtprotoSession } from "#/integrations/auth/atproto";

/**
 * Restore an authenticated AT Proto client for the given DID.
 *
 * In dev/perf (app-password mode), the OAuth session restore always fails for
 * these users — trying it first wastes a network round trip to the PDS before
 * the fallback runs. When app-password auth is enabled, try it first and skip
 * the OAuth attempt entirely on success.
 */
export async function restoreAuthenticatedClient(
  did: Did,
): Promise<Client | null> {
  if (isAppPasswordAuthEnabled()) {
    const appPasswordClient = await restoreAppPasswordClient(did);
    if (appPasswordClient) {
      return new Client({ handler: appPasswordClient });
    }
    // App-password session missing/expired — fall through to OAuth.
  }

  const oauthSession = await restoreAtprotoSession(did);
  if (oauthSession) {
    return new Client({ handler: oauthSession });
  }

  // Last resort: app-password when not already tried above.
  if (!isAppPasswordAuthEnabled()) {
    const appPasswordClient = await restoreAppPasswordClient(did);
    if (!appPasswordClient) {
      return null;
    }
    return new Client({ handler: appPasswordClient });
  }

  return null;
}
