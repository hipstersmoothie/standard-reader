/**
 * `@standard-reader/api-client` — a typed client for the Standard Reader XRPC
 * API.
 *
 * The `lexicons` namespace holds the schema objects generated from the AT
 * Protocol lexicons in `lexicons/app/standard-reader` (plus the referenced
 * `com.atproto.label` and `at.markpub` definitions). Pass them to a client's
 * `call`/`create`/`put`/`delete` methods for end-to-end type safety.
 *
 * @example
 * ```ts
 * import { createClient, lexicons } from "@standard-reader/api-client";
 *
 * const client = createClient();
 * const { publications } = await client.call(
 *   lexicons.app["standard-reader"].getTrendingPublications,
 *   { limit: 12 },
 * );
 * ```
 *
 * @packageDocumentation
 */

export { createClient, STANDARD_READER_SERVICE } from "./client.js";
export type { StandardReaderClient } from "./client.js";

/** Generated lexicon schemas, grouped by NSID authority (`app`, `at`, `com`). */
export * as lexicons from "./lexicons/index.js";

// Re-export the underlying client primitives so consumers can build advanced
// setups (custom agents, raw `xrpc` calls, error handling) without a second
// dependency on `@atproto/lex-client`.
export { Client, xrpc, xrpcSafe } from "@atproto/lex-client";
export type {
  Agent,
  AgentOptions,
  ClientOptions,
  FetchHandler,
} from "@atproto/lex-client";
