import type { PasswordSession } from "@atcute/password-session";
import { Client } from "@atproto/lex-client";

import type { McpServerConfig } from "./config.js";
import type { SessionManager } from "./session.js";

/**
 * A thin XRPC client for the Standard Reader AppView.
 *
 * Every call goes through `@atproto/lex-client` against the generated
 * `@standard-reader/lexicons` schemas, so params, input bodies and output
 * shapes are typed from the same lexicons the AppView is built from. The only
 * thing this class adds is transport: the AppView origin, the `Authorization`
 * header, and a refresh-and-retry on `401`.
 *
 * Response validation is deliberately off. A schema drift between a deployed
 * AppView and the pinned lexicons should degrade a field, not take the whole
 * tool down — and every tool reshapes the response before returning it anyway.
 */
export class StandardReaderClient {
  readonly #config: McpServerConfig;
  readonly #sessions: SessionManager;
  readonly client: Client;

  constructor(config: McpServerConfig, sessions: SessionManager) {
    this.#config = config;
    this.#sessions = sessions;
    this.client = new Client(
      { fetchHandler: (path, init) => this.#fetch(path, init) },
      { validateResponse: false },
    );
  }

  /** DID of the signed-in reader, or `undefined` when anonymous. */
  async did(): Promise<string | undefined> {
    const session = await this.#sessions.current();
    return session?.did;
  }

  /**
   * Resolve the session without letting a sign-in failure break public reads —
   * most of the API is readable anonymously, so an unusable credential should
   * only cost the authenticated endpoints.
   */
  async #session(): Promise<PasswordSession | null> {
    try {
      return await this.#sessions.current();
    } catch {
      return null;
    }
  }

  async #fetch(path: `/${string}`, init: RequestInit): Promise<Response> {
    const url = new URL(path, this.#config.service);
    const session = await this.#session();

    const send = (token: string | undefined) => {
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(url, { ...init, headers });
    };

    const response = await send(session?.session.accessJwt);
    if (response.status !== 401 || !session || session.destroyed) {
      return response;
    }

    // The AppView validates the token against the issuer PDS, so an expired
    // access token surfaces here as a 401 rather than being refreshed by the
    // session's own fetch path. Refresh once and replay.
    try {
      await session.refresh();
    } catch {
      return response;
    }
    return send(session.session.accessJwt);
  }
}
