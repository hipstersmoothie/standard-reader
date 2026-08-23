/**
 * Where Standard Writer lives.
 *
 * The reader links out to it in exactly one place: the Settings row that opens a
 * writer's own publications — analytics, sites, embeds, the newsletter. It is an
 * ordinary URL to a different deploy, not a router link.
 *
 * Nothing on a *publication* page points here. A publication's ⌄ menu is read by
 * everyone, and a site is the publisher's own page — offering to open somebody
 * else's site management from the menu a reader uses to subscribe was the wrong
 * audience for the wrong feature.
 *
 * `VITE_WRITER_URL` is client-exposed on purpose: the link renders in the
 * browser. A missing value falls back to the production host rather than
 * breaking the link, since a reader dev server pointing at the real Writer is
 * the sane default when you have not run one locally.
 */
const FALLBACK = "https://writer.standard-reader.app";

function writerUrl(): string {
  const configured = import.meta.env.VITE_WRITER_URL;
  return (
    typeof configured === "string" && configured.trim()
      ? configured.trim()
      : FALLBACK
  ).replace(/\/$/, "");
}

/** Standard Writer's "your sites" list. */
export function writerSitesUrl(): string {
  return `${writerUrl()}/sites`;
}
