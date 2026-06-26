# Test Vectors (Reference)

Small, hand-checkable fixtures for DRISL, CAR, MST, and commit encoding. Use these to wire up unit tests for a new implementation, or to sanity-check an encoder that's already "mostly working."

All vectors are **synthetic** — they use placeholder CIDs (32 zero bytes of digest) where real-world data would plug in a SHA-256 of something substantial. Byte hexdumps are authoritative; every implementation should produce the exact same bytes.

## 1. DRISL encoding

### 1.1. Empty map

```
a0
```

One byte: major type 5 (map), length 0.

### 1.2. `{"a": 1}`

```
a1         ; map(1)
61 61      ; text(1) "a"
01         ; unsigned(1)
```

4 bytes total.

### 1.3. `{"b": 2, "a": 1}` — keys must be sorted on write

Canonical output (note sort to `a` first, then `b`):

```
a2         ; map(2)
61 61      ; "a"
01         ; 1
61 62      ; "b"
02         ; 2
```

6 bytes. A non-canonical encoder that preserves insertion order would produce `a2 61 62 02 61 61 01` — reject on strict decode.

### 1.4. Integer shortest-form boundary: value 23 vs 24

- `23` → one byte: `17` (immediate, major type 0, value 23).
- `24` → two bytes: `18 18` (major type 0, additional info `0x18` → 1-byte follow-up, value `0x18` = 24).

A strict decoder must reject `18 17` (non-canonical one-byte form of 23), `19 00 17` (two-byte form of 23), and all wider forms.

### 1.5. Negative integer: -5

```
24           ; major type 1, immediate value 4
```

CBOR encodes negative integers as `-1 - N`, where `N` is the immediate value. For `-5`, `N = 4`, so the byte is `0x20 | 4 = 0x24`. One byte total.

### 1.6. Float 1.5

```
fb 3f f8 00 00 00 00 00 00   ; major type 7, info 27 (float64), big-endian IEEE-754 1.5
```

9 bytes. The same value cannot be encoded as 16-bit or 32-bit float in DRISL — always 64-bit.

### 1.7. `null`

```
f6
```

One byte (major type 7, simple value 22).

### 1.8. CID (tag 42)

A dag-cbor CID with a 32-byte all-zero digest:

```
d8 2a                              ; tag 42
58 25                              ; bytes(37)
00                                 ; identity multibase prefix
01 71 12 20 <32 zero bytes>        ; CIDv1 + dag-cbor codec + SHA-256 multihash header + digest
```

41 bytes total: `d8 2a 58 25 00 01 71 12 20 00…(32 zeros)`.

### 1.9. Non-canonical integer (reject on strict decode)

```
18 05         ; one-byte encoding of value 5
```

Strict decode error: `NonCanonicalEncoding`. The canonical form is `05` (immediate).

### 1.10. Forbidden tag (reject on strict decode)

```
c6 01         ; tag 6 (CBOR date string), value 1
```

Strict decode error: `UnsupportedTag`. Only tag 42 is allowed.

## 2. CAR v1

### 2.1. Minimum CAR — header only, one root, no blocks

Let the single root CID `R` have all-zero digest. The header is the DAG-CBOR map:

```
a2                         ; map(2)
65 72 6f 6f 74 73          ; "roots"
81                         ; array(1)
d8 2a                      ; tag 42
58 25                      ; bytes(37)
00 01 71 12 20 <32 zero>   ; identity || CID(dag-cbor, SHA-256, zeros)
67 76 65 72 73 69 6f 6e    ; "version"
01                         ; unsigned(1)
```

58 bytes of header. Frame with varint length `0x3a` (58):

```
3a a2 65 … 01
```

Total 59 bytes. This is not a valid *repo* export (the root block isn't included, and the root CID would mismatch any real commit), but it's a valid CAR framing and a good place to test a reader's varint + header parse before exercising block handling.

### 2.2. Block framing example

A single block with a dag-cbor CID `R` and payload `a0` (empty map):

```
<varint>                   ; block length = cid_len(36) + data_len(1) = 37 = 0x25
25
01 71 12 20 <32-byte digest of 0xa0>   ; CID bytes (no identity prefix in CAR block framing)
a0                         ; payload
```

Verify: decoder reads varint → 37 bytes follow → first 36 bytes are the CID (`0x01 71 12 20` + 32-byte digest) → remaining 1 byte is the payload. The decoder recomputes `SHA-256(0xa0)`, checks it against the declared digest, and accepts the block only if they match. (Compute the expected digest in your chosen implementation to bake a real oracle value into your tests.)

## 3. MST

### 3.1. Key heights for "app.bsky.feed.post/<rkey>"

Using `key_height = leading_zero_bits(SHA-256(key)) / 2`:

| Key                                        | Approx SHA-256 leading hex | Leading zero bits | Height |
| ------------------------------------------ | -------------------------- | ----------------- | ------ |
| `app.bsky.feed.post/3jzfcijpj2z2a`         | (non-zero first nibble)    | 0                 | 0      |
| `app.bsky.feed.post/3jzfcijpj2z2b`         | (non-zero first nibble)    | 0                 | 0      |
| A randomly chosen key with first SHA-256 byte `0x0f` | `0f…`           | 4                 | 2      |
| A key with first byte `0x00` and second byte `0xff` | `00ff…`            | 8                 | 4      |

Expect ~75% of arbitrary keys to land at height 0. You can smoke-test this with 1000 random keys and check the distribution matches the table in `mst.md` §2.

### 3.2. Prefix compression

Keys `app.bsky.feed.post/abc`, `app.bsky.feed.post/def`, all at height 0, sharing a common prefix of 19 bytes:

Entry 0:

```
p = 0
k = "app.bsky.feed.post/abc"   (22 bytes)
v = <value CID>
t = absent
```

Entry 1:

```
p = 19
k = "def"                       (3 bytes)
v = <value CID>
t = absent
```

Reconstructed keys: `key_0 = "app.bsky.feed.post/abc"`, `key_1 = key_0[..19] + "def" = "app.bsky.feed.post/def"`.

Invariants: first entry's `p == 0`, `p <= len(prev_key)`, resulting key sorts strictly greater than previous.

### 3.3. Single-node MST DAG-CBOR encoding

A node with left subtree absent and two entries above:

```
a1                                  ; map(1) — only "e" present (no "l")
65 65                               ; "e"
82                                  ; array(2)

  a3                                ; map(3) — first entry (no "t")
  61 6b                             ; "k"
  56                                ; bytes(22)
  61 70 70 2e 62 73 6b 79 2e 66 65  ; "app.bsky.feed.post/abc"
  65 64 2e 70 6f 73 74 2f 61 62 63
  61 70                             ; "p"
  00                                ; 0
  61 76                             ; "v"
  d8 2a 58 25 00 <37-byte CID>      ; value CID

  a3                                ; map(3) — second entry (no "t")
  61 6b                             ; "k"
  43                                ; bytes(3)
  64 65 66                          ; "def"
  61 70                             ; "p"
  13                                ; 19
  61 76                             ; "v"
  d8 2a 58 25 00 <37-byte CID>      ; value CID
```

Field order inside entry: `k` (0x6b) < `p` (0x70) < `v` (0x76). Omission of `t` and `l` is why those are `a3` (map-of-3) not `a4`, and the outer node is `a1` not `a2`.

## 4. Commit

### 4.1. Genesis commit, spec-strict form (with `prev: null`)

Fields:

- `did = "did:plc:ewvi7nxzyoun6zhxrhs64oiz"` (32 bytes)
- `version = 3`
- `data = <mst_root_cid>` (dag-cbor CID, 37 bytes inside tag 42)
- `rev = "3jzfcijpj2z2a"` (13 bytes)
- `prev = null` (genesis)

DAG-CBOR (`UnsignedCommit`):

```
a5                                    ; map(5)
64 64 61 74 61                        ; "data"
d8 2a 58 25 00 <37-byte CID>          ; data CID

63 64 69 64                           ; "did"
78 20                                 ; text(32)
64 69 64 3a 70 6c 63 3a               ; "did:plc:"
65 77 76 69 37 6e 78 7a               ; "ewvi7nxz"
79 6f 75 6e 36 7a 68 78               ; "youn6zhx"
72 68 73 36 34 6f 69 7a               ; "rhs64oiz"

64 70 72 65 76                        ; "prev"
f6                                    ; null

63 72 65 76                           ; "rev"
6d                                    ; text(13)
33 6a 7a 66 63 69 6a 70               ; "3jzfcijp"
6a 32 7a 32 61                        ; "j2z2a"

67 76 65 72 73 69 6f 6e               ; "version"
03                                    ; unsigned(3)
```

Total: 1 (`a5`) + 5+41=46 (`data` + tag-42 CID) + 4+34=38 (`did` + text(32)) + 5+1=6 (`prev` + `f6`) + 4+14=18 (`rev` + text(13)) + 8+1=9 (`version` + `03`) = **118 bytes**.

(The CID inside tag 42 is 41 bytes: `d8 2a` tag + `58 25` bytes(37) header + 37 payload bytes.)

These 118 bytes are what a signer feeds to its ECDSA function to produce the `sig`. The full signed `Commit` adds:

```
63 73 69 67                           ; "sig"
58 40                                 ; bytes(64)
<64-byte signature r||s>
```

Signed commit total: 118 + 4+2+64 = **188 bytes**, and the outer map header changes from `a5` to `a6` (6 entries now). Map-key order is `data`, `did`, `prev`, `rev`, `sig`, `version`.

### 4.2. Genesis commit, reference-impl form (with `prev` absent)

The reference Rust impl elides `prev` when it's `None`. `UnsignedCommit` becomes:

```
a4                                    ; map(4) — no "prev"
(data, did, rev, version exactly as above, minus the 6-byte prev section)
```

Total: 118 − 6 = **112 bytes** of signing bytes. A signer in reference-impl mode and one in spec-strict mode will produce different signatures over logically identical commits.

When verifying a commit received over the wire:

1. Take the original commit block bytes.
2. Remove exactly the `sig` field (along with its key). Do not alter `prev` (keep it present if it was present, absent if it was absent).
3. Verify over those bytes.

### 4.3. Signature length

- k256 / p256 raw ECDSA signatures are exactly 64 bytes.
- The `sig` field on a valid commit encodes to `58 40 <64 bytes>` = 66 bytes total.
- If you see `59 00 40 <64 bytes>` (non-canonical 2-byte length), reject — it's a non-canonical encoding and will fail strict decode.
- If the `sig` field is longer than 64 bytes, the producer probably emitted DER-wrapped ECDSA. Unwrap to raw r||s before verifying.

## 5. AT-URI

| Input                                                                       | Expected result                                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3jui7kp54ic2i`    | `authority="did:plc:ewvi7nxzyoun6zhxrhs64oiz"`, `collection="app.bsky.feed.post"`, `record_key="3jui7kp54ic2i"` |
| `at://did:web:example.com/app.bsky.feed.like/3k2akjh32kj`                   | valid; did:web authority accepted                                                      |
| `at://did:web:example.com:8080:tenant:users/app.bsky.feed.post/3k…`        | valid *in reference impl* (non-strict did:web path); spec-strict validators may reject |
| `at://did:plc:abcdefghijklmnopqrstuvwx/b/c`                                 | valid; minimal form                                                                    |
| `at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3k…/extra/parts` | valid; extras silently ignored by reference parser                                     |
| `at://alice.bsky.social/app.bsky.feed.post/3k…`                            | `HandleNotSupported` — resolve handle first                                            |
| `at://did:key:z6M…/…`                                                       | `AuthorityParsingFailed` — unsupported DID method                                      |
| `did:plc:…/app.bsky.feed.post/3k…`                                          | `MissingPrefix`                                                                         |
| `at://did:plc:xxx/app.bsky.feed.post/3k…/`                                  | `TrailingSlash`                                                                        |
| `at://did:plc:xxx/`                                                         | `TrailingSlash` (not CollectionMissing — the slash makes it trailing first)            |
| `at://did:plc:xxx`                                                          | `CollectionMissing`                                                                    |
| `at://did:plc:xxx/app.bsky.feed.post`                                       | `RecordKeyMissing`                                                                     |
| `at://did:plc:xxx//3k…`                                                     | `EmptyCollection`                                                                      |
| `at:// /app.bsky.feed.post/3k…`                                             | `AuthorityParsingFailed` — whitespace authority                                        |

## 6. TID round-trips

| String          | `timestamp_micros`    | `clock_id` | Valid?                                                              |
| --------------- | --------------------- | ---------- | ------------------------------------------------------------------- |
| `3jzfcijpj2z2a` | some microseconds ts  | some clock | yes (reference-spec example)                                        |
| `2222222222222` | 0                     | 0          | yes (minimum encodable; first char `2` = value 0)                   |
| `7777777777777` | large                 | large      | yes (spec example — all `7`s = all-bit-5 = value 5 repeated)         |
| `jjjjjjjjjjjjj` | large                 | some       | yes (first char `j` = value 15, which is the max with top bit 0)    |
| `zzzzzzzzzzzzz` | n/a                   | n/a        | **no** — first char `z` = value 31, which sets the top bit         |
| `AAAAAAAAAAAAA` | n/a                   | n/a        | **no** — uppercase letters not in base32-sortable alphabet           |
| `3jzfcijpj2z2`  | n/a                   | n/a        | **no** — 12 chars                                                   |
| `3jzfcijpj2z2aa`| n/a                   | n/a        | **no** — 14 chars                                                   |
| `3jzfcijpj2z2!` | n/a                   | n/a        | **no** — `!` not in alphabet                                        |

## 7. End-to-end fixture

A complete, minimal synthetic repo:

- DID: `did:plc:abcdefghijklmnopqrstuvwx` (24-char base32lower, valid per `atproto-identity-resolution` rules)
- One record: `app.bsky.actor.profile/self` with value `{"$type": "app.bsky.actor.profile", "displayName": "Alice"}`
- MST root: a single node with one entry, `p=0`, `k="app.bsky.actor.profile/self"`, `v=<profile CID>`
- Commit: `{ data: <mst root CID>, did, prev: null, rev: "3jzfcijpj2z2a", sig: <64 bytes>, version: 3 }`
- CAR: header `{version: 1, roots: [<commit CID>]}` + commit block + MST node block + profile record block.

Build this end-to-end in your implementation, then load the same CAR with `atproto-repo::MemoryRepository::from_car` and compare:

- `repo.did() == "did:plc:abcdefghijklmnopqrstuvwx"`
- `repo.commit().rev == "3jzfcijpj2z2a"`
- `repo.get_record(&RecordPath::new("app.bsky.actor.profile", "self")).await.unwrap()` returns the JSON form of your record.

If every CID matches and all lookups succeed, your encoder is at parity with the reference.

## 8. Round-trip invariant

For any value `v` encoded through your encoder:

```
encode(decode(encode(v))) == encode(v)    bytewise
```

A canonical encoder satisfies this trivially. A non-canonical one fails somewhere, usually at integer widening or map sort. Add this as a fuzz target — it catches 90% of production DRISL bugs.

## 9. Upstream fixtures to cross-check against

When the synthetic vectors above pass, validate against real known-good data from the reference implementations:

- **Go (indigo)** — `indigo/atproto/repo/testdata/` and `indigo/atproto/repo/mst/testdata/` hold real-world repo CARs, MST node fixtures, and interop vectors.
- **TypeScript (`@atproto/repo`)** — `atproto/packages/repo/tests/*.test.ts` exercises real commit signing, MST mutation sequences, and CAR round-trips with shared fixture builders.
- **Rust (`atproto-repo`)** — `atproto-identity-rs/crates/atproto-repo/tests/` carries the cross-language interop fixtures, including `prev` divergence cases.

If your encoder disagrees with any of these at the byte level, the bug is in your encoder — they've been validated against each other across ecosystems.
