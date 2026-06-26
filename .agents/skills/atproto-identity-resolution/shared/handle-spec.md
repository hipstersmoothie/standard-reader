# AT Protocol Handle Specification (Reference)

Source of truth: https://atproto.com/specs/handle

This document restates the spec's normative rules in one place, and notes the two places where implementations legitimately differ (reserved-TLD coverage, conflict resolution).

## 1. What a handle is

A handle is an AT Protocol account's **human-friendly name** in the form of a domain name. Examples:

- `alice.bsky.social`
- `at.example.com`
- `bob.co.uk`

A handle is **not** an account's permanent identifier. The permanent identifier is the DID. Handles are mutable (they change when a user switches hosting providers or custom domains) and are *bound* to a DID via the two-way resolution described in §6.

Every active account has at most one handle. An account whose handle is unresolvable or broken is represented by the sentinel string `handle.invalid`.

## 2. Syntax rules

A handle is a valid hostname *plus* the AT Protocol restrictions below.

### 2.1 Structural rules

- ASCII only. No Unicode. IDNs must be pre-converted to punycode (`xn--…`) before being treated as a handle.
- Lowercase canonical form. Comparison is case-insensitive, but wire/storage form is lowercase.
- Composed of **two or more** dot-separated labels.
- Total length ≤ 253 characters. Practical cap is **244 characters** so that the DNS prefix `_atproto.<handle>` used for TXT resolution also fits under 253.
- Each label is 1–63 characters.
- Label characters are `[a-z0-9-]`. Labels cannot start or end with `-`.
- The final label (TLD) cannot be all-digits and cannot begin with a digit. This ensures handles are distinguishable from IP-address-like strings and reserves the numeric-TLD space.

### 2.2 Reserved TLDs

Even when a handle is syntactically valid, certain TLDs must not resolve. The AT Protocol spec reserves:

| TLD           | Why reserved                                                   |
| ------------- | -------------------------------------------------------------- |
| `.alt`        | Alternative DNS root. Not guaranteed to be globally unique.    |
| `.arpa`       | Reverse DNS and infrastructure. Never a user identifier.       |
| `.example`    | Reserved in documentation per RFC 2606.                        |
| `.internal`   | Private networks (draft RFC).                                  |
| `.invalid`    | RFC 2606; deliberately unresolvable.                           |
| `.local`      | mDNS / zero-config networking.                                 |
| `.localhost`  | Loopback.                                                      |
| `.onion`      | Tor network — out of scope for DNS-based resolution.           |
| `.test`       | RFC 2606 testing; *tolerated in development*, never in prod.   |

The reference Rust implementation (`atproto-identity::validation`) only ships the subset `{ .localhost, .internal, .arpa, .local }`. If you need full spec compliance, extend the list to the nine entries above.

### 2.3 Disallowed patterns

- `127.0.0.1`, `192.168.1.1`, or any IPv4 literal.
- `[::1]`, `2001:db8::1`, or any IPv6 literal.
- Leading or trailing dot.
- Consecutive dots (`alice..bsky.social`).
- Underscores (`_` is not valid in AT Protocol handles, even though DNS permits it in some record types).

### 2.4 User-interface conventions

- UIs commonly display handles with a leading `@` (`@alice.bsky.social`). The `@` is **never** stored or transmitted.
- Some UIs accept an `at://` prefix (`at://alice.bsky.social`) as a user-friendly form. Strip it before validation.

## 3. Input normalization

Before any syntactic check, normalize the input:

1. Trim whitespace.
2. Strip a leading `at://` if present.
3. Strip a leading `@` if present.
4. Lowercase ASCII (handles are case-insensitive).

Only after these four steps does the result get validated as a handle (or a DID).

## 4. Resolution transports

A handle resolves to a DID via **one of two** mechanisms. Both must return the same DID.

### 4.1 DNS TXT record

- Query name: `_atproto.<handle>` (literal underscore, then `atproto`, then a dot, then the handle).
- Query type: `TXT`.
- At least one TXT record must begin with `did=` followed by the DID string.
- Multiple TXT records are permitted at that name, but **only one** can carry a `did=` value. If two or more distinct `did=` values are found, the handle resolution fails with a "multiple DIDs" error (`ResolveError::MultipleDIDsFound` in the reference impl).
- Chunking: each TXT "record" may be chunked by the DNS server into character-strings; most resolver libraries reassemble them automatically. If you see a truncated DID, the resolver library is to blame, not the publisher.
- TXT records at the apex (`<handle>` without `_atproto.`) must be ignored — the underscore prefix is a hard requirement.

Example zone file entries:

```
_atproto.alice.example.com.   3600 IN TXT "did=did:plc:abcdefghijklmnopqrstuvwx"
```

### 4.2 HTTPS well-known

- Request: `GET https://<handle>/.well-known/atproto-did`.
- TLS required. A plain `http://` fetch is never a valid resolution source.
- Expected status: `200`.
- Expected `Content-Type`: `text/plain`. A permissive client may tolerate wrong content types, but a strict resolver rejects them — this is how you avoid accepting a 200 HTML page from a wildcard host. *The reference Rust impl does not check `Content-Type` at all (see `resolve.rs::resolve_handle_http`); it relies solely on the `body.starts_with("did:")` check. An HTML body will still be rejected because it does not start with `did:`, but strict implementations should add the explicit content-type check.*
- Body: a single line whose text starts with `did:` and ends with the DID. Surrounding whitespace may be trimmed.
- Body length must be reasonable (≤ a few hundred bytes). Reject oversized responses.
- Redirects: follow normal HTTPS redirects, but still require the final response to match the rules above. Cross-origin redirects are fine — what matters is the final content.
- Reference impl timeout: 10 s.

### 4.3 Running them in parallel

Both transports should run **concurrently**, not sequentially. Example: `tokio::join!(dns_fut, http_fut)` in Rust, `asyncio.gather(...)` in Python, `Promise.all([...])` in JS. Sequencing doubles the worst-case latency and gives no correctness advantage.

## 5. Reconciling DNS and HTTPS results

Spec language: implementations "must verify both results are consistent" where both are available; an implementation "may prefer" DNS when only the DNS record is present, or vice versa. Specifically:

| DNS result | HTTPS result | Conformant outcomes                                                                   |
| ---------- | ------------ | ------------------------------------------------------------------------------------- |
| success    | success, eq  | accept the DID                                                                        |
| success    | success, ≠   | two permitted paths: (a) prefer DNS and log the mismatch; (b) fail with a hard error  |
| success    | failure      | accept DNS; surface HTTPS error in diagnostic log                                     |
| failure    | success      | accept HTTPS; surface DNS error in diagnostic log                                     |
| failure    | failure      | handle does not resolve — `NoDIDsFound`                                               |

Pick one strategy for the (success, success, ≠) row and document it. The reference Rust impl picks **strict-agreement** (fail loudly). The spec permits **prefer-DNS**. Both are conformant; mixing them across services in a single ecosystem will cause intermittent handle flapping.

## 6. Bidirectional verification

Handle → DID resolution alone is **not enough**. The returned DID must also claim the handle back:

1. Resolve the DID to its DID document.
2. Inspect `alsoKnownAs`. One entry must be `at://<handle>`.
3. Only then is the `(handle, did)` pair trusted.

Failing the back-check means the DID is advertising a *different* handle — someone has pointed a DNS record at a DID they don't control. Surface `handle.invalid` in this case (or refuse to complete a signup flow).

## 7. `handle.invalid` — the sentinel

If a handle cannot be verified (missing DID, stale DNS, failed bidirectional check, syntax violation at account creation), the account's canonical handle is `handle.invalid`. Implementations:

- Persist `handle.invalid` as the account's handle in storage.
- Serve `handle.invalid` in API responses where a handle is required.
- Re-resolve on a reasonable cadence (minutes/hours) so recovery is automatic once the operator fixes their DNS or well-known file.
- Never use `handle.invalid` as a username input — it cannot be a source of resolution.

Do not emit `handle.invalid` while a transient backend failure is the most likely explanation (PLC directory down, DNS resolver out of quota). Use backoff and only latch the handle after repeated consistent failures.

## 8. Handle transport in records and APIs

- In DAG-CBOR records, handles appear inside `at://` URIs: `at://<handle-or-did>/<collection>/<rkey>`. Implementations should resolve `<handle-or-did>` to the DID at write time and store DID-prefixed URIs in records, so records remain stable across handle changes.
- In REST-ish APIs (XRPC), handles appear as free-form identifiers: `com.atproto.identity.resolveHandle?handle=alice.bsky.social` → `{ did: "did:plc:…" }`. A caller may pass either a handle or a DID to many endpoints; the server handles classification.
- In OAuth and signing flows, always prefer the DID — the handle is display-only.

## 9. Normative examples

Valid handles:

- `jay.bsky.team`
- `8.cn` (single-digit label is fine; the final label `cn` is not all-numeric)
- `laurel.bsky.social`
- `foo-bar.example.com` (internal `-` is allowed; only leading or trailing `-` is forbidden)
- `xn--ls8h.example.com` (punycode for an emoji TLD; display form rendered by UI)

Invalid handles:

- `bsky.social` (single-label; missing dot)
- `123.456.789.10` (matches IPv4 pattern; rejected even though syntactically label-like)
- `-alice.bsky.social` (leading hyphen on a label)
- `alice..bsky.social` (double dot)
- `alice.bsky.social.` (trailing dot)
- `ALICE.BSKY.SOCIAL` (uppercase; normalize before validation — never persist as-is)
- `alice.localhost` (reserved TLD)
- `alice.onion` (reserved TLD)
- `handle.invalid` (the sentinel — never accept as input)

## 10. What this spec does not define

- The wire format of the DID document returned at the end of resolution — see `did-spec.md`.
- How to mint, rotate, or transport a signing key — key rotation lives in the PLC operation log (for `did:plc`) or the webvh log.
- How to bind a PDS to a handle; that is the PDS's job, not the resolver's.
- What UI to show when a handle returns `handle.invalid` — UX guidance only, not a protocol concern.
