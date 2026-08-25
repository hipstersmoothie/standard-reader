/**
 * Pure mute logic, split out from `server/mutes/mutes.ts` so it carries no
 * database import and can be unit-tested directly (mirrors `lib/blocks.ts`).
 *
 * A mute subject is either a **user** (a DID — hides everything they touch:
 * documents they authored, documents from publications they own, their
 * recommends) or a **publication** (the AT-URI of its
 * `site.standard.publication` record — hides that publication's documents and
 * the publication itself from discovery). Unlike blocks, mutes are strictly
 * one-directional and only affect feeds + discovery, never direct navigation.
 */

import { STANDARD_NSID } from "#/lib/atproto/nsids";

/** A mute record subject, classified. */
export type MuteSubject =
  | { kind: "user"; did: string }
  | { kind: "publication"; uri: string };

/**
 * Classify a raw mute-record `subject` into a user or publication mute.
 * Returns null for anything else (malformed strings, at-uris of other
 * collections), which callers skip rather than guess at.
 */
export function classifyMuteSubject(subject: unknown): MuteSubject | null {
  if (typeof subject !== "string" || subject.length === 0) return null;
  if (subject.startsWith("did:")) {
    return { kind: "user", did: subject };
  }
  if (!subject.startsWith("at://")) return null;
  const [authority, collection, rkey, ...rest] = subject
    .slice("at://".length)
    .split("/");
  if (
    !authority?.startsWith("did:") ||
    collection !== STANDARD_NSID.publication ||
    !rkey ||
    rest.length > 0
  ) {
    return null;
  }
  return { kind: "publication", uri: subject };
}

/**
 * A card that may be hidden by a mute. Extends the blockable shape with the
 * publication facts mutes match on: the card's publication URI (documents) or
 * its own URI (publication cards, where the card *is* the mute subject).
 */
export interface MutableCard {
  /** Author DID (documents) or owner DID (publications, profiles). */
  did?: string | null;
  /** Owner of the card's publication, when it differs from `did`. */
  publicationOwnerDid?: string | null;
  /** AT-URI of the publication a document card belongs to. */
  publicationUri?: string | null;
  /** The card's own AT-URI — matched for publication cards. */
  uri?: string | null;
}

/** The muted subjects resolved for a viewer, split by kind. */
export interface MutedSubjects {
  dids: ReadonlySet<string>;
  uris: ReadonlySet<string>;
}

/** Every candidate mute subject a set of cards renders, deduped. */
export function muteCandidateKeys(cards: ReadonlyArray<MutableCard>): {
  dids: Array<string>;
  uris: Array<string>;
} {
  const dids = new Set<string>();
  const uris = new Set<string>();
  for (const card of cards) {
    if (card.did) dids.add(card.did);
    if (card.publicationOwnerDid) dids.add(card.publicationOwnerDid);
    if (card.publicationUri) uris.add(card.publicationUri);
    if (card.uri) uris.add(card.uri);
  }
  return { dids: [...dids], uris: [...uris] };
}

/** Whether a card renders any muted user or publication. */
export function isCardMuted(card: MutableCard, muted: MutedSubjects): boolean {
  if (muted.dids.size > 0) {
    if (card.did != null && muted.dids.has(card.did)) return true;
    if (
      card.publicationOwnerDid != null &&
      muted.dids.has(card.publicationOwnerDid)
    ) {
      return true;
    }
  }
  if (muted.uris.size > 0) {
    if (card.publicationUri != null && muted.uris.has(card.publicationUri)) {
      return true;
    }
    if (card.uri != null && muted.uris.has(card.uri)) return true;
  }
  return false;
}

/** Drop every card that renders a muted user or publication. */
export function rejectMutedCards<T extends MutableCard>(
  cards: Array<T>,
  muted: MutedSubjects,
): Array<T> {
  if (muted.dids.size === 0 && muted.uris.size === 0) return cards;
  return cards.filter((card) => !isCardMuted(card, muted));
}
