/**
 * Where Standard Writer lives.
 *
 * The reader links out to it in two places — the "Standalone site" item on a
 * publication, and the Settings row that opens the site editor — because both
 * of those pages moved to Writer when it became the writer's home. Neither is a
 * router link any more; they are ordinary URLs to a different deploy.
 *
 * `VITE_WRITER_URL` is client-exposed on purpose: the links render in the
 * browser. A missing value falls back to the production host rather than
 * breaking the link, since a reader dev server pointing at the real Writer is
 * the sane default when you have not run one locally.
 */
import {
  authorSitePath,
  publicationSitePath,
} from "@standard-reader/site-config";

const FALLBACK = "https://writer.standard-reader.app";

export function writerUrl(): string {
  const configured = import.meta.env.VITE_WRITER_URL;
  return (
    typeof configured === "string" && configured.trim()
      ? configured.trim()
      : FALLBACK
  ).replace(/\/$/, "");
}

/** The writer's editor for one publication's standalone site. */
export function writerPublicationSiteUrl(rkey: string): string {
  return `${writerUrl()}/p/${encodeURIComponent(rkey)}/site`;
}

/** The writer's "your sites" list. */
export function writerSitesUrl(): string {
  return `${writerUrl()}/sites`;
}

/** A publication's public standalone site, served by Writer. */
export function publicationSiteUrl(did: string, rkey: string): string {
  return `${writerUrl()}${publicationSitePath(did, rkey)}`;
}

/** An author's public standalone site, served by Writer. */
export function authorSiteUrl(did: string): string {
  return `${writerUrl()}${authorSitePath(did)}`;
}
