/**
 * The browser handoff.
 *
 * Bind a loopback server on an ephemeral port, build the client around the
 * redirect URI that port implies, send the user to their own PDS's consent
 * screen, and wait for the redirect to come back. The port has to be known
 * before the client exists, because it is baked into the `client_id`.
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { OAuthSession } from "@atcute/oauth-node-client";

import { CliError } from "../atproto.js";
import { openBrowser } from "./browser.js";
import { CLI_SCOPE, createOAuthClient } from "./client.js";
import type { SavedSession } from "./store.js";
import { readSavedSession, saveSession } from "./store.js";

/** How long to wait at the consent screen before giving up. */
const LOGIN_TIMEOUT_MS = 5 * 60_000;

function page(title: string, message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title><style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;
min-height:100vh;background:#faf9f7;color:#1a1a1a}
main{max-width:26rem;padding:2rem;text-align:center}
h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#555}
@media(prefers-color-scheme:dark){body{background:#151515;color:#f0f0f0}p{color:#aaa}}
</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

interface CallbackResult {
  params: URLSearchParams;
}

/**
 * Serve exactly one OAuth redirect on 127.0.0.1.
 *
 * Resolves with the callback's query parameters; the caller hands them to the
 * OAuth client, which verifies `state` and `iss` before exchanging the code.
 */
function listenForCallback(): Promise<{
  redirectUri: string;
  waitForCallback: () => Promise<CallbackResult>;
  close: () => void;
}> {
  return new Promise((resolveServer, rejectServer) => {
    let settle: ((result: CallbackResult) => void) | null = null;
    let fail: ((error: Error) => void) | null = null;

    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        response.writeHead(404).end();
        return;
      }

      const params = url.searchParams;
      const error = params.get("error");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        error
          ? page("Sign-in failed", `${error}. You can close this tab.`)
          : page(
              "Signed in",
              "You can close this tab and return to the terminal.",
            ),
      );

      if (error) {
        fail?.(
          new CliError(
            `Authorization was refused: ${params.get("error_description") ?? error}`,
          ),
        );
        return;
      }
      settle?.({ params });
    });

    server.on("error", rejectServer);
    // Port 0 asks the OS for a free port; loopback only, so nothing off-machine
    // can reach it while the flow is open.
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolveServer({
        close: () => server.close(),
        redirectUri: `http://127.0.0.1:${port}/callback`,
        waitForCallback: () =>
          new Promise<CallbackResult>((resolve, reject) => {
            settle = resolve;
            fail = reject;
            const timer = setTimeout(() => {
              reject(
                new CliError(
                  "Timed out waiting for the browser. Run `standard-reader login` again.",
                ),
              );
            }, LOGIN_TIMEOUT_MS);
            timer.unref();
          }),
      });
    });
  });
}

export interface LoginResult {
  did: string;
  handle: string;
  service: string;
  session: OAuthSession;
}

/**
 * Run the full flow and persist the session.
 *
 * `identifier` is the handle or DID to sign in as. It is only a starting point
 * for discovery — the authorization server decides who actually authenticates,
 * and the DID that comes back is the one the session belongs to.
 */
export async function loginWithBrowser(input: {
  identifier?: string;
  onUrl: (url: string, opened: boolean) => void;
}): Promise<LoginResult> {
  const server = await listenForCallback();

  try {
    // The OAuth client writes the token set through the session store as soon
    // as the code is exchanged, which is before we know the handle or PDS. This
    // holder gives the store something to save against in the meantime; the
    // real values are written over it below.
    let describe: Omit<SavedSession, "session"> = {
      did: "did:plc:pending" as SavedSession["did"],
      handle: input.identifier ?? "",
      redirectUri: server.redirectUri,
      scope: CLI_SCOPE,
      service: "",
    };
    const client = createOAuthClient({
      describe: (did) => ({ ...describe, did }),
      redirectUri: server.redirectUri,
    });

    const { url } = await client.authorize(
      input.identifier
        ? { target: { identifier: input.identifier as never, type: "account" } }
        : // Without a handle there is no PDS to discover, so start at the
          // entryway and let the user say who they are there.
          { target: { serviceUrl: "https://bsky.social", type: "pds" } },
    );

    const waiting = server.waitForCallback();
    const opened = await openBrowser(url.href);
    input.onUrl(url.href, opened);

    const { params } = await waiting;
    const { session } = await client.callback(params);

    const info = await session.getTokenInfo();
    describe = {
      did: session.did,
      // The DID is what the session belongs to; the handle is a label that can
      // change under it, so fall back to the DID rather than to nothing.
      handle: input.identifier ?? session.did,
      redirectUri: server.redirectUri,
      scope: info.scope ?? CLI_SCOPE,
      service: info.aud,
    };

    const stored = await readSavedSession(session.did);
    if (!stored) {
      throw new CliError("Signed in, but the session could not be saved.");
    }
    await saveSession({ ...describe, session: stored.session });

    return {
      did: session.did,
      handle: describe.handle,
      service: describe.service,
      session,
    };
  } finally {
    server.close();
  }
}
