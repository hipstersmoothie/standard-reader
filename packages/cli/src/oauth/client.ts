/**
 * The OAuth client, as a loopback public client.
 *
 * A CLI cannot hold a secret and cannot register a URL scheme, so it
 * authenticates by DPoP proof alone (`token_endpoint_auth_method: none`) and
 * catches the redirect on 127.0.0.1. AT Protocol defines loopback redirects
 * only for the `http://localhost` client — a hosted `client_id` would need a
 * custom scheme or a universal link, neither of which a `npx`-installed binary
 * can claim. `buildPublicClientMetadata` synthesizes that client_id from the
 * redirect URI and scope; the authorization server generates the matching
 * metadata itself, so there is nothing to host.
 *
 * Two consequences worth knowing:
 *
 *   · The `client_id` embeds the redirect URI, port and all, and must be
 *     byte-identical across PAR, token exchange and every later refresh. That
 *     is why the redirect URI is persisted with the session (see `store.ts`).
 *   · Public clients get a shorter refresh window than confidential ones —
 *     roughly two weeks — so `standard-reader login` is something a user will
 *     re-run occasionally rather than once.
 */

import {
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  WellKnownHandleResolver,
} from "@atcute/identity-resolver";
import { NodeDnsHandleResolver } from "@atcute/identity-resolver-node";
import type { Did } from "@atcute/lexicons";
import { OAuthClient, scope } from "@atcute/oauth-node-client";

import type { SavedSession } from "./store.js";
import { fileSessionStore, memoryStateStore } from "./store.js";

/**
 * What the CLI asks for, and nothing more.
 *
 * It rewrites the body of documents it already found, so `update` on
 * `site.standard.document` covers every write it makes. Listing records is a
 * public read and needs no scope of its own. A user reading the consent screen
 * should be able to tell that this tool cannot post, follow, delete, or touch
 * any other collection — because it cannot.
 */
export const CLI_SCOPE = [
  "atproto",
  scope.repo({ action: ["update"], collection: ["site.standard.document"] }),
].join(" ");

/** Resolves handles and DIDs the same way the app does. */
function actorResolver() {
  return new LocalActorResolver({
    didDocumentResolver: new CompositeDidDocumentResolver({
      methods: {
        plc: new PlcDidDocumentResolver(),
        web: new WebDidDocumentResolver(),
      },
    }),
    handleResolver: new CompositeHandleResolver({
      methods: {
        dns: new NodeDnsHandleResolver(),
        http: new WellKnownHandleResolver(),
      },
    }),
  });
}

export interface ClientForRedirect {
  client: OAuthClient;
  redirectUri: string;
}

/**
 * Build a client bound to one redirect URI.
 *
 * `describe` supplies the account metadata the session store needs when the
 * OAuth client writes a refreshed token back — at login the account is not
 * saved yet, so the caller passes what it knows.
 */
export function createOAuthClient(input: {
  redirectUri: string;
  scope?: string;
  describe?: (did: Did) => Omit<SavedSession, "session"> | null;
}): OAuthClient {
  const describe = input.describe ?? (() => null);
  return new OAuthClient({
    actorResolver: actorResolver(),
    // No `client_id`: that makes it a loopback client, and the library derives
    // `http://localhost?scope=…&redirect_uri=…` from these two fields.
    metadata: {
      redirect_uris: [input.redirectUri],
      scope: input.scope ?? CLI_SCOPE,
    },
    stores: {
      sessions: fileSessionStore({ describe }),
      states: memoryStateStore(),
    },
  });
}

/**
 * Rebuild the client for a session that was saved earlier.
 *
 * Uses the session's own redirect URI so the `client_id` matches the one the
 * grant was issued to; a different port here means a refused refresh.
 */
export function clientForSavedSession(saved: SavedSession): OAuthClient {
  return createOAuthClient({
    describe: () => ({
      did: saved.did,
      handle: saved.handle,
      redirectUri: saved.redirectUri,
      scope: saved.scope,
      service: saved.service,
    }),
    redirectUri: saved.redirectUri,
    scope: saved.scope,
  });
}
