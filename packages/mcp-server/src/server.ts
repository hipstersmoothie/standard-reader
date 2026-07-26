import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { StandardReaderClient } from "./client.js";
import type { McpServerConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { SessionManager } from "./session.js";
import { registerTools } from "./tools/index.js";

export const SERVER_NAME = "standard-reader";
export const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS = [
  "Standard Reader is a reader for long-form writing published on the AT",
  "Protocol (the network Bluesky runs on). Articles live in `standard.site`",
  "publications; every reader's bookmarks, likes, follows, read state and",
  "lists are records in their own AT Protocol repo.",
  "",
  "Everything is addressed by AT-URI. When the user names something in prose",
  "or pastes a link, go through `search` or `resolve` first to get the URI,",
  "then pass that URI to the other tools.",
  "",
  "Public reads work signed out. Anything touching a reader's own state —",
  "`get_library`, `get_status`, `bookmark`, `like`, `mark_read`, `follow`,",
  "`manage_list`, and the personalised feeds — needs a signed-in reader; call",
  "`auth` to check.",
  "",
  "Writes land in the user's own repo and are public on the network. Confirm",
  "before liking, following, or changing lists on their behalf.",
].join("\n");

export interface CreateServerOptions {
  config?: McpServerConfig;
}

/**
 * Build the Standard Reader MCP server. Transport-agnostic — connect it to
 * stdio (see `bin.ts`) or any other MCP transport.
 */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const sessions = new SessionManager(config);
  const reader = new StandardReaderClient(config, sessions);

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerTools(server, { config, sessions, reader });
  return server;
}
