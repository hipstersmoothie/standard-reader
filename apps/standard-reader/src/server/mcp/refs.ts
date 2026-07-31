import type { ActorIdentifier, Did } from "@atcute/lexicons";
import {
  isActorIdentifier,
  isCanonicalResourceUri,
  isDid,
} from "@atcute/lexicons/syntax";

import { InvalidInputError } from "./errors";

/**
 * Tool arguments arrive as free-form strings, and a model will occasionally
 * invent a URI or pass a handle where a DID belongs. Validating here turns a
 * confusing server-side 400 into a message naming the argument, the shape it
 * should have had, and how to get one.
 */
function reject(label: string, expected: string, value: string): never {
  throw new InvalidInputError(
    `\`${label}\` must be a valid ${expected} — got ${JSON.stringify(value)}. ` +
      "Use `search` or `resolve` to get one.",
  );
}

/** Narrow a tool argument to a record AT-URI. */
export function asAtUri(value: string, label: string): string {
  const trimmed = value.trim();
  if (isCanonicalResourceUri(trimmed)) return trimmed;
  return reject(label, "AT-URI (at://did:…/collection/rkey)", value);
}

/** Narrow a tool argument to a DID. */
export function asDid(value: string, label: string): Did {
  const trimmed = value.trim();
  if (isDid(trimmed)) return trimmed;
  return reject(label, "DID (did:plc:… or did:web:…)", value);
}

/** Narrow a tool argument to a handle or a DID. */
export function asActor(value: string, label: string): ActorIdentifier {
  const trimmed = value.replace(/^@/, "").trim();
  if (isActorIdentifier(trimmed)) return trimmed;
  return reject(label, "handle or DID", value);
}

/** Narrow an optional tool argument to a DID, passing `undefined` through. */
export function asOptionalDid(
  value: string | undefined,
  label: string,
): Did | undefined {
  return value === undefined ? undefined : asDid(value, label);
}

/** Narrow a tool argument to an absolute http(s) URL. */
export function asUrl(value: string, label: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return trimmed;
  } catch {
    // Fall through to the shared rejection message.
  }
  return reject(label, "absolute http(s) URL", value);
}
