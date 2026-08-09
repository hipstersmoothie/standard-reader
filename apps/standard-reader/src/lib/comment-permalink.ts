/**
 * Where a Discussion card opens.
 *
 * Every comment we render is a real AT Protocol record, so every card should be
 * a link to that comment — the way Bluesky comments have always linked to the
 * post on bsky.app. Most sources can build a permalink on their own platform
 * (`postUrl`), but some can't for some records: Leaflet has no per-comment URL
 * and needs the document's own URL to open its comment drawer, so a Leaflet
 * document we only know by AT-URI leaves `postUrl` empty. Cards in that state
 * used to render unlinked, which is the one case this module removes.
 *
 * The fallback is PDSLS, the ecosystem's record viewer: not the authoring
 * platform, but it does show the reader the actual comment. `native` says which
 * of the two a caller got, so the link's accessible name can be honest about
 * where it goes.
 */

import { buildPdslsRecordUrl } from "#/lib/quote-share";

export interface CommentLink {
  href: string;
  /** True for a permalink on the comment's own platform. */
  native: boolean;
}

export function commentLink(comment: {
  postUri: string;
  postUrl: string;
}): CommentLink {
  const platformUrl = comment.postUrl.trim();
  if (platformUrl) return { href: platformUrl, native: true };
  return { href: buildPdslsRecordUrl(comment.postUri), native: false };
}
