# AT Protocol DID Specification (Reference)

Source of truth: https://atproto.com/specs/did

This document restates the spec's normative rules on DID syntax, the DID document shape required by AT Protocol, and the per-method resolution rules for `did:plc`, `did:web`, and `did:webvh`.

## 1. DID as permanent identifier

In AT Protocol, the DID is the **permanent, globally unique identifier** for an account. It persists across handle changes, PDS migrations, and rotations of signing keys. Records, repositories, and signatures all point at DIDs, not handles.

A DID resolves to a **DID document** — a JSON object containing the handle binding, the signing key, and the PDS endpoint.

## 2. DID syntax

### 2.1 Generic form

```
did:<method>:<method-specific-id>
```

- `did:` is a literal ASCII prefix.
- `<method>` is 1+ characters from `[a-z]`. Method names are **case-sensitive lowercase**; `DID:PLC:…` and `did:PLC:…` are not valid.
- `<method-specific-id>` uses characters from `[A-Za-z0-9._:%-]`. Inside this region, `%` is only valid when immediately followed by two hex digits (percent encoding). No other uses of `%` are permitted.
- Total length ≤ **2048 characters**. Practical guidance: DIDs used in AT Protocol are almost always ≤ 64 characters. Treat anything approaching the 2 KB cap as a smell.
- No query string (`?…`), no fragment (`#…`). AT Protocol references outside the DID (key ids, service ids) use fragments, but those fragments are on a *DID URL*, not the bare DID.

### 2.2 Strictness

DID strings are compared **byte-for-byte**. Two DIDs that differ only in case are not equal. Canonicalize once on input (as written) and never re-case them.

### 2.3 Rejection cases for bare DIDs

- `DID:PLC:ewvi7nxzyoun6zhxrhs64oiz` — uppercase `DID:` prefix
- `did:plc:EWVI7NXZYOUN6ZHXRHS64OIZ` — for did:plc, uppercase is invalid (see §3.1)
- `did:plc:` — empty method-specific id
- `did:plc:ewvi7nxzyoun6zhxrhs64oiz?something` — query string not allowed
- `did:plc:ewvi7nxzyoun6zhxrhs64oiz/extra` — extra path component not allowed
- `did:key:zDna…` — `did:key` is not a supported AT Protocol DID method (used only for ephemeral signing in some adjacent flows)

## 3. Supported methods

AT Protocol accepts three DID methods. Any other method must be rejected.

### 3.1 `did:plc`

- **Format**: `did:plc:<24 chars base32lower>`.
- Base32lower alphabet: `[a-z2-7]`. No `0`, `1`, `8`, `9`; no uppercase.
- Length is always exactly **24** characters after `did:plc:` (so the full DID is always 32 characters).
- Resolution: `GET https://<plc-hostname>/<did>` where `<plc-hostname>` is the PLC directory host you trust (production default: `plc.directory`). Response body is the DID document in JSON.
- Operation log (outside this skill): `GET /<did>/log` and `/log/audit` for history; mutations via signed operations.

Examples:

- Valid: `did:plc:ewvi7nxzyoun6zhxrhs64oiz`
- Valid: `did:plc:z72i7hdynmk6r22z27h6tvur`
- Invalid: `did:plc:EWVI7NXZYOUN6ZHXRHS64OIZ` (uppercase not in base32lower)
- Invalid: `did:plc:ewvi7nxzyoun6zhxrhs64oi` (23 chars)
- Invalid: `did:plc:ewvi7nxzyoun6zhxrhs64oiz1` (25 chars)
- Invalid: `did:plc:ewvi7nxzyoun6zhxrhs64oiz0` (contains `0`)

### 3.2 `did:web`

- **Format**: `did:web:<hostname>[:port]`.
- Resolution: `GET https://<hostname>/.well-known/did.json`.
- Path-based did:web (`did:web:example.com:users:alice` → `/users/alice/did.json`) is **permitted by the generic did:web method spec**, but AT Protocol deployments overwhelmingly use hostname-only form. The reference Rust impl exposes a `strict` flag: strict mode accepts only hostname form; non-strict mode accepts colon-separated alphanumeric path segments. Use strict mode unless you have a specific integration that needs otherwise.
- Ports are only permitted for `localhost` during development. A production `did:web:example.com:8080` is not supported.
- Hostname rules: same as the handle hostname rules (§2 of `handle-spec.md`) — no IP literals, no reserved TLDs, valid DNS labels.

Examples:

- Valid: `did:web:example.com`
- Valid: `did:web:sub.example.com`
- Valid (non-strict): `did:web:example.com:users:alice`
- Valid (dev only): `did:web:localhost`
- Invalid: `did:web:192.168.1.1` (IP literal)
- Invalid: `did:web:example.localhost` (reserved TLD)
- Invalid: `did:web:` (empty hostname)
- Invalid: `did:web:example.com:` (empty trailing segment)
- Invalid: `did:web:example.com:path-name` (segment must be alphanumeric)

### 3.3 `did:webvh` (Verifiable History)

- **Format**: `did:webvh:<scid>:<hostname>[:segment[:segment…]]`.
- `<scid>` (self-certifying identifier) is a non-empty base58-btc string — alphabet `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`. Notably **excludes** `0`, `O`, `I`, `l` to avoid visual ambiguity.
- `<hostname>` and optional segments follow the same rules as `did:web` (strict vs non-strict per the controller's choice).
- Resolution: fetch the DID **log** from the webvh-derived URL, verify the log's integrity (hash chain, signatures, witness proofs), and derive the current DID document from the log state. This is substantially more involved than `did:web`; use a library rather than rolling your own.
- Because verification can fail even when the fetch succeeds, webvh resolution has **three** outcomes: fetched+verified (accept), fetched+verification-failed (reject with a distinct error; do not fall back to `did:web`), and fetch-failed (network error, retry).
- Detection order matters: `did:webvh:` prefix must be matched **before** `did:web:` so that `did:webvh:…` is never misclassified as `did:web:`. The reference impl's `parse_input` checks webvh first.

Examples:

- Valid: `did:webvh:z6MkTest123:example.com`
- Valid: `did:webvh:z6MkTest123:example.com:tenant1:users:alice` (non-strict)
- Invalid: `did:webvh:z6MkTest123` (missing hostname)
- Invalid: `did:webvh::example.com` (empty SCID)
- Invalid: `did:webvh:0abc:example.com` (SCID contains `0`, not in base58-btc alphabet)
- Invalid: `did:webvh:z6MkTest-123:example.com` (SCID contains `-`, not alphanumeric)

## 4. DID document shape

A DID document is a JSON object. For AT Protocol purposes, three entries are required; the rest is generic DID-Core.

### 4.1 `id`

The `id` field must equal the DID itself. Mismatches are a document-malformed error.

```json
{ "id": "did:plc:ewvi7nxzyoun6zhxrhs64oiz" }
```

### 4.2 `alsoKnownAs` — the handle binding

- Array of strings.
- The AT Protocol handle, if any, appears as a fully-qualified `at://` URI: `at://<handle>`.
- The **first** syntactically valid `at://` URI in the array is the canonical handle for back-verification. *The reference Rust impl's `Document::handles()` takes `alsoKnownAs.first()` unconditionally and strips any `at://` prefix — it does not filter for "valid `at://` URIs". Stricter validators should require the `at://` prefix before treating an entry as a handle binding.*
- Non-atproto entries are ignored (e.g. `https://example.com/profile` URLs that some ecosystems add for discoverability).
- Missing or empty array means the account has no handle — its current handle is `handle.invalid` by definition.

```json
{ "alsoKnownAs": ["at://alice.example.com"] }
```

### 4.3 `verificationMethod` — the signing key

An array of verification-method objects. One entry must satisfy all four of:

- `id` ends with `#atproto` (either `#atproto` relative or `did:plc:…#atproto` fully qualified).
- `type` is exactly the string `"Multikey"`.
- `controller` equals the `id` of the DID document (the DID itself).
- `publicKeyMultibase` is the multibase-encoded public key (`z…` for base58-btc-encoded ed25519 / k256 / p256).

The *first* entry matching all four is the active atproto signing key. Other verification methods in the array (for recovery keys, rotation keys, or non-atproto uses) are tolerated but not consumed.

```json
{
  "verificationMethod": [
    {
      "id": "did:plc:ewvi7nxzyoun6zhxrhs64oiz#atproto",
      "type": "Multikey",
      "controller": "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
      "publicKeyMultibase": "zQ3shQo6wGcC7YizTWqzAFvE2Qxou1pwmTwCKXY8JVjfeKtJd"
    }
  ]
}
```

### 4.4 `service` — the PDS endpoint

An array of service entries. One entry must satisfy:

- `id` ends with `#atproto_pds` (relative `#atproto_pds` or fully-qualified).
- `type` is exactly the string `"AtprotoPersonalDataServer"`.
- `serviceEndpoint` is a string containing an HTTPS URL that has:
  - scheme `https://`,
  - hostname,
  - optional port,
  - **no** path, no query, no fragment, no userinfo.

`serviceEndpoint` as an object or array (general-DID-Core patterns) is not accepted in AT Protocol — it must be a bare string.

```json
{
  "service": [
    {
      "id": "#atproto_pds",
      "type": "AtprotoPersonalDataServer",
      "serviceEndpoint": "https://morel.us-east.host.bsky.network"
    }
  ]
}
```

### 4.5 Minimal conformant document

A DID document that atproto treats as valid:

```json
{
  "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
  "id": "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
  "alsoKnownAs": ["at://alice.example.com"],
  "verificationMethod": [
    {
      "id": "did:plc:ewvi7nxzyoun6zhxrhs64oiz#atproto",
      "type": "Multikey",
      "controller": "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
      "publicKeyMultibase": "zQ3shQo6wGcC7YizTWqzAFvE2Qxou1pwmTwCKXY8JVjfeKtJd"
    }
  ],
  "service": [
    {
      "id": "#atproto_pds",
      "type": "AtprotoPersonalDataServer",
      "serviceEndpoint": "https://morel.us-east.host.bsky.network"
    }
  ]
}
```

## 5. Validation order for a fetched document

Apply checks in the order that produces the most actionable error:

1. `id` equals the DID you resolved. (Else: wrong document served.)
2. `alsoKnownAs` exists and contains at least one `at://` entry (if verifying a handle).
3. `verificationMethod` contains an entry meeting the §4.3 rules.
4. `service` contains an entry meeting the §4.4 rules.
5. Only after all three structural checks pass, perform bidirectional handle verification.

A failure in any step is terminal. The spec explicitly labels a document missing any of the three required atproto-specific entries as "likely broken".

## 6. What about did:key, did:ion, did:ethr?

- `did:key` is sometimes used in adjacent flows (for example, as an ephemeral signing key). It is **not** a valid AT Protocol account identifier; reject at account boundaries.
- `did:ion`, `did:ethr`, and other general DID methods are not supported. A conformant resolver must reject them rather than failing open.

## 7. Relationship to DID Core

Every AT Protocol DID document is a valid DID-Core document, but the converse is not true: DID-Core allows forms AT Protocol rejects (non-Multikey verification methods as the signing key, `serviceEndpoint` as an object, empty `alsoKnownAs`, etc.). Interop goes one way — AT Protocol consumers can hand DIDs to DID-Core tooling, but must not accept arbitrary DID-Core documents into AT Protocol flows.
