import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerAuthTools } from "./auth";
import type { ToolContext } from "./context";
import { registerDiscoveryTools } from "./discovery";
import { registerFeedTools } from "./feeds";
import { registerLibraryTools } from "./library";
import { registerWriteTools } from "./writes";

export type { ToolContext } from "./context";

/**
 * Register every tool on a server.
 *
 * The XRPC API has ~50 methods; they collapse into 15 tools here because a
 * model picks better from a short list of intents than from a long list of
 * endpoints. Each tool covers one intent and routes to the right method(s) from
 * its arguments — `search` fans out across both search indexes, `get_feed`
 * covers all nine feeds, `get_status` batches five status queries.
 *
 * Deliberately not exposed: the labeler endpoints (moderation configuration,
 * not reading), and `getPublicationSubscribers` / `getDocumentContext` as
 * standalone tools — they ride along on `get_publication` / `get_article`.
 */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  registerAuthTools(server, ctx);
  registerDiscoveryTools(server, ctx);
  registerFeedTools(server, ctx);
  registerLibraryTools(server, ctx);
  registerWriteTools(server, ctx);
}
