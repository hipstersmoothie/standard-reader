# Resolution Flow — Step-by-Step Sequences

This document walks through the concrete sequence for every input type a resolver may see. Use it when you're implementing or debugging a resolver and want a precise ladder of steps including failure branches.

## 0. Overall shape

```
input (string)
  │
  ├─ normalize → classify
  │
  ├─ Handle  →  resolve handle → DID (DNS + HTTPS) → DID document
  ├─ PLC DID →  DID → DID document (PLC directory)
  ├─ Web DID →  DID → DID document (well-known)
  └─ webvh   →  DID → DID log → verify → DID document  (no reference library ships this; see §3.3)
                                                    │
                                                    └─ validate atproto shape
                                                         └─ (if started from handle) bidirectional check
```

## 1. Normalize and classify

Given a raw input string:

1. `input = input.trim()`
2. If `input` starts with `at://`, strip it. Then trim again.
3. Else if `input` starts with `@`, strip it.
4. If result is empty → `InvalidInput` error.
5. Classify by prefix, in this order:
   1. `starts_with("did:webvh:")` → webvh DID. **Note:** none of the three reference libraries (Rust `atproto-identity`, TypeScript `@atproto/identity`, Go indigo) resolve webvh DIDs. Rust's `parse_input` specifically has no webvh branch — webvh strings fall through to the `did:web:` prefix check and misclassify as Web. Treat webvh as "syntax validated, resolution deferred" unless you're wiring in a dedicated webvh resolver.
   2. `starts_with("did:web:")` → Web DID. Syntax may or may not be checked at this step depending on the library; the web-query step will fail for genuinely malformed inputs.
   3. `starts_with("did:plc:")` with valid plc syntax → PLC DID.
   4. Valid handle syntax → Handle.
   5. Else → `InvalidInput`.

**Why webvh before web**: `did:webvh:…` starts with `did:web`, so a naive check would misclassify it. The prefix order above is correct even though no reference library currently completes webvh resolution — getting the classification right is still important for diagnostic messages.

## 2. Handle branch

### 2.1 Launch both transports in parallel

```
(dns_result, http_result) = join!(
    resolve_txt("_atproto." + handle),
    https_get("https://" + handle + "/.well-known/atproto-did"),
)
```

Do **not** sequence them — doing so doubles worst-case latency. Use `tokio::join!`, `asyncio.gather`, `Promise.all`, etc.

### 2.2 Parse DNS TXT result

- If the query errored (NXDOMAIN, timeout, servfail) → DNS result is `Err`.
- Else scan the TXT records. Strip the `did=` prefix from any record that has it. Collect into a set.
- If zero records have `did=` → `Err(NoDIDsFound)` for the DNS side (which is fine if HTTP succeeded).
- If exactly one distinct value → that's the DNS-side DID.
- If two or more distinct values → `Err(MultipleDIDsFound)`. Fail the entire resolution; do not silently pick one.

### 2.3 Parse HTTPS well-known result

- If the HTTP request failed (network error, timeout, non-2xx) → HTTP result is `Err`.
- If the body does not start with `did:` → `Err(InvalidHTTPResolutionResponse)`.
- Otherwise trim surrounding whitespace and accept the body as the HTTP-side DID.
- Reference impl uses `reqwest` with a 10-second timeout and does not check `Content-Type`. Strict implementations should additionally require `Content-Type: text/plain` to avoid accepting HTML from wildcard 200 pages.

### 2.4 Reconcile

Take the `Ok` values from the two results.

| DNS    | HTTPS  | Action                                                                                |
| ------ | ------ | ------------------------------------------------------------------------------------- |
| Ok(a)  | Ok(b)  | if `a == b` → accept `a`; else → `ConflictingDIDsFound` (or prefer DNS — see spec §5) |
| Ok(a)  | Err    | accept `a`, log HTTPS error                                                           |
| Err    | Ok(b)  | accept `b`, log DNS error                                                             |
| Err    | Err    | `NoDIDsFound`                                                                         |

The reference Rust impl uses strict-agreement (raises `ConflictingDIDsFound` on the first row). The spec also permits "prefer DNS". Pick one strategy and stick to it across your codebase.

### 2.5 Onward

The handle branch has now produced a DID. From here, run §3 for that DID, then §5 (validate atproto shape), then §6 (bidirectional check).

## 3. DID branch

Given a classified DID (plc, web, or webvh):

### 3.1 `did:plc`

1. `GET https://<plc-hostname>/<did>` (default `plc.directory`). Most clients also accept a configured alternative directory.
2. Expect `200` and a JSON body.
3. Parse JSON into a DID document struct.
4. If non-200 or body is not JSON → resolution failed.
5. Caching: the PLC directory returns `Cache-Control` headers; honor them but do not rely on them for correctness. Always be willing to re-resolve on signature failure.

### 3.2 `did:web`

1. Extract hostname from `did:web:<hostname>` (strict) or `did:web:<hostname>:<seg>…` (non-strict).
2. `GET https://<hostname>/.well-known/did.json`. For non-strict with path segments, use `https://<hostname>/<seg1>/<seg2>/.../did.json` — but AT Protocol deployments rarely use this form.
3. Expect `200` and a JSON body.
4. Parse JSON into a DID document struct.

### 3.3 `did:webvh`

**No reference atproto library (Rust `atproto-identity`, TypeScript `@atproto/identity`, Go indigo) ships a webvh log resolver.** If you need webvh support, wire in a language-specific webvh library alongside the atproto resolver. Never silently fall back to treating a webvh DID as `did:web` — webvh's whole point is the verifiability, and a lossy fallback is a security regression.

When a webvh resolver *is* wired in, the conceptual sequence is:

1. Parse `did:webvh:<scid>:<hostname>[:segment…]`.
2. Fetch the webvh log URL — this differs from `did:web`: webvh uses `did.jsonl` (line-delimited JSON log) at a webvh-specified path. Consult the webvh spec / library.
3. Verify the log's integrity: hash chain, witness proofs, cryptographic signatures, SCID match.
4. Derive the current DID document from the verified log.
5. If any verification step fails → hard error.

In all three cases (plc, web, or a wired-in webvh), the branch ends with a DID document value (or a failure).

## 4. Assembling the resolved DID when you started from a handle

If the input was a handle, you now have:

- `handle` (after normalization),
- `did` (from §2),
- `did_document` (from §3).

If the input was a DID, you have:

- no `handle` yet (set to `None` until §6),
- `did`,
- `did_document`.

## 5. Validate the DID document has the atproto-required shape

Run all three structural checks (full rules in `did-spec.md §4`):

1. An `alsoKnownAs` entry starting with `at://` (required if you started from a handle; optional — but recommended — if you started from a DID).
2. A `verificationMethod` with `#atproto` id, `type = Multikey`, controller equal to the DID, and a `publicKeyMultibase` value.
3. A `service` with `#atproto_pds` id, `type = AtprotoPersonalDataServer`, and a path-free HTTPS `serviceEndpoint` string.

Missing → `DidDocumentMalformed`. Present but wrong type / wrong controller → `DidDocumentMalformed`.

## 6. Bidirectional handle check (handle-input only)

If you started from a handle:

1. Find the first `at://` entry in `alsoKnownAs`.
2. Compare the handle portion to the input handle, **case-insensitively** on the handle label.
3. If they match → trust the pair.
4. If they do not match → the DID is claiming a different handle, or this DID was never supposed to be resolvable via this handle. Two options:
   - Strict: raise a verification error and surface `handle.invalid` to the caller.
   - Lenient (client-side read path only): render the post but annotate "handle not verified".

Never skip this step for write flows (creating records, signing OAuth flows, issuing tokens). Skipping bidirectional check is how phishing / impersonation bugs creep in.

## 7. Return

Return `(handle_or_None, did, did_document)`. Language-specific signatures vary — see the per-language `resolution.md` for exact return types. A common Rust signature:

```rust
async fn resolve_subject(input: &str) -> Result<(Option<Handle>, Did, Document), ResolveError>
```

## 8. Where MCP tools fit

If you have the `lexicon-garden` or `atpmcp` MCP servers available, you can shortcut the whole flow:

- `lexicon-garden.resolve_identity(subject)` — runs §1 through §5 end-to-end against a trusted resolver, returns a full result you can diff against your own implementation. Useful for conformance testing.
- `atpmcp.resolve_handle_to_did(handle)` — pure handle → DID, no document fetch. Useful for measuring resolution latency on specific handles.
- `atpmcp.resolve_identity(subject)` — same scope as `lexicon-garden.resolve_identity`.

Use these for producing *test fixtures*, not as a runtime substitute for your implementation. The MCP servers have their own DNS stack and caching layer, which is the point when testing, and a distraction when shipping.

## 9. Failure catalogue

| Error                           | Cause                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| `InvalidInput`                  | After normalization, not a handle and not a recognized DID method.        |
| `NoDIDsFound`                   | Neither DNS nor HTTPS returned a DID for a handle.                        |
| `MultipleDIDsFound`             | DNS TXT has more than one `did=` value.                                   |
| `ConflictingDIDsFound`          | DNS and HTTPS disagreed (strict-agreement path only).                     |
| `InvalidHTTPResolutionResponse` | HTTPS responded, but body did not start with `did:`.                      |
| `DNSResolutionFailed`           | DNS transport-level error.                                                |
| `HTTPResolutionFailed`          | HTTP transport-level error (network, TLS, timeout, non-2xx).              |
| `DidDocumentMalformed` *          | Document parsed but missing required atproto fields.                      |
| `BidirectionalCheckFailed` *      | Handle did not appear in the DID document's `alsoKnownAs`.                |
| `SubjectResolvedToHandle`         | Programmer error — a handle input stayed classified as a handle after the handle→DID step. |
| `WebVHVerificationFailed` *       | webvh log verification failed (hash chain, signature, or SCID mismatch).  |

Variants marked `*` are skill-synthesized names: they are not present as variants on the Rust reference impl's `ResolveError` enum. `DidDocumentMalformed` and `BidirectionalCheckFailed` are validation errors your own resolver should introduce after the DID document is fetched. `WebVHVerificationFailed` is a family — there is no webvh resolver in the reference atproto libraries; if you integrate one, use its own error enum. The unmarked names map to variants on `ResolveError` in the Rust reference (`atproto-identity/src/errors.rs`). See `../{lang}/resolution.md` for the exact error shape in each supported language.

Surface these directly to callers so they can differentiate transient (retry) from permanent (don't retry) failures.
