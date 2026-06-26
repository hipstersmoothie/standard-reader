# Lexicon resolution — NSID to document

How a consumer takes an NSID and returns a lexicon document. This is what `lexicon-garden.describe_lexicon` automates; understand it yourself when debugging why a resolution fails.

Spec: <https://atproto.com/specs/lexicon#lexicon-resolution> and <https://atproto.com/specs/nsid>.

## The chain

```
NSID ─────────► Authority domain ────► DID ────► DID document ────► PDS ────► record
(com.example   (example.com)        (did:plc:  (service endpoint)   (https://  (the lexicon
 .foo.getBar)                        abc123)                        pds.…)      doc)
         │               │              │            │                │              │
         │ reverse-DNS   │ DNS TXT       │ DID-method │ service entry  │ XRPC         │
         │               │ _lexicon.     │ resolution │ #atproto_pds   │ getRecord    │
         │               │               │            │                │              │
```

## Step-by-step

### 1. Reverse-DNS the NSID

Split the NSID on `.`. The **final segment** is the *name*; the remaining segments reversed form the *authority domain*.

| NSID                                       | Authority domain |
| ------------------------------------------ | ---------------- |
| `com.example.foo.getBar`                   | `example.com`    |
| `com.example.foo.defs`                     | `example.com`    |
| `app.bsky.feed.post`                       | `bsky.app`       |
| `social.pdsls.tools.listBookmarks`         | `pdsls.social`   |
| `sh.tangled.repo`                          | `tangled.sh`     |

The NSID spec requires at least three segments: two authority segments + one name segment. `com.example` is not a valid NSID.

### 2. `_lexicon.<authority>` TXT lookup

Query DNS for the TXT record at `_lexicon.<authority-domain>`. Parse any record whose value starts with `did=`:

```
_lexicon.example.com. 300 IN TXT "did=did:plc:abc123"
```

Rules:

- Exactly one `did=` value wins. If multiple TXT records exist with different DIDs, treat as a resolution failure (do not silently pick one).
- Other keys (`v=`, future extensions) are ignored.
- No `did=` record at all → the authority has not opted into lexicon publication. Fail resolution.

This is distinct from `_atproto.<handle>` (handle → DID for identity). See `atproto-identity-resolution` for that. `_lexicon.` is keyed on a **domain**, not a handle; an authority domain may not even be a registered handle.

### 3. Resolve DID to PDS

Standard DID-doc resolution — defer entirely to `atproto-identity-resolution`. Outcome: the PDS service endpoint (`#atproto_pds` service entry, type `AtprotoPersonalDataServer`).

### 4. Fetch the record

XRPC call to the PDS:

```
GET /xrpc/com.atproto.repo.getRecord
    ?repo=<did>
    &collection=com.atproto.lexicon.schema
    &rkey=<the full NSID>
```

Or via the MCP tools:

```
atpmcp.get_record(at://<did>/com.atproto.lexicon.schema/<nsid>)
# or
lexicon-garden.invoke_xrpc("com.atproto.repo.getRecord", {
  repo: "<did>",
  collection: "com.atproto.lexicon.schema",
  rkey: "<nsid>"
})
```

The response wraps the record: `{ uri, cid, value }`. `value` is the lexicon document.

### 5. Hand to catalog

The `value` field is a valid lexicon document — same shape as if you'd loaded it from a file. Feed it into whatever catalog the consumer uses (`Lexicons` in TypeScript, `BaseCatalog` in Rust, indigo's `BaseCatalog` in Go). See `skills/atproto-lexicon` for catalog idioms.

## Edge cases

- **NSID authority does not match `_lexicon.` owner.** Someone published a lexicon at `com.example.foo.bar` from a DID other than what `_lexicon.example.com` advertises. The PDS accepted the write; spec-conformant consumers reject it at resolution time. The record exists but is effectively unreachable.
- **`_lexicon.` points to a DID with no matching record.** Authority is claimed but the lexicon was never published (or was deleted). Fail with "not found"; do not fall back to other DIDs.
- **Multiple `did=` values in TXT.** Treat as a publisher error. Do not silently pick one — log and fail.
- **CNAME through to another `_lexicon.`** DNS resolvers follow CNAMEs transparently; no special handling needed as long as the terminal record is a TXT with `did=`.
- **DID doc is valid but `#atproto_pds` service is missing.** Can't fetch records. Fail with the same error surface as any other missing-PDS case.
- **Consumer caches.** Authority → DID binding changes rarely; cache it for hours. Record CIDs change per revision; revalidate on `cid` mismatch or on explicit invalidation. Do not cache 404s for long — a freshly published lexicon should be visible within minutes.

## Diagnosis checklist

When a resolution fails and you need to find out where:

1. Does `dig TXT _lexicon.<authority>` return a `did=` record? If no → publisher hasn't set the TXT.
2. Does the DID resolve? Use `atpmcp.resolve_identity(<did>)` or see `atproto-identity-resolution`.
3. Does `getRecord` on the right `(repo, collection=com.atproto.lexicon.schema, rkey=<nsid>)` return a record? If no → not published or published under a different rkey.
4. Does the record's `id` equal the NSID? If not → publisher violated the `id == rkey` rule; the PDS should have rejected, so this is rare.
5. Does `describe_lexicon(<nsid>)` succeed against `lexicon-garden`? If yes but your local chain failed, the difference is in step 1 or 2 (DNS resolver or identity resolver).

## See also

- `record-shape.md` — what the fetched record looks like.
- `authority-and-ownership.md` — why step 2 gates everything.
- `skills/atproto-identity-resolution/SKILL.md` — step 3 in full.
- `skills/atproto-lexicon/shared/nsid.md` — NSID grammar and reserved prefixes.
