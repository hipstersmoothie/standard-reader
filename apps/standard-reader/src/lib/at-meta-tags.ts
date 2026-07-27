/**
 * `at:` meta tags — the community convention for declaring which AT Protocol
 * records a web page is built out of.
 *
 * Proposed on the Atmosphere forum ("Mapping web pages to canonical AT
 * records") and shipped across the network through mid-2026 — Leaflet,
 * Frontpage, Semble, aturi.to, µ, SkyPress. It covers ground the older
 * `<link rel="site.standard.document">` discovery hints can't: `rel` says
 * *which* record, never *why* it's on the page. It does not replace them —
 * the rels are part of the site.standard spec and plenty of clients read only
 * those, so our record pages emit both. Four names:
 *
 * - `at:canonical` — the records the page is made of. If they went away, the
 *   page would have no reason to exist.
 * - `at:alternate` — records the page merely shows.
 * - `at:author` — the identity that wrote the content.
 * - `at:me` — the identity the page *belongs to*.
 *
 * Standard Reader emits the first three. It deliberately does **not** emit
 * `at:me`: that tag is `rel="me"` for the Atmosphere — an assertion that the
 * page is that identity's own — and every record we render belongs to someone
 * else. A publishing platform serving an author's own site (SkyPress, Leaflet)
 * is the right place for `at:me`; a reader rendering a third party's document
 * is not.
 *
 * All names repeat: a page with two alternates emits two `at:alternate` tags.
 * That matters for how these are rendered — see `AtRecordMeta`.
 *
 * @see https://skypress.blog/@skypress.blog/its-always-sunny-on-skypress/3mrnculcx5c2v
 * @see https://discourse.atmosphere.community/t/mapping-web-pages-to-canonical-at-records/904
 */

export const AT_META_NAME = {
  canonical: "at:canonical",
  alternate: "at:alternate",
  author: "at:author",
} as const;

export type AtMetaName = (typeof AT_META_NAME)[keyof typeof AT_META_NAME];

/**
 * The records behind one page. Every field takes nullable entries so callers can
 * hand over optional loader data (`article.bskyPostUri`) without filtering
 * first. Values may be `at://` URIs or bare DIDs — bare DIDs are normalized to
 * `at://<did>`, the form the convention uses for identities.
 */
export type AtMetaRecords = {
  canonical?: Array<string | null | undefined>;
  alternate?: Array<string | null | undefined>;
  author?: Array<string | null | undefined>;
};

export type AtMetaTag = { name: AtMetaName; content: string };

function normalizeAtUri(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("at://")) {
    return trimmed.length > "at://".length ? trimmed : null;
  }
  // Identities are commonly carried as a bare DID; the tag wants an AT-URI.
  if (trimmed.startsWith("did:")) return `at://${trimmed}`;
  return null;
}

/**
 * Build the `at:` meta tags for a page.
 *
 * Emitted in convention order (canonical, alternate, author). A URI already
 * claimed as canonical is not repeated as an alternate, and exact duplicates are
 * dropped, so callers can pass overlapping lists without curating them.
 */
export function atMetaTags(records: AtMetaRecords): Array<AtMetaTag> {
  const tags: Array<AtMetaTag> = [];
  const seen = new Set<string>();
  const claimed = new Set<string>();

  const push = (
    name: AtMetaName,
    values: AtMetaRecords[keyof AtMetaRecords],
  ) => {
    for (const value of values ?? []) {
      const content = normalizeAtUri(value);
      if (!content) continue;
      // An alternate is "a record the page merely shows" — a canonical record
      // is more than that, so it never doubles as one.
      if (name === AT_META_NAME.alternate && claimed.has(content)) continue;
      const key = `${name} ${content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (name === AT_META_NAME.canonical) claimed.add(content);
      tags.push({ name, content });
    }
  };

  push(AT_META_NAME.canonical, records.canonical);
  push(AT_META_NAME.alternate, records.alternate);
  push(AT_META_NAME.author, records.author);

  return tags;
}

/**
 * Loader data shape a route uses to declare the records its page is built from.
 * Return `atMeta` from a route loader and `AtRecordMeta` renders the tags.
 */
export type WithAtMeta = { atMeta: AtMetaRecords };

/**
 * The records for a page, taken from the deepest matched route that declares
 * any — an article's own records win over the layout's.
 */
export function atMetaFromMatches(
  matches: ReadonlyArray<{ loaderData?: unknown }>,
): AtMetaRecords | null {
  for (let i = matches.length - 1; i >= 0; i--) {
    const loaderData = matches[i]?.loaderData;
    if (typeof loaderData !== "object" || loaderData === null) continue;
    if (!("atMeta" in loaderData)) continue;
    const atMeta = (loaderData as { atMeta: unknown }).atMeta;
    if (typeof atMeta === "object" && atMeta !== null) {
      return atMeta as AtMetaRecords;
    }
  }
  return null;
}
