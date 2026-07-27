import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { McpSession } from "./session";
import { registerTools } from "./tools/index";

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
  "Public reads work for anyone. A reader's own state — `get_library`,",
  "`get_status`, the personalised feeds — needs an authorized connection, and",
  "`bookmark`, `like`, `mark_read`, `follow` and `manage_list` additionally",
  "need write access. Call `whoami` when a tool reports an auth problem.",
  "",
  "Writes land in the user's own repo and are public on the network. Confirm",
  "before liking, following, or changing lists on their behalf.",
].join("\n");

/**
 * Build an MCP server bound to one caller.
 *
 * Stateless: `/mcp` constructs a server (and transport) per request, because
 * the tools close over the {@link McpSession} that identifies the reader who
 * authorized this connection. Nothing is shared between requests.
 */
export function createMcpServer(session: McpSession): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, { session });
  return server;
}
