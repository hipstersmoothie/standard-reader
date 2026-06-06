/** Formatting helpers shared by the reader UI (kept apart from components). */

import { STANDARD_NSID } from "#/lib/atproto/nsids";

/**
 * Route params (`{ did, rkey }`) for the on-site `/p/$did/$rkey` publication
 * profile, parsed from a publication AT-URI (`at://did/<collection>/rkey`).
 * Returns null for anything that isn't a well-formed record URI so callers can
 * fall back to the publication's external `url`.
 */
export function publicationLinkParams(
  uri: string,
): { did: string; rkey: string } | null {
  if (typeof uri !== "string" || !uri.startsWith("at://")) return null;
  const rest = uri.slice("at://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const did = rest.slice(0, slash);
  const after = rest.slice(slash + 1);
  const nextSlash = after.indexOf("/");
  if (nextSlash === -1) return null;
  const rkey = after.slice(nextSlash + 1);
  if (!did.startsWith("did:") || rkey.length === 0) return null;
  return { did, rkey };
}

/** Rebuild a publication AT-URI from its `/p/$did/$rkey` route params. */
export function publicationUriFromParams(did: string, rkey: string): string {
  return `at://${did}/${STANDARD_NSID.publication}/${rkey}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export function formatReaders(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return DATE_FMT.format(new Date(t));
}
