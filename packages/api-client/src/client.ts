import { Client } from "@atproto/lex-client";
import type { AgentOptions, ClientOptions } from "@atproto/lex-client";

/**
 * Public base URL of the Standard Reader AppView (its XRPC service lives under
 * `/xrpc`). Override via {@link createClient} to target a preview deployment or
 * a self-hosted instance.
 */
export const STANDARD_READER_SERVICE = "https://standard-reader.app";

/**
 * The Standard Reader API client type. It is `@atproto/lex-client`'s
 * {@link Client}, whose `call`/`create`/`put`/`delete` methods are fully typed
 * against the generated lexicon schemas exported from `./lexicons`.
 */
export type StandardReaderClient = Client;

/**
 * Create a typed client for the Standard Reader XRPC API.
 *
 * Read (`query`) endpoints are public; write (`procedure`) endpoints require an
 * authenticated AT Protocol session. To attach an `Authorization` header (and
 * DPoP, retries, etc.) supply a `fetch` override alongside the `service`, or
 * pass your own fetch handler.
 *
 * @example Anonymous read against the public instance
 * ```ts
 * import { createClient, lexicons } from "@standard-reader/api-client";
 *
 * const client = createClient();
 * const doc = await client.call(lexicons.app["standard-reader"].getDocument, {
 *   document: "at://did:plc:…/app.standard-reader.document/…",
 * });
 * ```
 *
 * @example Authenticated write via a `fetch` override
 * ```ts
 * const client = createClient({
 *   service: "https://standard-reader.app",
 *   fetch: (input, init) =>
 *     fetch(input, {
 *       ...init,
 *       headers: { ...init?.headers, authorization: `Bearer ${accessJwt}` },
 *     }),
 * });
 * await client.call(lexicons.app["standard-reader"].markRead, {
 *   document: "at://…",
 * });
 * ```
 *
 * @param agent - A service URL (string/`URL`), a full agent config
 *   (`{ service, fetch?, headers?, did? }`), or a bare fetch handler. Defaults
 *   to the public Standard Reader instance.
 * @param options - Optional {@link ClientOptions} (e.g. labelers, validation).
 */
export function createClient(
  agent: AgentOptions = STANDARD_READER_SERVICE,
  options?: ClientOptions,
): StandardReaderClient {
  return new Client(agent, options);
}
