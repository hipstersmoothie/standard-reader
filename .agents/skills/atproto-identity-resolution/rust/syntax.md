# Rust — Handle and DID syntax validation

All string-level validators live in `atproto_identity::validation`. They are pure, synchronous, and free of network I/O — use them freely before touching a DNS stack or HTTP client.

## Validator inventory

```rust
use atproto_identity::validation::{
    is_valid_handle,           // fn(&str) -> Option<String>   — returns the normalized handle on success
    is_valid_hostname,         // fn(&str) -> bool
    is_valid_did_method_plc,   // fn(&str) -> bool
    is_valid_did_method_web,   // fn(&str, strict: bool) -> bool
    is_valid_did_method_webvh, // fn(&str, strict: bool) -> bool
    is_ipv4,                   // fn(&str) -> bool
    is_ipv6,                   // fn(&str) -> bool
    is_valid_base58_btc,       // fn(&str) -> bool  — multibase check, not DID-specific
    strip_handle_prefixes,     // fn(&str) -> &str
};
```

`is_valid_handle` is the odd one out — it returns `Option<String>` with the stripped, lowercase-friendly handle on success, rather than a plain `bool`. Use that return value; don't call it twice.

## Handle validation

```rust
let handle = match is_valid_handle(input) {
    Some(h) => h,
    None => return Err(ResolveError::InvalidInput),
};
```

`is_valid_handle` internally:

1. Calls `strip_handle_prefixes` to remove leading `at://` or `@`.
2. Rejects if the result is not a valid hostname (see §hostname rules).
3. Rejects if there is no `.` separator — a handle must have ≥2 labels.

It does **not** lowercase the result — it returns the exact characters from the input minus the prefix. Wrap with `.to_lowercase()` if you need case-folded storage.

### Hostname rules (`is_valid_hostname`)

- Length ≤ 253 bytes, non-empty.
- Rejects any hostname ending in a reserved TLD. The crate's list is **4 entries**: `.localhost`, `.internal`, `.arpa`, `.local`. The full atproto spec lists 9. If you need the other 5 (`.alt`, `.example`, `.invalid`, `.onion`, `.test`), see `validation.md` §reserved-tlds for a layered pre-check.
- Rejects IPv4 and IPv6 literals.
- Characters must be `[A-Za-z0-9.-]`.
- Each label must be non-empty, ≤63 bytes, not start or end with `-`.

No TLD-cannot-be-numeric check. That is a spec requirement (handle TLDs cannot start with a digit); the current validator does not enforce it. If you want strict spec compliance, layer a post-check on the final label.

### Normalization

For input normalization before validation, the crate does it inline inside `parse_input` (see `resolution.md`). If you're calling `is_valid_handle` directly, the prefix strip is already handled — but you still need to `.trim()` whitespace first:

```rust
let trimmed = input.trim();
let handle = is_valid_handle(trimmed).ok_or(ResolveError::InvalidInput)?;
```

## DID validation

### `did:plc`

```rust
if is_valid_did_method_plc("did:plc:z3f2222fa222f5c33c2f27ez") {
    // accepted
}
```

Rule: `did:plc:` followed by **exactly 24 characters** of `[a-z2-7]` (lowercase base32 alphabet, no uppercase, no padding, no `0`, no `1`, no `8`, no `9`).

### `did:web`

```rust
is_valid_did_method_web(did, /* strict */ true)   // hostname only
is_valid_did_method_web(did, /* strict */ false)  // hostname:seg1:seg2...
```

- Strict: `did:web:<hostname>` — must be a valid hostname per `is_valid_hostname` and nothing else.
- Non-strict: `did:web:<hostname>[:<segment>...]` — each extra colon-separated segment must be non-empty alphanumeric. AT Protocol deployments rarely use the non-strict form in production; prefer strict.

Ports are only allowed for `localhost` in development. A trailing slash is rejected.

### `did:webvh`

```rust
is_valid_did_method_webvh(did, /* strict */ true)
```

Validates webvh **syntax** only. The crate does not fetch webvh logs; even if this validator returns `true`, the resolver pipeline will return `InvalidInput` at `parse_input` time (see `resolution.md`). Useful for pre-screening webvh strings in UIs or logs, not for completing end-to-end resolution.

## `strip_handle_prefixes`

```rust
strip_handle_prefixes("@alice.bsky.social")   // → "alice.bsky.social"
strip_handle_prefixes("at://alice.bsky.social") // → "alice.bsky.social"
strip_handle_prefixes("alice.bsky.social")    // → "alice.bsky.social"
```

Cheap byte-level strip; no trimming, no lowercasing. Call it when you want to display a handle in its canonical form without the UI `@`.

## Common mistakes

| Mistake                                                                         | Fix                                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Calling `is_valid_handle` on the UI `@alice` and getting `None`                 | You didn't. `is_valid_handle` calls `strip_handle_prefixes` first. |
| Calling `is_valid_handle` on untrimmed input and getting `None`                 | Trim whitespace first. The crate does not.                       |
| Expecting `.test` domains to be rejected in production                          | They're not — `.test` is not in the crate's `RESERVED_TLDS`.     |
| Expecting did:webvh inputs to reach a webvh fetcher                             | They don't — `parse_input` returns `InvalidInput`.               |
| Using `is_valid_did_method_web` with `strict=false` by default                  | Default to `true` unless you have a documented reason to permit path-style. |

## See also

- `resolution.md` — how these validators are wired into `parse_input` and the resolver.
- `validation.md` — DID document shape checks (which are conceptually downstream of these syntax checks).
- `../shared/handle-spec.md` — normative handle rules, including the reserved-TLD list.
- `../shared/did-spec.md` — normative DID rules for plc / web / webvh syntax.
