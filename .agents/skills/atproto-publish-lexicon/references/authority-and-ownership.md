# NSID authority and ownership

Why publishing a lexicon is a two-party contract between the publisher's DNS and the publisher's repo — and why getting the DNS half wrong turns your publish into a silent no-op.

## The authority model in one paragraph

Every NSID has an authority domain (reverse-DNS of all but the final segment). The holder of that domain declares *which DID* is authorized to publish lexicons under it via a single DNS TXT record: `_lexicon.<authority>` with value `did=<did>`. Publishing a `com.atproto.lexicon.schema` record *from* that DID, with rkey equal to the NSID, makes the lexicon resolvable. Publishing from any other DID succeeds on the PDS but fails resolution — consumers check the DNS record at read time and ignore records published by a DID that doesn't match.

## Why the PDS doesn't enforce this

The PDS has no way to know which NSIDs a DID is authorized to publish. Authority is a property of DNS, not of atproto identity. A DID can legitimately own multiple authority domains (one company publishing under several brands), and an authority domain can legitimately rotate its designated DID over time. Encoding the check into the PDS would make publication brittle against both cases.

So the PDS does only structural checks (see `record-shape.md`), and consumers enforce authority at resolution time. This means:

- You can publish a lexicon under *any* NSID you like. The write will succeed.
- **That lexicon will not resolve** unless the `_lexicon.<authority>` TXT points at your DID.
- There is no "unauthorized publish" error. It's silence.

Common first-time-publisher bug: running the publish step, getting a 200 from the PDS, and assuming success — then wondering why `describe_lexicon` returns 404 later.

## The squatting problem

Because writes aren't gated, someone can publish a lexicon under `com.example.foo.bar` from their own DID without owning `example.com`. What happens:

- Their record exists in their repo at `at://their-did/com.atproto.lexicon.schema/com.example.foo.bar`.
- Conformant consumers never see it — they'll check `_lexicon.example.com`, get the real DID (or nothing), and ignore the squatter's record.
- The squatter has burned an NSID they can't serve. If the real authority later wants to publish, the two records exist in parallel on different repos; resolution still goes to the authority-blessed one.

Upshot: squatting is functionally harmless. It wastes the squatter's repo space and does nothing. Don't bother policing it; the resolver contract does the work.

## Authority domain vs publisher handle

These can be *different*, and this trips people up:

- `example.com` is the authority domain for `com.example.*` lexicons.
- The publisher's handle might be `alice.example.com`, or `alice.bsky.social`, or anything else — the handle is unrelated to the authority.
- What matters is that the `_lexicon.example.com` TXT resolves to the same DID that `alice.whatever` resolves to (or that is otherwise controlled by the publisher).

You can publish from a handle on any domain, as long as the authority's `_lexicon.` TXT names your DID. The handle's `_atproto.<handle>` TXT (used for identity, see `atproto-identity-resolution`) is a completely separate record — same DNS system, different purpose, different prefix.

## Multi-NSID publishers

If one DID publishes under several authorities (e.g. a developer who owns both `example.com` and `example.org`), each authority's `_lexicon.` TXT must independently name that DID. There is no global registry; the binding is per-domain.

## Rotating authority

To hand off an NSID prefix to a new publisher:

1. The new publisher publishes their lexicons from their DID. These won't resolve yet.
2. The authority domain's operator flips the `_lexicon.<authority>` TXT to the new DID.
3. Consumers' DNS TTL drains; resolution flips to the new DID's records.
4. The old DID's records become unreachable (same as the squatter case). The old publisher can optionally delete them; it doesn't affect anything.

There is no "transfer" operation at the protocol level. DNS is the control plane.

## What "ownership" actually means

Owning an NSID means: you control the authority domain's DNS *and* you control the DID that domain's `_lexicon.` TXT points to. Losing either (domain expires, DID is compromised) loses control of the NSID. The only recovery is to rotate both.

Practical implication: for long-lived lexicons that other projects depend on, keep the authority domain registration healthy the same way you'd keep a code-signing cert healthy. A lapsed domain is a lexicon takedown.

## See also

- `record-shape.md` — what the PDS does and does not validate on write.
- `resolution-flow.md` — how consumers apply the check at read time.
- `backward-compat-revisions.md` — versioning once authority is established.
- `skills/atproto-identity-resolution/SKILL.md` — `_atproto.` (the handle-resolution DNS prefix), which is *not* this one.
