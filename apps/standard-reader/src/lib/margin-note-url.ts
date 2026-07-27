import { parseAtUri } from "#/server/atproto/uri";

const MARGIN_WEB_ORIGIN = "https://margin.at";

/** Public margin.at page for a note record (`/at/{did}/{collection}/{rkey}`). */
export function marginNoteUrl(atUri: string): string | null {
  const parsed = parseAtUri(atUri);
  if (!parsed) return null;

  const segments = [
    MARGIN_WEB_ORIGIN,
    "at",
    encodeURIComponent(parsed.did),
    encodeURIComponent(parsed.collection),
    encodeURIComponent(parsed.rkey),
  ];
  return segments.join("/");
}
