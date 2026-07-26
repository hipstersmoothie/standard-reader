import type { XrpcAuthContext } from "#/server/xrpc/auth";

import { AuthRequiredError } from "./errors";
import type { XrpcParams } from "./xrpc";
import { invokeXrpc, readerAuthContext } from "./xrpc";

/** Scopes an MCP access token can carry. */
export const MCP_SCOPES = {
  read: "mcp:read",
  write: "mcp:write",
} as const;

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];

export const MCP_SUPPORTED_SCOPES: Array<McpScope> = [
  MCP_SCOPES.read,
  MCP_SCOPES.write,
];

export interface McpSessionInit {
  /** DID of the reader the presented token belongs to; `null` when anonymous. */
  did: string | null;
  /** Handle, for `whoami`-style reporting. Best-effort. */
  handle?: string | null;
  /** Scopes the presented token was granted. */
  scopes: Array<string>;
  /** OAuth client that presented the token, for reporting. */
  clientName?: string | null;
}

/**
 * One MCP request's view of who is calling.
 *
 * Every tool goes through here rather than touching auth directly, so the two
 * authorization questions stay in one place: does this *token* allow the action
 * (`mcp:read` / `mcp:write`), and does the reader still have a usable AT
 * Protocol session for us to act with.
 */
export class McpSession {
  readonly did: string | null;
  readonly handle: string | null;
  readonly scopes: Array<string>;
  readonly clientName: string | null;
  #auth: Promise<XrpcAuthContext | null> | null = null;

  constructor(init: McpSessionInit) {
    this.did = init.did;
    this.handle = init.handle ?? null;
    this.scopes = init.scopes;
    this.clientName = init.clientName ?? null;
  }

  get signedIn(): boolean {
    return this.did !== null;
  }

  get canWrite(): boolean {
    return this.signedIn && this.scopes.includes(MCP_SCOPES.write);
  }

  /**
   * The reader's XRPC auth context, or `null` for an anonymous session.
   * Memoized: a single tool call can fan out to several XRPC methods and they
   * should share one restored client.
   */
  auth(): Promise<XrpcAuthContext | null> {
    if (this.did === null) return Promise.resolve(null);
    this.#auth ??= readerAuthContext(this.did);
    return this.#auth;
  }

  /** Auth context for an action that requires a signed-in reader. */
  async requireAuth(): Promise<XrpcAuthContext> {
    if (!this.signedIn) {
      throw new AuthRequiredError(
        "This needs a signed-in reader. Reconnect the Standard Reader " +
          "connector and authorize it.",
      );
    }
    const auth = await this.auth();
    if (!auth) {
      throw new AuthRequiredError(
        "Standard Reader no longer has a usable AT Protocol session for this " +
          "reader — sign in again at https://standard-reader.app and " +
          "reconnect.",
      );
    }
    return auth;
  }

  /** Auth context for a write, which additionally needs the `mcp:write` scope. */
  async requireWrite(): Promise<XrpcAuthContext> {
    if (this.signedIn && !this.scopes.includes(MCP_SCOPES.write)) {
      throw new AuthRequiredError(
        "This connection was authorized for reading only (no `mcp:write` " +
          "scope). Reconnect and grant write access to change anything.",
      );
    }
    return this.requireAuth();
  }

  /** Run a query, passing the reader's session when there is one. */
  async query(nsid: string, params: XrpcParams = {}): Promise<unknown> {
    return invokeXrpc(nsid, { params }, await this.auth());
  }

  /** Run a query that only makes sense for a signed-in reader. */
  async authedQuery(nsid: string, params: XrpcParams = {}): Promise<unknown> {
    return invokeXrpc(nsid, { params }, await this.requireAuth());
  }

  /** Run a write procedure. */
  async write(
    nsid: string,
    body: Record<string, unknown> = {},
  ): Promise<unknown> {
    return invokeXrpc(nsid, { body }, await this.requireWrite());
  }
}
