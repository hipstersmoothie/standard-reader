/**
 * Where a post on a standalone site goes.
 *
 * Standard Writer serves the site; Standard Reader renders the article. So a
 * headline is an ordinary cross-deploy link, not a router navigation — and the
 * reader's origin has to be configured, because guessing it wrong would send
 * every visitor to a 404.
 *
 * `VITE_READER_URL` is client-exposed on purpose: these links render in the
 * browser. A missing value falls back to the production host rather than
 * breaking every headline on the page.
 */
const FALLBACK = "https://standard-reader.app";

/**
 * Encode a path segment but leave `:` alone, so a DID survives being copied,
 * pasted, and re-encoded — the same rule the shared site paths follow.
 */
function segment(value: string): string {
  return encodeURIComponent(value).replaceAll("%3A", ":");
}

export function readerUrl(): string {
  const configured = import.meta.env.VITE_READER_URL;
  return (
    typeof configured === "string" && configured.trim()
      ? configured.trim()
      : FALLBACK
  ).replace(/\/$/, "");
}

/** The reader's page for one post. */
export function articleUrl(did: string, rkey: string): string {
  return `${readerUrl()}/a/${segment(did)}/${segment(rkey)}`;
}

/** The reader's page for one publication. */
export function publicationUrl(did: string, rkey: string): string {
  return `${readerUrl()}/p/${segment(did)}/${segment(rkey)}`;
}

/** The reader's profile page for one account. */
export function profileUrl(did: string): string {
  return `${readerUrl()}/u/${segment(did)}`;
}
