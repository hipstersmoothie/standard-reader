import type { InferStringFormat, StringFormat } from "@atproto/lex-schema";
import { isStringFormat } from "@atproto/lex-schema";

import { InvalidInputError } from "./errors.js";

const EXPECTED: Partial<Record<StringFormat, string>> = {
  "at-identifier": "handle or DID",
  "at-uri": "AT-URI (at://did:…/collection/rkey)",
  did: "DID (did:plc:… or did:web:…)",
  handle: "handle (e.g. alice.bsky.social)",
  "record-key": "record key",
  uri: "absolute URL",
};

/**
 * Validate a tool argument against an AT Protocol string format and narrow it to
 * the branded type the lexicons expect.
 *
 * Tool arguments arrive as plain strings, and a model will occasionally invent a
 * URI or paste a handle where a DID belongs. Catching it here turns a confusing
 * server-side 400 into a message that says which argument was wrong and what
 * shape it should have had.
 */
export function asFormat<F extends StringFormat>(
  value: string,
  format: F,
  label: string,
): InferStringFormat<F> {
  const trimmed = value.trim();
  if (isStringFormat(trimmed, format)) {
    return trimmed as InferStringFormat<F>;
  }
  throw new InvalidInputError(
    `\`${label}\` must be a valid ${EXPECTED[format] ?? format} — got ` +
      `${JSON.stringify(value)}. Use \`search\` or \`resolve\` to get one.`,
  );
}

/** Narrow a tool argument to an AT-URI. */
export function asAtUri(value: string, label: string) {
  return asFormat(value, "at-uri", label);
}

/** Narrow a tool argument to a DID. */
export function asDid(value: string, label: string) {
  return asFormat(value, "did", label);
}

/** Narrow a tool argument to a handle or a DID. */
export function asActor(value: string, label: string) {
  return asFormat(value.replace(/^@/, ""), "at-identifier", label);
}

/** Narrow an optional tool argument to a DID, passing `undefined` through. */
export function asOptionalDid(value: string | undefined, label: string) {
  return value === undefined ? undefined : asDid(value, label);
}
