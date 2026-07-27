import { documentUriFromParams } from "../components/reader/format";

/**
 * A pinned article in a magazine edition: the author's DID plus the record key.
 * Together with the constant document NSID these resolve to a full at-uri, so an
 * edition's contents stay fixed even as the underlying list gains new articles.
 */
export interface PinnedArticle {
  did: string;
  rkey: string;
}

// `did~rkey` pairs, comma-joined. Neither DIDs nor TID record keys contain `~`
// or `,`, so the param round-trips without escaping beyond normal URL encoding.
const ENTRY_SEP = ",";
const PAIR_SEP = "~";

function rkeyFromUri(uri: string): string {
  const parts = uri.split("/");
  return parts.at(-1) ?? "";
}

/** Serialize articles into a stable `ids` search param (`did~rkey,did~rkey`). */
export function encodeIssueIds(
  articles: Array<{ did: string; uri: string }>,
): string {
  return articles
    .map((a) => `${a.did}${PAIR_SEP}${rkeyFromUri(a.uri)}`)
    .join(ENTRY_SEP);
}

/** Parse the `ids` search param back into pinned articles, dropping malformed entries. */
export function parseIssueIds(param: string): Array<PinnedArticle> {
  return param
    .split(ENTRY_SEP)
    .map((entry): PinnedArticle | null => {
      const sep = entry.indexOf(PAIR_SEP);
      if (sep === -1) return null;
      const did = entry.slice(0, sep);
      const rkey = entry.slice(sep + 1);
      if (!did || !rkey) return null;
      return { did, rkey };
    })
    .filter((p): p is PinnedArticle => p != null);
}

/** Full document at-uri for a pinned article. */
export function pinnedArticleUri(p: PinnedArticle): string {
  return documentUriFromParams(p.did, p.rkey);
}
