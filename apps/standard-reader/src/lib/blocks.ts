/**
 * Pure block logic, split out from `server/blocks/blocks.ts` so it
 * carries no database import and can be unit-tested directly.
 *
 * A block hides an **account**, not a document — so everything here works in
 * DIDs. A card is blocked when any account it renders is blocked: the author
 * (`did`), and for a publication-bound article the publication's owner, which
 * is the account whose name and avatar appear in the byline.
 */

/** How a block between the viewer and another account came about. */
export type BlockDirection =
  /** The viewer blocked them (`app.bsky.graph.block` in the viewer's repo). */
  | "blocking"
  /** They blocked the viewer (a block record in *their* repo). */
  | "blocked-by"
  /** They are on a moderation list the viewer blocks. */
  | "list-blocking"
  /** They block a moderation list the viewer is on (Bluesky's `blockedByList`). */
  | "list-blocked-by";

/** A resolved block between the viewer and one account. */
export interface BlockEdge {
  /** The other account. */
  did: string;
  direction: BlockDirection;
  /** The moderation list involved, for the list-sourced directions. */
  listUri: string | null;
}

/**
 * Which side of the block the viewer is on.
 *
 * The two are not interchangeable in the UI: a block the viewer *made* is
 * theirs to undo, while a block made against them is not, and offering an
 * "unblock" button for someone else's decision would be a lie.
 */
export function blockIsOutgoing(direction: BlockDirection): boolean {
  return direction === "blocking" || direction === "list-blocking";
}

/** Whether a block came from a moderation list rather than a direct record. */
export function blockIsFromList(direction: BlockDirection): boolean {
  return direction === "list-blocking" || direction === "list-blocked-by";
}

/**
 * Precedence when several block edges resolve for the same account: the
 * viewer's own direct block first (it is the one they can act on), then their
 * list block, then the two incoming forms.
 *
 * Without an order, "you blocked this account" and "this account blocks you"
 * would render at the mercy of row order, and a reader would see a Unblock
 * button that does nothing on some page loads and not others.
 */
const DIRECTION_RANK: Record<BlockDirection, number> = {
  blocking: 0,
  "list-blocking": 1,
  "blocked-by": 2,
  "list-blocked-by": 3,
};

/** Of two edges for the same account, the one the UI should explain. */
export function preferredBlockEdge(a: BlockEdge, b: BlockEdge): BlockEdge {
  return DIRECTION_RANK[a.direction] <= DIRECTION_RANK[b.direction] ? a : b;
}

/** Collapse raw edges to one per account, keeping the most actionable. */
export function mergeBlockEdges(
  edges: Array<BlockEdge>,
): Map<string, BlockEdge> {
  const byDid = new Map<string, BlockEdge>();
  for (const edge of edges) {
    const existing = byDid.get(edge.did);
    byDid.set(edge.did, existing ? preferredBlockEdge(existing, edge) : edge);
  }
  return byDid;
}

/** A card that renders one or more accounts, any of which may be blocked. */
export interface BlockableCard {
  /** Author DID (documents) or owner DID (publications, profiles). */
  did?: string | null;
  /**
   * Owner of the card's publication, when it differs from `did` — a document
   * written by a contributor into someone else's publication still puts that
   * publication's owner in the byline.
   */
  publicationOwnerDid?: string | null;
}

/** Every account DID a set of cards renders, deduped. */
export function blockSubjectDids(
  cards: ReadonlyArray<BlockableCard>,
): Array<string> {
  const dids = new Set<string>();
  for (const card of cards) {
    if (card.did) dids.add(card.did);
    if (card.publicationOwnerDid) dids.add(card.publicationOwnerDid);
  }
  return [...dids];
}

/** Whether a card renders any blocked account. */
export function isCardBlocked(
  card: BlockableCard,
  blocked: ReadonlySet<string>,
): boolean {
  if (blocked.size === 0) return false;
  if (card.did != null && blocked.has(card.did)) return true;
  return (
    card.publicationOwnerDid != null && blocked.has(card.publicationOwnerDid)
  );
}

/** Drop every card that renders a blocked account. */
export function rejectBlockedCards<T extends BlockableCard>(
  cards: Array<T>,
  blocked: ReadonlySet<string>,
): Array<T> {
  if (blocked.size === 0) return cards;
  return cards.filter((card) => !isCardBlocked(card, blocked));
}

/** The `at://did/…` authority of an AT-URI, or null if it isn't one. */
export function uriAuthorityDid(uri: string): string | null {
  if (!uri.startsWith("at://")) return null;
  const rest = uri.slice("at://".length);
  const slash = rest.indexOf("/");
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  return authority.startsWith("did:") ? authority : null;
}
