/**
 * Label signature verification (sync path only).
 *
 * Every label a labeler emits is signed with the key published as
 * `#atproto_label` in the labeler's DID document. The signature covers the
 * canonical dag-cbor encoding of the label *without* its `sig` field, so we
 * re-encode the same bytes and check them against the labeler's public key.
 * See https://atproto.com/specs/label.
 *
 * The spec says verification happens on receipt, so this runs once per label in
 * `sync.server.ts` before anything is mirrored into `document_labels`. Request
 * paths read the already-verified mirror and never re-verify.
 *
 * A label that fails verification is dropped, not stored: a bad signature means
 * either the labeler is misbehaving or something in between rewrote the label,
 * and in both cases the `src` on it can no longer be trusted.
 */

import { parseDidKey, verifySignature } from "@atproto/crypto";
import * as dagCbor from "@ipld/dag-cbor";

import { assertSafeFetchUrl } from "#/server/security/ssrf-guard";

import type { DisplayLabel } from "./labels.server.ts";

/** How long a resolved signing key is reused before we re-fetch the DID doc. */
const KEY_TTL_MS = 60 * 60 * 1000;
/** How long a failed key resolution is remembered before retrying. */
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
/**
 * Floor on how often a mismatch may force a DID re-resolution for one labeler.
 *
 * Without this, a labeler serving a page of unverifiable labels would trigger
 * one DID-document fetch *per label* — turning junk from a labeler into an
 * amplified burst against plc.directory or the labeler's own did:web host. A
 * real key rotation only needs to be picked up once, so re-resolving at most
 * this often loses nothing.
 */
const REFRESH_COOLDOWN_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const PLC_URL = process.env.TAP_PLC_URL || "https://plc.directory";

interface KeyEntry {
  /** `did:key:…` form of the labeler's `#atproto_label` key, or null if absent. */
  didKey: string | null;
  expiresAt: number;
  /** When this entry was fetched, for the re-resolution cooldown. */
  fetchedAt: number;
}

interface DidDocument {
  id?: string;
  verificationMethod?: Array<{
    id?: string;
    type?: string;
    controller?: string;
    publicKeyMultibase?: string;
  }>;
}

const keyCache = new Map<string, KeyEntry>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchDidDoc(did: string): Promise<DidDocument | null> {
  let url: string;
  if (did.startsWith("did:plc:")) {
    url = `${PLC_URL}/${encodeURIComponent(did)}`;
  } else if (did.startsWith("did:web:")) {
    const host = did.slice("did:web:".length).replaceAll(":", "/");
    url = `https://${host}/.well-known/did.json`;
    // did:web host comes from a record we indexed — validate before fetching so
    // a hostile registration can't point us at internal infrastructure.
    try {
      assertSafeFetchUrl(url);
    } catch {
      return null;
    }
  } else {
    return null;
  }
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as DidDocument;
  } catch {
    return null;
  }
}

/**
 * The `did:key` form of a labeler's label-signing key, from the `#atproto_label`
 * verification method in its DID document. `null` when the DID doesn't resolve
 * or publishes no such key (in which case none of its labels can be verified).
 */
function signingKeyFromDoc(did: string, doc: DidDocument): string | null {
  const method = doc.verificationMethod?.find(
    (vm) => vm.id === `${did}#atproto_label` || vm.id === "#atproto_label",
  );
  const multibase = method?.publicKeyMultibase;
  if (!multibase) return null;
  const didKey = `did:key:${multibase}`;
  // Reject a key we can't parse now rather than failing on every label later.
  try {
    parseDidKey(didKey);
  } catch {
    return null;
  }
  return didKey;
}

/**
 * Resolve (and cache) a labeler's signing key. Concurrent callers for the same
 * DID share one DID-document fetch — a sync run verifies a whole page of labels
 * from the same labeler at once.
 */
export async function labelerSigningKey(
  did: string,
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  const cached = keyCache.get(did);
  if (options.forceRefresh) {
    // Rate-limit forced re-resolution so a flood of bad labels can't turn into
    // a flood of DID-document fetches.
    if (cached && Date.now() - cached.fetchedAt < REFRESH_COOLDOWN_MS) {
      return cached.didKey;
    }
  } else {
    if (cached && cached.expiresAt > Date.now()) return cached.didKey;
    const pending = inflight.get(did);
    if (pending) return pending;
  }

  const promise = (async () => {
    const doc = await fetchDidDoc(did);
    const didKey = doc ? signingKeyFromDoc(did, doc) : null;
    const now = Date.now();
    keyCache.set(did, {
      didKey,
      expiresAt: now + (didKey ? KEY_TTL_MS : NEGATIVE_TTL_MS),
      fetchedAt: now,
    });
    return didKey;
  })();

  inflight.set(did, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(did);
  }
}

/**
 * The bytes a label's `sig` covers: canonical dag-cbor of the label with `sig`
 * removed.
 *
 * Only the fields the spec defines are included, and absent ones are omitted
 * entirely. That is deliberate on two counts: it reproduces exactly what a
 * conforming labeler signed, and it satisfies the spec's warning about signing
 * unexpected fields (a label must not be able to smuggle extra keys through the
 * signed bytes and remain valid). dag-cbor sorts map keys, so the insertion
 * order here is irrelevant.
 */
export function labelSigningBytes(label: DisplayLabel): Uint8Array {
  const out: Record<string, unknown> = {
    ver: label.ver ?? 1,
    src: label.src,
    uri: label.uri,
    val: label.val,
    cts: label.cts,
  };
  if (label.cid) out.cid = label.cid;
  if (label.exp) out.exp = label.exp;
  // `neg` is included whenever the labeler serialized it — **including when it
  // is `false`** — because the signature covers the object as that labeler
  // encoded it. Dropping a present `neg: false` silently broke every label from
  // labelers that write the field explicitly rather than omitting it: three of
  // the labelers a real reader subscribes to went from 0% to 100% verified on
  // this one line. Labelers that omit `neg` on active labels are unaffected,
  // since it stays absent here too.
  if (label.neg !== undefined) out.neg = label.neg;
  // Deliberately an allowlist of the lexicon's fields. Label servers have been
  // seen adding their own `id` to responses, which was never part of the signed
  // object — signing over "everything except sig" would fail on those.
  return dagCbor.encode(out);
}

/** Decode a label's `sig` from either XRPC JSON (`{$bytes}`) or raw bytes. */
export function labelSignatureBytes(label: DisplayLabel): Uint8Array | null {
  const sig = label.sig;
  if (!sig) return null;
  if (sig instanceof Uint8Array) return sig;
  if (typeof sig === "object" && typeof sig.$bytes === "string") {
    try {
      return Uint8Array.from(Buffer.from(sig.$bytes, "base64"));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Whether a label is authentically from the labeler named in its `src`.
 *
 * Rejects a label whose `src` isn't the labeler we asked (a labeler may only
 * vouch for itself here), that carries no signature, or whose signature doesn't
 * check out. On a signature mismatch the DID document is re-resolved once and
 * the check retried — the spec calls this out as the key-rotation case, where a
 * labeler has rotated its key and our cached copy is simply stale.
 */
export async function verifyLabel(
  label: DisplayLabel,
  expectedSrc: string,
): Promise<boolean> {
  if (label.src !== expectedSrc) return false;
  if (!label.uri || !label.val || !label.cts) return false;

  const sig = labelSignatureBytes(label);
  if (!sig) return false;

  const bytes = labelSigningBytes(label);

  const check = async (didKey: string | null): Promise<boolean> => {
    if (!didKey) return false;
    try {
      return await verifySignature(didKey, bytes, sig);
    } catch {
      return false;
    }
  };

  if (await check(await labelerSigningKey(expectedSrc))) return true;

  // Stale key? Re-resolve once and retry before calling the label bad.
  const rotated = await labelerSigningKey(expectedSrc, { forceRefresh: true });
  return check(rotated);
}

/**
 * Drop every label that isn't verifiably from `expectedSrc`. Returns the labels
 * that passed plus how many were rejected, so the sync can log a labeler that
 * has started serving junk.
 */
export async function verifyLabels(
  labels: Array<DisplayLabel>,
  expectedSrc: string,
): Promise<{ verified: Array<DisplayLabel>; rejected: number }> {
  const results = await Promise.all(
    labels.map(async (label) =>
      (await verifyLabel(label, expectedSrc)) ? label : null,
    ),
  );
  const verified = results.filter((l): l is DisplayLabel => l !== null);
  return { verified, rejected: labels.length - verified.length };
}

/** Test seam: forget every cached signing key. */
export function resetSigningKeyCache(): void {
  keyCache.clear();
  inflight.clear();
}
