import { and, eq, isNull } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import type { SiteConfig } from "#/lib/site/config";
import { DEFAULT_SITE_CONFIG, siteConfigFromRow } from "#/lib/site/config";

/**
 * The `app.standard-reader.site` record for one subject, read from the mirror.
 *
 * A missing row is a normal answer, not a miss: a site renders in the default
 * style whether or not its owner has configured one, so there is nothing to
 * backfill from the PDS on the public read path — and doing so would fold a
 * whole repo for every visitor to an unconfigured site. The write path writes
 * through to this table, so an owner's own edits are visible immediately;
 * `loadSiteConfigForOwner` covers the one case where the mirror can genuinely
 * be behind the repo.
 */
export async function loadSiteConfig(
  db: Db,
  schema: Schema,
  ownerDid: string,
  publicationUri: string | null,
): Promise<SiteConfig> {
  const s = schema.sites;
  const [row] = await db
    .select()
    .from(s)
    .where(
      and(
        eq(s.ownerDid, ownerDid),
        eq(s.deleted, false),
        publicationUri
          ? eq(s.publicationUri, publicationUri)
          : isNull(s.publicationUri),
      ),
    )
    .limit(1);

  return row ? siteConfigFromRow(row) : DEFAULT_SITE_CONFIG;
}

/**
 * Every site one owner has configured — their own, plus one row per publication
 * they have themed. Drives the settings page, which lists a card per site.
 */
export async function loadOwnerSiteConfigs(
  db: Db,
  schema: Schema,
  ownerDid: string,
): Promise<Map<string, SiteConfig>> {
  const s = schema.sites;
  const rows = await db
    .select()
    .from(s)
    .where(and(eq(s.ownerDid, ownerDid), eq(s.deleted, false)));

  // Keyed by publication AT-URI, with the author's own site under the empty
  // string — one lookup shape for both kinds, so the settings page can ask for
  // a publication's config without branching on whether it exists.
  return new Map(
    rows.map((row) => [row.publicationUri ?? "", siteConfigFromRow(row)]),
  );
}
