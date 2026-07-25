/**
 * Resolves a publication's canvas background image to a CDN URL.
 *
 * The record stores a blob ref; turning it into a URL needs the publication's
 * DID, which only the server has to hand — so the client-safe adapter stops at
 * the CID and this fills in the rest.
 */
import { resolvePublicationTheme } from "#/lib/publication-theme-source";
import { cdnImageUrl } from "#/server/atproto/blob";

export interface PublicationBackgroundImageUrl {
  url: string;
  repeat: boolean;
  width: number | null;
}

export function publicationBackgroundImage(
  themeJson: unknown,
  did: string | null,
): PublicationBackgroundImageUrl | null {
  if (!did) return null;
  const json =
    themeJson && typeof themeJson === "object"
      ? (themeJson as Record<string, unknown>)
      : null;
  if (!json) return null;
  const image = resolvePublicationTheme(json, json.nativeTheme).light
    .backgroundImage;
  if (!image) return null;
  return {
    url: cdnImageUrl(did, image.cid),
    repeat: image.repeat,
    width: image.width,
  };
}
