/**
 * `@standard-reader/lexicons` — the Standard Reader XRPC API as typed AT
 * Protocol lexicon schemas.
 *
 * The primary export, {@link standardReader}, holds the generated schema
 * objects for every `app.standard-reader.*` query, procedure, and record. Pass
 * them to a standard atproto XRPC client — such as
 * [`@atproto/lex-client`](https://www.npmjs.com/package/@atproto/lex-client) —
 * whose `Client.call`/`create`/`put`/`delete` methods are fully typed against
 * them.
 *
 * This package intentionally does **not** ship a client, keeping transport
 * concerns (auth, DPoP, retries) in the maintained upstream client.
 *
 * @example
 * ```ts
 * import { Client } from "@atproto/lex-client";
 * import { standardReader, STANDARD_READER_SERVICE } from "@standard-reader/lexicons";
 *
 * const client = new Client(STANDARD_READER_SERVICE);
 * const { publications } = await client.call(
 *   standardReader.getTrendingPublications,
 *   { limit: 12 },
 * );
 * const doc = await client.call(standardReader.getDocument, { document });
 * ```
 *
 * @packageDocumentation
 */

import * as lexicons from "./lexicons/index.js";

/**
 * Every `app.standard-reader.*` lexicon schema (queries, procedures, records),
 * keyed by the final NSID segment — e.g. {@link standardReader.getDocument}.
 */
export const standardReader = lexicons.app["standard-reader"];

/**
 * The full generated lexicon tree, grouped by NSID authority (`app`, `at`,
 * `com`). Use this to reach the referenced `com.atproto.label` /
 * `at.markpub` definitions; `standardReader` is the shorthand for
 * `lexicons.app["standard-reader"]`.
 */
export { lexicons };

/**
 * Public base URL of the Standard Reader AppView (its XRPC service lives under
 * `/xrpc`). Pass it to your XRPC client; override to target a preview
 * deployment or a self-hosted instance.
 */
export const STANDARD_READER_SERVICE = "https://standard-reader.app";
