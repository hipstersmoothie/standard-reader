/**
 * `@standard-reader/api-client` — the Standard Reader XRPC API as typed AT
 * Protocol lexicon schemas.
 *
 * This package exposes the schema objects generated from the lexicons in
 * `lexicons/app/standard-reader` (plus the referenced `com.atproto.label` and
 * `at.markpub` definitions), grouped by NSID authority: `app`, `at`, `com`.
 *
 * It intentionally does **not** ship a client. Pair these schemas with
 * [`@atproto/lex-client`](https://www.npmjs.com/package/@atproto/lex-client)
 * (or any XRPC client) — its `Client.call`/`create`/`put`/`delete` methods are
 * fully typed against them.
 *
 * @example
 * ```ts
 * import { Client } from "@atproto/lex-client";
 * import { app } from "@standard-reader/api-client";
 *
 * const client = new Client(STANDARD_READER_SERVICE);
 * const { publications } = await client.call(
 *   app["standard-reader"].getTrendingPublications,
 *   { limit: 12 },
 * );
 * ```
 *
 * @packageDocumentation
 */

export * from "./lexicons/index.js";

/**
 * Public base URL of the Standard Reader AppView (its XRPC service lives under
 * `/xrpc`). Pass it to your XRPC client; override to target a preview
 * deployment or a self-hosted instance.
 */
export const STANDARD_READER_SERVICE = "https://standard-reader.app";
