/**
 * Reading a DID out of a path parameter, whatever a client did to it on the way.
 *
 * The router decodes a path segment once, so `did%3Aplc%3Aabc` arrives as
 * `did:plc:abc` and a plain `did:plc:abc` arrives unchanged. Neither needs help.
 *
 * What needs help is a client that re-encodes a URL it was handed. Panels, for
 * one, stores an OPDS catalog as a host plus a path and rebuilds the URL itself
 * — and a `%3A` that goes through that round trip comes back as `%253A`. After
 * the router's single decode that is `did%3Aplc%3Aabc`, which is not a DID, and
 * the route answers 400 for a URL the reader copied correctly.
 *
 * The URLs we hand out no longer contain `%3A` at all (see `urls.ts`), which
 * removes the cause. This is the belt to that pair of braces: it costs one
 * string check and covers every catalog URL already saved on someone's device.
 */

/** The DID a path parameter denotes, or `null` if it is not one. */
export function didFromParam(raw: string): string | null {
  let value = raw;
  // At most one extra decode: two rounds covers a client that re-encoded once,
  // and refusing to loop keeps a crafted parameter from being decoded onto
  // something it should not reach.
  if (!value.startsWith("did:") && value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return value.startsWith("did:") ? value : null;
}
