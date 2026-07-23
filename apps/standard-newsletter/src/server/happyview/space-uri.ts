/**
 * Build/parse permissioned-space AT-URIs (HappyView / Proposal 0016). Pure.
 *
 *   space:        at://<space-did>/space/<type-nsid>/<skey>
 *   space record: at://<space-did>/space/<type-nsid>/<skey>/<author-did>/<collection>/<rkey>
 *
 * (The literal `space` path segment + `at://` scheme are HappyView v2.11+.)
 */

export interface SpaceRef {
  did: string;
  type: string;
  skey: string;
}

export interface SpaceRecordRef extends SpaceRef {
  author: string;
  collection: string;
  rkey: string;
}

/** Build a space URI from its (did, type, skey) triple. */
export function spaceUri(ref: SpaceRef): string {
  return `at://${ref.did}/space/${ref.type}/${ref.skey}`;
}

/** Build a space-record URI. */
export function spaceRecordUri(ref: SpaceRecordRef): string {
  return `${spaceUri(ref)}/${ref.author}/${ref.collection}/${ref.rkey}`;
}

/** Parse a space or space-record URI; null if it isn't one. */
export function parseSpaceUri(uri: string): SpaceRef | SpaceRecordRef | null {
  const match = /^at:\/\/([^/]+)\/space\/(.+)$/.exec(uri);
  if (!match) return null;
  const did = match[1];
  const rest = match[2].split("/");
  // type, skey  (+ optional author, collection, rkey)
  if (rest.length !== 2 && rest.length !== 5) return null;
  const [type, skey, author, collection, rkey] = rest;
  if (!type || !skey) return null;
  if (rest.length === 2) return { did, type, skey };
  return { did, type, skey, author, collection, rkey };
}

/** True when the parsed ref includes the record tail. */
export function isSpaceRecordRef(
  ref: SpaceRef | SpaceRecordRef,
): ref is SpaceRecordRef {
  return "rkey" in ref;
}
