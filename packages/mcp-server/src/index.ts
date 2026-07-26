/**
 * `@standard-reader/mcp` — a Model Context Protocol server over the
 * [Standard Reader](https://standard-reader.app) XRPC API.
 *
 * The default entry point is the `standard-reader-mcp` binary, which speaks MCP
 * over stdio. This module exports the same server for embedding in another
 * host — connect it to whichever transport you already have.
 *
 * @example
 * ```ts
 * import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
 * import { createServer } from "@standard-reader/mcp";
 *
 * const server = createServer();
 * await server.connect(new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }));
 * ```
 *
 * @packageDocumentation
 */

export { StandardReaderClient } from "./client.js";
export {
  DEFAULT_PDS_SERVICE,
  loadConfig,
  type McpServerConfig,
} from "./config.js";
export { AuthRequiredError, InvalidInputError } from "./errors.js";
export {
  createServer,
  type CreateServerOptions,
  SERVER_NAME,
  SERVER_VERSION,
} from "./server.js";
export { SessionManager } from "./session.js";
