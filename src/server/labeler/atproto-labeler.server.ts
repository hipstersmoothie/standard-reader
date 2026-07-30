/**
 * Resolve a *standard* AT Protocol labeler — one that has published no
 * `app.standard-reader.labeler.service` record.
 *
 * Our own labelers register themselves with an app record (see
 * `resolve.server.ts`), but the wider network declares a labeler the Bluesky
 * way: an `#atproto_labeler` service in the DID document pointing at the label
 * server, plus an `app.bsky.labeler.service` record in the operator's repo
 * carrying the label-value definitions. Everything we need for a directory
 * card and for `queryLabels` sync is in those two places, so a labeler like
 * pub-search works with no action on their part.
 *
 * This module does network I/O and is therefore **not** a request path. It runs
 * once at registration; the result is persisted into `labeler_services` so all
 * subsequent reads are plain DB reads (the documented backfill pattern).
 */

import { blobCid, getBlobUrl } from "#/server/atproto/blob";
import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";
import {
  resolveIdentity,
  resolveLabelerServiceEndpoint,
} from "#/server/atproto/identity";
import { assertSafeFetchUrl } from "#/server/security/ssrf-guard";

import type { LabelValueDef } from "./resolve.server.ts";

/** The Bluesky-flavored labeler declaration record, one per operator repo. */
const BSKY_LABELER_SERVICE = "app.bsky.labeler.service";
/** The operator's profile record, used for the card's name/avatar. */
const BSKY_ACTOR_PROFILE = "app.bsky.actor.profile";

/** A labeler as declared on the network, ready to upsert into the read-model. */
export interface AtprotoLabelerDeclaration {
  did: string;
  serviceEndpoint: string;
  /** Handle from the DID document's `alsoKnownAs`, if it declares one. */
  handle: string | null;
  displayName: string | null;
  description: string | null;
  avatarUrl: string | null;
  labelValueDefinitions: Array<LabelValueDef> | null;
}

export interface BskyLabelerServiceRecord {
  policies?: {
    labelValues?: Array<string>;
    labelValueDefinitions?: Array<LabelValueDef>;
  };
}

interface BskyProfileRecord {
  displayName?: string;
  description?: string;
  avatar?: unknown;
}

function trimmed(value: string | undefined): string | null {
  return value?.trim() || null;
}

/**
 * Label-value definitions from the labeler's declaration record.
 *
 * `labelValues` (bare identifiers) and `labelValueDefinitions` (full defs) are
 * independent fields, and a labeler may publish only the former. Synthesize a
 * minimal def for any value that has no definition so the identifier still
 * renders as a badge and stays togglable in the reader's per-label prefs.
 */
export function labelDefinitions(
  record: BskyLabelerServiceRecord,
): Array<LabelValueDef> | null {
  const defined = record.policies?.labelValueDefinitions ?? [];
  const values = record.policies?.labelValues ?? [];
  const defs = defined.filter((def) => typeof def?.identifier === "string");
  const known = new Set(defs.map((def) => def.identifier));
  for (const val of values) {
    if (typeof val === "string" && !known.has(val)) {
      defs.push({ identifier: val });
    }
  }
  return defs.length > 0 ? defs : null;
}

/**
 * Resolve a labeler DID to its network declaration, or `null` when the DID
 * advertises no label server (i.e. it is not a labeler at all).
 *
 * The profile record is best-effort: a labeler with no profile still resolves,
 * just without a display name or avatar.
 */
export async function resolveAtprotoLabeler(
  did: string,
): Promise<AtprotoLabelerDeclaration | null> {
  const serviceEndpoint = await resolveLabelerServiceEndpoint(did);
  if (!serviceEndpoint) return null;

  // The endpoint comes from a third-party DID document and is fetched by the
  // label sync worker, so it gets the same SSRF guard as a record-supplied one.
  try {
    assertSafeFetchUrl(serviceEndpoint);
  } catch {
    return null;
  }

  const { pds, handle } = await resolveIdentity(did);
  const [serviceRecord, profileRecord] = await Promise.all([
    fetchRepoRecordWithFallback(
      `at://${did}/${BSKY_LABELER_SERVICE}/self`,
      pds,
    ),
    fetchRepoRecordWithFallback(`at://${did}/${BSKY_ACTOR_PROFILE}/self`, pds),
  ]);

  const service = (serviceRecord?.value ?? {}) as BskyLabelerServiceRecord;
  const profile = (profileRecord?.value ?? {}) as BskyProfileRecord;
  const avatar = blobCid(profile.avatar as never);

  return {
    did,
    serviceEndpoint,
    handle: trimmed(handle ?? undefined)?.toLowerCase() ?? null,
    // Fall back to the handle: a labeler operator's profile often carries an
    // empty `displayName` (pub-search's is literally ""), and a directory card
    // reading "did:plc:aywbh…" helps nobody.
    displayName: trimmed(profile.displayName) ?? trimmed(handle ?? undefined),
    description: trimmed(profile.description),
    avatarUrl: avatar && pds ? getBlobUrl(pds, did, avatar) : null,
    labelValueDefinitions: labelDefinitions(service),
  };
}
