/**
 * What to show under a labeler's name.
 *
 * A raw `did:plc:…` is unreadable and wraps badly in a card, so prefer the
 * handle. Where it comes from depends on the DID method:
 *
 * - **did:plc** — declared in the DID document's `alsoKnownAs`, resolved and
 *   stored on `labeler_services.handle`.
 * - **did:web** — the DID *is* the host (`did:web:example.com` maps to
 *   `example.com` per the did:web spec), and such documents typically carry no
 *   `alsoKnownAs` at all. Deriving it is exact, not a guess.
 */

/** Prefix of a did:web identifier. */
const DID_WEB_PREFIX = "did:web:";

/**
 * The host a `did:web` identifier maps to, or `null` for anything else.
 *
 * Only bare-host DIDs are treated as handle-like. did:web also allows path
 * segments (`did:web:example.com:user:alice` → `example.com/user/alice`), which
 * is a location rather than a handle, so those return `null` instead of a
 * misleading bare domain.
 */
export function didWebHost(did: string): string | null {
  if (!did.startsWith(DID_WEB_PREFIX)) return null;
  const rest = did.slice(DID_WEB_PREFIX.length);
  if (rest.length === 0 || rest.includes(":")) return null;
  return decodeURIComponent(rest).toLowerCase();
}

/**
 * The handle to display for a labeler, without a leading `@`, or `null` when we
 * genuinely have nothing better than the DID.
 */
export function labelerHandle(
  did: string,
  handle?: string | null,
): string | null {
  const trimmed = handle?.trim().toLowerCase();
  // `handle.invalid` is atproto's marker for a handle that failed bidirectional
  // verification — showing it would be worse than showing the DID.
  if (trimmed && trimmed.length > 0 && trimmed !== "handle.invalid") {
    return trimmed;
  }
  return didWebHost(did);
}

/**
 * The labeler's secondary identity line: `@handle` when we have one, otherwise
 * the DID itself so the card never loses the identifier entirely.
 */
export function labelerHandleOrDid(
  did: string,
  handle?: string | null,
): string {
  const resolved = labelerHandle(did, handle);
  return resolved ? `@${resolved}` : did;
}
