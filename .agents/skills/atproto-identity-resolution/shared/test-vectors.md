# Test Vectors for AT Protocol Identity Resolution

The AT Protocol handle and DID specs do not ship a normative conformance suite. The vectors below are adapted from the reference Rust implementation at `atproto-identity::validation` plus spec text, and are suitable as unit-test fixtures in any language. Each vector states what the value is, why it matters, and what a conformant resolver must do.

## 1. Handle syntax — must accept

| Handle                              | Why it matters                                                          |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `alice.bsky.social`                 | Canonical bsky-hosted handle.                                           |
| `jay.bsky.team`                     | Multi-label handle on the bsky team namespace.                          |
| `8.cn`                              | Single-digit first label; two-letter TLD. Legal.                        |
| `at.example.com`                    | Label named `at` — reserved-looking but not reserved.                   |
| `laurel.bsky.social`                | Plain lowercase handle.                                                 |
| `sub.domain.example.com`            | Three-level subdomain.                                                  |
| `test-host.example.com`             | Hyphen inside a label (allowed; just not at the edges).                 |
| `123.example.com`                   | All-digit first label (final label `com` is not all-digit).             |
| `xn--ls8h.example.com`              | Punycode label. Display UI may show the decoded form.                   |

After input normalization, all of the following must also be accepted (normalize first, then compare):

| Input                              | Normalized handle             |
| ---------------------------------- | ----------------------------- |
| `@alice.bsky.social`               | `alice.bsky.social`           |
| `at://alice.bsky.social`           | `alice.bsky.social`           |
| `  alice.bsky.social  `            | `alice.bsky.social`           |
| `ALICE.BSKY.SOCIAL`                | `alice.bsky.social` *(spec-mandated lowercase; the reference Rust impl does not lowercase — downstream code must compare case-insensitively or lowercase before storage)* |
| `at://@alice.bsky.social`          | `alice.bsky.social` (strip `at://` first, then `@`) |

## 2. Handle syntax — must reject

| Handle                            | Why it fails                                                               |
| --------------------------------- | -------------------------------------------------------------------------- |
| `localhost`                       | No dot; single label. Handles require ≥ 2 labels.                          |
| `com`                             | Bare TLD; no dot. Single label.                                            |
| `192.168.1.1`                     | IPv4 literal.                                                              |
| `[2001:db8::1]`                   | IPv6 literal (with or without brackets).                                   |
| `example..com`                    | Consecutive dots.                                                          |
| `.example.com`                    | Leading dot.                                                               |
| `example.com.`                    | Trailing dot.                                                              |
| `-alice.bsky.social`              | Leading hyphen on a label.                                                 |
| `alice-.bsky.social`              | Trailing hyphen on a label.                                                |
| `alice_bob.example.com`           | Underscore not allowed in handle labels.                                   |
| `alice@bob.example.com`           | `@` is a UI convention only; never valid inside a handle.                  |
| `alice bsky.social`               | Space inside the string.                                                   |
| `alice.bsky.social.`              | Trailing dot.                                                              |
| `alice.localhost`                 | Reserved TLD (`.localhost`).                                               |
| `alice.local`                     | Reserved TLD (`.local`).                                                   |
| `alice.internal`                  | Reserved TLD (`.internal`).                                                |
| `alice.arpa`                      | Reserved TLD (`.arpa`).                                                    |
| `alice.onion`                     | Reserved TLD (`.onion`). Spec-wide; not enforced by reference Rust yet.    |
| `alice.invalid`                   | Reserved TLD (`.invalid`). Spec-wide; not enforced by reference Rust yet.  |
| `handle.invalid`                  | The sentinel itself — never valid as input.                                |
| `alice.123`                       | Final label is all-digits. *Spec-strict rule. The reference Rust impl's `is_valid_hostname` does not enforce this — it accepts `alice.123`. Strict resolvers should add an explicit final-label check.* |
| (244-char handle)                 | Accept — upper bound for `_atproto.<handle>` still fitting in the 253-char DNS limit. |
| (245-char handle)                 | `_atproto.<handle>` becomes 254 chars, exceeding the DNS cap. Handle itself is still a valid hostname but DNS resolution will fail. |
| (254-char handle)                 | Exceeds the 253-char hostname cap outright. Rejected at syntax.            |

## 3. DID syntax — must accept

| DID                                          | Method   | Notes                                       |
| -------------------------------------------- | -------- | ------------------------------------------- |
| `did:plc:ewvi7nxzyoun6zhxrhs64oiz`           | plc      | Canonical plc DID (24 chars base32lower).   |
| `did:plc:z72i7hdynmk6r22z27h6tvur`           | plc      | Another plc DID.                            |
| `did:plc:aaaaaaaaaaaaaaaaaaaaaaaa`           | plc      | All-`a`s — allowed by the character set.    |
| `did:web:example.com`                        | web      | Strict and non-strict.                      |
| `did:web:sub.example.com`                    | web      | Multi-level hostname.                       |
| `did:web:localhost`                          | web      | Dev only; valid syntactically.              |
| `did:web:example.com:users:alice`            | web      | Non-strict only; path form rarely used.     |
| `did:webvh:z6MkTest123:example.com`          | webvh    | Canonical webvh.                            |
| `did:webvh:XYZ789:sub.example.com`           | webvh    | Uppercase in SCID is fine.                  |
| `did:webvh:z6MkTest123:example.com:path`     | webvh    | Non-strict with path segment.               |

## 4. DID syntax — must reject

| DID                                           | Why it fails                                          |
| --------------------------------------------- | ----------------------------------------------------- |
| `did:plc:ewvi7nxzyoun6zhxrhs64oi`             | 23 chars (must be exactly 24).                        |
| `did:plc:ewvi7nxzyoun6zhxrhs64oiz1`           | 25 chars.                                             |
| `did:plc:EWVI7NXZYOUN6ZHXRHS64OIZ`            | Uppercase; base32lower forbids uppercase.             |
| `did:plc:ewvi7nxzyoun6zhxrhs64oi0`            | `0` is not in base32lower.                            |
| `did:plc:ewvi7nxzyoun6zhxrhs64oi1`            | `1` is not in base32lower.                            |
| `did:plc:ewvi7nxzyoun6zhxrhs64oi8`            | `8` is not in base32lower.                            |
| `did:plc:ewvi7nxzyoun6zhxrhs64oi9`            | `9` is not in base32lower.                            |
| `did:plc:`                                    | Empty method-specific id.                             |
| `DID:PLC:ewvi7nxzyoun6zhxrhs64oiz`            | Uppercase prefix — `did:` is case-sensitive.          |
| `did:web:`                                    | Empty hostname.                                       |
| `did:web:192.168.1.1`                         | IP literal in hostname.                               |
| `did:web:example.localhost`                   | Reserved TLD.                                         |
| `did:web:example.com:`                        | Trailing empty segment.                               |
| `did:web:example.com:path-name`               | Non-alphanumeric in path segment.                     |
| `did:webvh:z6MkTest123`                       | Missing content after SCID.                           |
| `did:webvh::example.com`                      | Empty SCID.                                           |
| `did:webvh:0abc:example.com`                  | `0` not in base58-btc alphabet.                       |
| `did:webvh:Oabc:example.com`                  | `O` not in base58-btc alphabet.                       |
| `did:webvh:Iabc:example.com`                  | `I` not in base58-btc alphabet.                       |
| `did:webvh:labc:example.com`                  | `l` not in base58-btc alphabet.                       |
| `did:webvh:abc-123:example.com`               | Hyphen not in base58-btc alphabet.                    |
| `did:key:zDnaezRmyM3NKx9NCphGiDFNBEMyR2sTZhhMGTseXCU2iXn53` | Method not supported in AT Protocol accounts. |
| `did:ion:EiC…`                                | Method not supported.                                 |

## 5. Handle → DID resolution scenarios

Each row shows the DNS and HTTPS responses for `_atproto.alice.example.com` and `https://alice.example.com/.well-known/atproto-did`, and what the resolver must return.

| DNS TXT                                              | HTTPS body                           | Expected result                                                |
| ---------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| `"did=did:plc:ewvi7nxzyoun6zhxrhs64oiz"`             | `did:plc:ewvi7nxzyoun6zhxrhs64oiz`   | accept `did:plc:ewvi7nxzyoun6zhxrhs64oiz`                      |
| `"did=did:plc:ewvi7nxzyoun6zhxrhs64oiz"`             | (no record / 404 / HTML)             | accept DNS; log HTTPS anomaly                                  |
| (no record)                                          | `did:plc:ewvi7nxzyoun6zhxrhs64oiz`   | accept HTTPS; log DNS anomaly                                  |
| `"did=did:plc:A"`, `"did=did:plc:B"`                 | *anything*                           | `MultipleDIDsFound`                                            |
| `"did=did:plc:A"`                                    | `did:plc:B`                          | strict-agreement: `ConflictingDIDsFound`; prefer-DNS: `A`       |
| (no record)                                          | (no record / 404)                    | `NoDIDsFound`                                                  |
| `"did=did:plc:ewvi7nxzyoun6zhxrhs64oiz"`             | `<!DOCTYPE html>…`                   | Strict content-type check → `InvalidHTTPResolutionResponse`; lenient impl may still accept DNS-only |
| `"did=did:plc:ewvi7nxzyoun6zhxrhs64oiz"` (with trailing spaces) | `  did:plc:ewvi…  \n`     | Trim whitespace, then accept                                   |
| (mixed: both records exist, agree)                   | same DID                             | accept                                                         |

## 6. Minimal conformant DID document

Use this as a fixture for testing your validator. It should pass; mutating any of the three required fields (`alsoKnownAs`, the `#atproto` Multikey, or the `#atproto_pds` service) should fail.

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

## 7. DID document rejection cases

Mutate the minimal document above in each of these ways; each must be rejected:

| Mutation                                                                  | Why it fails                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Remove the entire `alsoKnownAs` array                                     | No handle binding; account cannot be re-bound to its handle.                |
| Replace `"at://alice.example.com"` with `"https://alice.example.com"`     | Not an `at://` URI.                                                         |
| Change `verificationMethod[0].type` from `"Multikey"` to `"Ed25519VerificationKey2020"` | AT Protocol requires `Multikey` specifically.                    |
| Change the `id` to end with `#signingKey` instead of `#atproto`           | No `#atproto`-suffixed verification method → no atproto signing key.        |
| Change `controller` to a different DID                                    | Controller must equal the document's `id`.                                  |
| Drop `publicKeyMultibase` or make it a non-string                         | Cannot extract a public key.                                                |
| Change `service[0].type` from `"AtprotoPersonalDataServer"` to anything else | Service entry does not advertise a PDS.                                  |
| Change `serviceEndpoint` to `"https://morel.us-east.host.bsky.network/api"` | Path components are not allowed in the atproto PDS endpoint.               |
| Change `serviceEndpoint` to an object `{"uri": "…"}`                      | AT Protocol requires a bare HTTPS string.                                   |
| Change `serviceEndpoint` scheme to `http://`                              | HTTPS required.                                                             |
| Change document `id` to differ from the resolved DID                      | Indicates the directory returned the wrong document.                        |

## 8. Bidirectional check scenarios

Input: handle `alice.example.com`. DNS/HTTPS resolve to `did:plc:ewvi7nxzyoun6zhxrhs64oiz`. The DID document's `alsoKnownAs` contains various values:

| `alsoKnownAs` entry                         | Bidirectional outcome for `alice.example.com`                                |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `at://alice.example.com`                    | pass                                                                         |
| `at://ALICE.EXAMPLE.COM`                    | pass (case-insensitive match on handle)                                      |
| `at://bob.example.com`                      | fail → `handle.invalid`                                                      |
| (no `at://` entries; only `https://`)       | fail                                                                         |
| `at://alice.example.com`, later in array    | spec-strict: pass (*any* matching entry counts for bidirectional verification). Reference-impl-strict: **fail** — `Document::handles()` only reads `alsoKnownAs.first()`, so a later-in-array match is invisible. Pick one and document it. |
| (missing `alsoKnownAs` altogether)          | fail                                                                         |
| `at://alice.example.com.` (trailing dot)    | fail (handle form has no trailing dot)                                       |

## 9. Full end-to-end fixtures

### 9.1 Handle input, happy path

- Input: `@alice.bsky.social`
- Normalize: `alice.bsky.social`
- Classify: handle
- DNS TXT `_atproto.alice.bsky.social`: `did=did:plc:abcdefghijklmnopqrstuvwx`
- HTTPS `https://alice.bsky.social/.well-known/atproto-did`: `did:plc:abcdefghijklmnopqrstuvwx`
- DID document fetched from PLC directory: contains `alsoKnownAs: ["at://alice.bsky.social"]`, `#atproto` Multikey, `#atproto_pds` service
- Output: `(handle = "alice.bsky.social", did = "did:plc:abcdefghijklmnopqrstuvwx", document)`

### 9.2 DID input, happy path

- Input: `did:plc:abcdefghijklmnopqrstuvwx`
- Normalize: `did:plc:abcdefghijklmnopqrstuvwx`
- Classify: plc
- Fetch DID document from PLC directory
- Output: `(handle = None, did = "did:plc:abcdefghijklmnopqrstuvwx", document)`
- Bidirectional check skipped — no handle was in the input

### 9.3 Handle input, bidirectional failure

- Input: `mallory.example.com`
- DNS returns `did:plc:victim…`
- DID document's `alsoKnownAs` contains only `at://victim.bsky.social` (the real handle of that DID)
- Bidirectional check fails → persist `handle.invalid` for this account, refuse to complete a signup flow

### 9.4 Handle input, conflicting DIDs

- Input: `alice.example.com`
- DNS returns `did:plc:A`
- HTTPS returns `did:plc:B`
- Strict-agreement impl: raise `ConflictingDIDsFound` immediately; do not fetch any DID document
- Prefer-DNS impl: accept `did:plc:A`, log the divergence, continue with DID document fetch
