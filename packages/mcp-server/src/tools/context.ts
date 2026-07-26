import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { StandardReaderClient } from "../client.js";
import type { McpServerConfig } from "../config.js";
import type { SessionManager } from "../session.js";

export interface ToolContext {
  config: McpServerConfig;
  sessions: SessionManager;
  reader: StandardReaderClient;
}

export type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;

/**
 * Shared prose appended to every tool that reads or writes a reader's own
 * state, so a model knows the failure is recoverable and how.
 */
export const AUTH_NOTE =
  'Needs a signed-in reader — run `auth` with action "login" first.';

/**
 * Standard Reader identifies articles and publications by AT-URI. Repeat the
 * convention on every tool that takes one so the model reaches for `resolve`
 * or `search` instead of inventing a URI.
 */
export const AT_URI_NOTE =
  "AT-URIs look like at://did:plc:.../site.standard.document/rkey. Get one from " +
  "`search`, `resolve`, or any feed result rather than constructing it.";
