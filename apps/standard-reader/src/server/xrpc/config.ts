import { getPublicUrl } from "#/lib/public-url";

/** Fragment id on did:web:standard-reader.app for the AppView XRPC service. */
export const APPVIEW_SERVICE_ID = "standard_reader_appview";

/**
 * The AppView's `did:web` identifier.
 *
 * Per the did:web method spec the host is embedded **with its dots intact** —
 * `standard-reader.app` → `did:web:standard-reader.app`, resolved from
 * `https://standard-reader.app/.well-known/did.json`. Colons are reserved for
 * encoding *path* segments (`did:web:example.com:user:alice` →
 * `https://example.com/user/alice/did.json`), so percent-encoding the dots as
 * colons produced a DID that resolves to the host `standard-reader` with a path
 * segment `app` — a name that does not exist.
 *
 * That broke every PDS-proxied call: a spec-compliant resolver either failed to
 * fetch the bogus location, or (given the corrected dot-form) fetched the real
 * document and rejected it because its `id` did not match the DID asked for.
 * Reported at https://userinput.app/d/did:plc:7qubw2z53qzfturlblaozz4a/3msqg3okp3kc7.
 */
export function appviewDid(): string {
  const host = new URL(getPublicUrl()).hostname;
  return `did:web:${host}`;
}

/**
 * The `did#fragment` service reference — what callers put in `atproto-proxy`
 * and what an OAuth `rpc:` scope names as its audience.
 *
 * This is **not** the audience of a PDS-minted service JWT: `pipethrough` keeps
 * the bare DID there. Use {@link appviewDid} for that check.
 */
export function appviewAudience(): string {
  return `${appviewDid()}#${APPVIEW_SERVICE_ID}`;
}

export function xrpcBaseUrl(): string {
  return `${getPublicUrl()}/xrpc`;
}

/**
 * The `serviceEndpoint` we publish in the DID document — the bare origin,
 * **never** a URL with a path.
 *
 * A proxying PDS uses this value verbatim as the undici dispatch origin and
 * appends `/xrpc/<nsid>` itself; undici's `Pool` rejects any origin whose
 * pathname isn't `/` with `invalid url`, which the PDS surfaces as
 * `502 UpstreamFailure "Upstream service unreachable"` on **every** proxied
 * call. Publishing `…/xrpc` here is what kept `atproto-proxy` broken after the
 * DID spelling fix. Compare Bluesky's own appview document: `https://api.bsky.app`.
 */
export function appviewServiceEndpoint(): string {
  return getPublicUrl();
}
