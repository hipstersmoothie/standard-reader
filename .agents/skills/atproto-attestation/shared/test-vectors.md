# Test vectors

There is no published canonical test-vector set for badge.blue attestations at this time. This file catalogs the fixtures that do exist, their provenance, and what they prove.

## What we have

### Reference crate unit tests

The Rust `atproto-attestation` crate ships with unit tests that verify:

- CID determinism: identical `(record, metadata, repository)` inputs produce identical CIDs.
  Source: `attestation.rs` — `test_create_attestation_cid_deterministic`.
- Repository binding: different `repository` DIDs produce different CIDs for the same record + metadata.
  Source: `attestation.rs` — `test_create_attestation_cid_different_repositories`.
- Signature uniqueness: different messages or different repositories produce different signatures.
  Source: `attestation.rs` — `create_signature_different_inputs_produce_different_signatures`, `create_signature_different_repositories_produce_different_signatures`.
- Round-trip: a signature produced by `create_signature` validates against the same computed CID and public key.
  Source: `attestation.rs` — `create_signature_returns_valid_bytes`.
- CID format: produced CIDs are CIDv1, codec `0x71`, 32-byte SHA-256 digest, 36 bytes total.
  Source: `cid.rs` — `test_create_attestation_cid`, `test_validate_dagcbor_cid`.
- P-256 / K-256 low-S normalization rejects invalid lengths.
  Source: `signature.rs` — `reject_invalid_signature_length`.

These tests do not carry stable reference byte-strings (signatures are produced from random keys each run). They prove *properties*, not specific values.

### CLI round-trip

The reference crate's binaries (`atproto-attestation-sign`, `atproto-attestation-verify`) can be used to create a signature with one build and verify it with another. This is the closest thing to an interop vector today:

```
# Terminal A: produce
echo '{"$type":"app.example.post","text":"hi"}' \
  | cargo run -p atproto-attestation --features clap,tokio --bin atproto-attestation-sign \
      -- inline - did:key:zQ3sh... '{"$type":"com.example.sig","key":"did:key:zQ3sh..."}' \
  > signed.json

# Terminal B: consume
cargo run -p atproto-attestation --features clap,tokio --bin atproto-attestation-verify \
      -- ./signed.json did:plc:test123
```

When writing a new implementation, producing a signed record via the CLI and verifying it via your implementation (and vice versa) is the primary interop test. See `divergence-matrix.md` for known interop hazards.

### badge.blue /verify page

The tool at <https://badge.blue/verify> verifies any published AT-URI's attestations client-side. It's useful for confirming a published record validates against the spec but does not expose raw intermediate values (content CID, signed bytes).

## What we need (gaps)

A complete test vector set should include, for each curve (P-256, K-256):

- A fixed `(record, metadata, repository)` triple.
- The expected content CID (bytes + string form).
- A fixed key pair (private + public) — this is the tricky part, as baking a private key into a fixture has security-hygiene implications but is standard for test vectors.
- The expected raw signature, the expected normalized signature, the expected base64.
- For remote: the expected proof record bytes, the expected proof-record CID.
- A counter-example showing that changing the repository DID by one character produces a different CID.

None of this exists upstream yet. A reasonable approach for a new implementation:

1. Write your own fixture generator using a deterministic private key (e.g., one derived from `SHA256("atproto-attestation-test-vector-1")`).
2. Use it to self-check determinism within your implementation.
3. Run the same generator against the Rust reference crate (via the CLI or a small wrapper) and compare outputs.
4. Contribute the resulting vectors upstream once cross-validated.

## Golden values (empty — placeholder)

Reserved for canonical test vectors when they land:

- [ ] `vector-1-inline-p256.json` — a complete inline attestation with P-256.
- [ ] `vector-2-inline-k256.json` — a complete inline attestation with K-256.
- [ ] `vector-3-remote.json` — a complete remote attestation (subject record + proof record).
- [ ] `vector-4-replay-fail.json` — a cross-repo replay showing the verifier rejects.

Update this file when they're added.

## See also

- `spec.md` §10 — gaps in the spec.
- `divergence-matrix.md` — interop-hazardous implementation differences.
- Reference crate source: `/Users/nick/conductor/workspaces/atproto-crates-studious-guide/delhi-v2/crates/atproto-attestation/src/` (also at <https://tangled.org/ngerakines.me/atproto-crates/tree/main/crates/atproto-attestation>).
