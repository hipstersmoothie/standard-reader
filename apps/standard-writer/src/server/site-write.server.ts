import { profiles, publications, sites } from "@standard-reader/db/schema";
import type { SiteConfig, SiteStyle } from "@standard-reader/site-config";
import {
  DEFAULT_SITE_CONFIG,
  normalizeSiteLinks,
  normalizeSiteTheme,
  siteConfigFromRow,
} from "@standard-reader/site-config";
/**
 * Server-only: saving a standalone site's configuration.
 *
 * The record is the source of truth and lives in the author's own repo
 * (`app.standard-reader.site`); this table is a mirror. So every save writes to
 * the PDS first and only then writes through to `sites` — if the repo write
 * fails there is nothing in the mirror claiming otherwise, and if the mirror
 * write fails the firehose puts it right on the next pass.
 *
 * The custom domain is the exception, and deliberately so: it is *our* routing
 * configuration, not a fact about the author's writing, so it lives only in the
 * mirror and never goes into their repo. Nobody else's client should have to
 * care which hostname we serve a page from.
 */
import { and, eq, ne } from "drizzle-orm";

import { getDb } from "../db/index.server";
import { getCurrentUserDid } from "../integrations/auth/session.server";
import { SITE_COLLECTION } from "../lexicons/site";
import { requirePro } from "./pro.server";

export { SITE_COLLECTION } from "../lexicons/site";

/** Record key for the author's own site. */
const AUTHOR_SITE_RKEY = "self";

/**
 * Record key for a publication's site: a truncated SHA-256 of its AT-URI, the
 * same derivation the reader uses. Deterministic so saving twice replaces one
 * record rather than accumulating them.
 */
async function publicationSiteRkey(publicationUri: string): Promise<string> {
  const bytes = new TextEncoder().encode(publicationUri);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export interface SaveSiteInput {
  publicationUri: string | null;
  style: SiteStyle;
  tagline: string | null;
  theme: {
    background: string | null;
    foreground: string | null;
    accent: string | null;
    accentForeground: string | null;
  } | null;
  links: Array<{ label: string; url: string }>;
  showStandardReaderLink: boolean;
  customDomain: string | null;
}

/**
 * A hostname, or null. Rejects anything with a scheme, a path, a port, or a
 * label that isn't a hostname label — a value here becomes routing
 * configuration, and a malformed one would be a domain nobody can ever claim.
 */
function normalizeDomain(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed) return null;
  if (
    !/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      trimmed,
    )
  ) {
    throw new Error(
      "That doesn't look like a domain. Use a hostname such as writing.example.com.",
    );
  }
  return trimmed;
}

/** Confirm the signed-in account owns the subject it is trying to configure. */
async function assertOwnership(
  did: string,
  publicationUri: string | null,
): Promise<void> {
  if (!publicationUri) return;
  if (!publicationUri.startsWith(`at://${did}/`)) {
    throw new Error("You can only customize your own publications.");
  }
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  const [row] = await db
    .select({ did: publications.did })
    .from(publications)
    .where(eq(publications.uri, publicationUri))
    .limit(1);
  if (!row || row.did !== did) {
    throw new Error("You can only customize your own publications.");
  }
}

export async function saveSiteConfig(
  request: Request,
  input: SaveSiteInput,
): Promise<{ ok: true }> {
  const did = await getCurrentUserDid(request);
  if (!did) throw new Error("Sign in to customize your site.");
  await assertOwnership(did, input.publicationUri);

  const domain = normalizeDomain(input.customDomain);
  // Checked before anything is written, so a non-Pro save fails whole rather
  // than landing a record and then refusing the domain half of it.
  if (domain) await requirePro(did, "A custom domain");

  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required.");

  if (domain) {
    const [taken] = await db
      .select({ uri: sites.uri })
      .from(sites)
      .where(
        and(
          eq(sites.customDomain, domain),
          input.publicationUri
            ? ne(sites.publicationUri, input.publicationUri)
            : ne(sites.ownerDid, did),
        ),
      )
      .limit(1);
    if (taken) {
      throw new Error("That domain is already pointed at another site.");
    }
  }

  const theme = normalizeSiteTheme(input.theme);
  const links = normalizeSiteLinks(input.links);
  const tagline = input.tagline?.trim() || null;
  const updatedAt = new Date().toISOString();
  const rkey = input.publicationUri
    ? await publicationSiteRkey(input.publicationUri)
    : AUTHOR_SITE_RKEY;

  const record: Record<string, unknown> = {
    $type: SITE_COLLECTION,
    style: input.style,
    links,
    showStandardReaderLink: input.showStandardReaderLink,
    createdAt: updatedAt,
    updatedAt,
  };
  if (input.publicationUri) record.publication = input.publicationUri;
  if (tagline) record.tagline = tagline;
  // Omit rather than write nulls: an absent theme is what means "inherit", and
  // a record full of empty slots would not say that.
  if (theme) {
    record.theme = Object.fromEntries(
      Object.entries(theme).filter(([, value]) => typeof value === "string"),
    );
  }

  const { restoreAuthorSession } =
    await import("../integrations/auth/happyview-oauth.server");
  const session = await restoreAuthorSession(did);
  if (!session) {
    throw new Error("Your sign-in expired. Sign in again to save your site.");
  }

  const response = await session.handle("/xrpc/com.atproto.repo.putRecord", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: did,
      collection: SITE_COLLECTION,
      rkey,
      record,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Couldn't save the site to your repo (${response.status}). ${detail}`.trim(),
    );
  }
  const written = (await response.json().catch(() => ({}))) as {
    uri?: string;
    cid?: string;
  };
  const uri = written.uri ?? `at://${did}/${SITE_COLLECTION}/${rkey}`;

  // Write through to the mirror so the site repaints on the next read instead
  // of when the firehose comes back around.
  const values = {
    uri,
    cid: written.cid ?? null,
    ownerDid: did,
    rkey,
    publicationUri: input.publicationUri,
    style: input.style,
    tagline,
    themeBackground: theme?.background ?? null,
    themeForeground: theme?.foreground ?? null,
    themeAccent: theme?.accent ?? null,
    themeAccentForeground: theme?.accentForeground ?? null,
    links,
    showStandardReaderLink: input.showStandardReaderLink,
    customDomain: domain,
    updatedAt: new Date(updatedAt),
    deleted: false,
  };
  await db
    .insert(sites)
    .values(values)
    .onConflictDoUpdate({ target: sites.uri, set: values });

  return { ok: true };
}

/** Remove a site's configuration, returning it to the default presentation. */
export async function resetSiteConfig(
  request: Request,
  publicationUri: string | null,
): Promise<{ ok: true }> {
  const did = await getCurrentUserDid(request);
  if (!did) throw new Error("Sign in to reset your site.");
  await assertOwnership(did, publicationUri);

  const rkey = publicationUri
    ? await publicationSiteRkey(publicationUri)
    : AUTHOR_SITE_RKEY;

  const { restoreAuthorSession } =
    await import("../integrations/auth/happyview-oauth.server");
  const session = await restoreAuthorSession(did);
  if (session) {
    const response = await session.handle(
      "/xrpc/com.atproto.repo.deleteRecord",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: did, collection: SITE_COLLECTION, rkey }),
      },
    );
    // A record that was already gone is the state we wanted; anything else is
    // a real failure and should not leave the mirror disagreeing with the repo.
    if (!response.ok && response.status !== 400) {
      throw new Error(`Couldn't reset the site (${response.status}).`);
    }
  }

  const db = getDb();
  if (db) {
    await db
      .delete(sites)
      .where(eq(sites.uri, `at://${did}/${SITE_COLLECTION}/${rkey}`));
  }
  return { ok: true };
}

/** One site the signed-in account can customize. */
export interface OwnedSite {
  publicationUri: string | null;
  rkey: string | null;
  name: string;
  iconUrl: string | null;
  config: SiteConfig;
  customDomain: string | null;
  customDomainVerified: boolean;
}

export interface OwnedSites {
  did: string;
  pro: boolean;
  sites: Array<OwnedSite>;
}

/** Every site this account owns: their own, plus one per publication. */
export async function loadOwnedSites(
  request: Request,
): Promise<OwnedSites | null> {
  const did = await getCurrentUserDid(request);
  if (!did) return null;
  const db = getDb();
  if (!db) return null;

  const { isPro } = await import("./pro.server");
  const [rows, pubs, [profile], pro] = await Promise.all([
    db
      .select()
      .from(sites)
      .where(and(eq(sites.ownerDid, did), eq(sites.deleted, false))),
    db
      .select({
        uri: publications.uri,
        rkey: publications.rkey,
        name: publications.name,
        iconCid: publications.iconCid,
      })
      .from(publications)
      .where(and(eq(publications.did, did), eq(publications.deleted, false))),
    db
      .select({
        handle: profiles.handle,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(profiles)
      .where(eq(profiles.did, did))
      .limit(1),
    isPro(did),
  ]);

  const byPublication = new Map(
    rows.map((row) => [row.publicationUri ?? "", row]),
  );
  const toOwned = (
    key: string,
    base: Omit<OwnedSite, "config" | "customDomain" | "customDomainVerified">,
  ): OwnedSite => {
    const row = byPublication.get(key);
    return {
      ...base,
      config: row ? siteConfigFromRow(row) : DEFAULT_SITE_CONFIG,
      customDomain: row?.customDomain ?? null,
      customDomainVerified: row?.customDomainVerifiedAt != null,
    };
  };

  return {
    did,
    pro,
    sites: [
      toOwned("", {
        publicationUri: null,
        rkey: null,
        name: profile?.displayName?.trim() || profile?.handle || did,
        iconUrl: profile?.avatarUrl ?? null,
      }),
      ...pubs.map((pub) =>
        toOwned(pub.uri, {
          publicationUri: pub.uri,
          rkey: pub.rkey,
          name: pub.name,
          iconUrl: pub.iconCid
            ? `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${pub.iconCid}@jpeg`
            : (profile?.avatarUrl ?? null),
        }),
      ),
    ],
  };
}

/**
 * The site a custom domain points at, if any. The hook the eventual
 * domain-routing middleware calls: a request arriving on `atlas.example.com`
 * resolves to a subject here and then renders exactly as the path route does.
 */
export async function resolveCustomDomain(
  hostname: string,
): Promise<{ did: string; rkey: string | null } | null> {
  const db = getDb();
  if (!db) return null;
  const domain = hostname.trim().toLowerCase();
  const [row] = await db
    .select({
      ownerDid: sites.ownerDid,
      publicationUri: sites.publicationUri,
      verifiedAt: sites.customDomainVerifiedAt,
    })
    .from(sites)
    .where(and(eq(sites.customDomain, domain), eq(sites.deleted, false)))
    .limit(1);
  // An unverified domain routes nowhere: anyone can *type* a hostname into the
  // editor, and serving a page for one before its DNS is confirmed would let
  // them claim a name they do not control.
  if (!row || row.verifiedAt == null) return null;
  return {
    did: row.ownerDid,
    rkey: row.publicationUri?.split("/").pop() ?? null,
  };
}
