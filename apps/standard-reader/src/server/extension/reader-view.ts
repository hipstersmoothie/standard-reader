import type { ExtensionResolveResult } from "./types";

/**
 * The article route (`/a/$did/$rkey`) sends a reader who prefers links to open
 * on the original site straight to that site. The extension's "Open" is an
 * explicit "show me this in Standard Reader" from a reader who is already on
 * the original site, so for those readers resolve hands back an article URL
 * carrying `?view=reader` — the route's "I asked for the reading view" escape
 * hatch, which skips that bounce.
 *
 * Only for those readers: `view=reader` also skips the collection-magazine and
 * comic page-flip redirects, which everyone else should keep. (Both of those
 * are already off for readers who open links externally, so for them the
 * param changes nothing else.)
 *
 * Applies to the `article` result only. Publication pages never bounce, and a
 * body the reader can't render still goes to the site regardless — the
 * extension sends those to the publication page instead.
 */
export function withExplicitReaderView<T extends ExtensionResolveResult>(
  result: T,
  openLinksExternally: boolean,
): T {
  if (!openLinksExternally || result.kind !== "article") return result;
  return { ...result, readerUrl: addReaderViewParam(result.readerUrl) };
}

function addReaderViewParam(readerUrl: string): string {
  try {
    const url = new URL(readerUrl);
    url.searchParams.set("view", "reader");
    return url.toString();
  } catch {
    return readerUrl;
  }
}

/** Reads one cookie off a raw `Cookie` request header. */
export function readCookieFromRequest(
  request: Request,
  name: string,
): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const trimmed = pair.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    if (trimmed.slice(0, eqIdx) === name) {
      return decodeURIComponent(trimmed.slice(eqIdx + 1));
    }
  }
  return undefined;
}
