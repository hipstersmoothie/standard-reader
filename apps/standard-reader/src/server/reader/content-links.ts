import { and, eq, inArray, or } from "drizzle-orm";

import {
  documentUriFromParams,
  publicationUriFromParams,
} from "#/components/reader/format";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import { publicationDisplayName } from "#/integrations/tanstack-query/api-shapes";
import { isAppOriginHref } from "#/lib/app-origin";
import { parseInternalRoute } from "#/lib/internal-route";
import { actorLinkIdent } from "#/lib/leaflet/publication-mentions";
import { linkTargetVariants } from "#/lib/link-target-variants";
import { getPublicUrl } from "#/lib/public-url";
import { cdnImageUrl } from "#/server/atproto/blob";

/**
 * What an in-content link resolves to on our platform. Returned per href so any
 * content renderer can upgrade a bare link to a mention chip + hovercard,
 * regardless of content type (Leaflet, markdown, HTML, …). `null`/absent means
 * "leave it a plain link".
 */
export type ContentLinkTarget =
  | {
      kind: "user";
      /** Handle or DID — whatever the link carried; both route + resolve. */
      ident: string;
      handle: string | null;
      avatarUrl: string | null;
    }
  | {
      kind: "publication";
      publicationUri: string;
      did: string;
      rkey: string;
      name: string;
      iconUrl: string | null;
    }
  | {
      kind: "article";
      documentUri: string;
      did: string;
      rkey: string;
      title: string;
      /** Owning publication's icon (owner avatar fallback), shown beside the title. */
      publicationIconUrl: string | null;
    };

export type ContentLinkTargets = Record<string, ContentLinkTarget>;

/**
 * Classify a batch of in-content link hrefs against our read model, so bare
 * links to users / publications / articles (whether in-app paths, `at://`
 * URIs, or off-site canonical URLs) render as chips + hovercards. Content-type
 * agnostic: callers pass the hrefs their renderer produced, however it produced
 * them. Documents win over publications for the same href (an article URL is
 * more specific than a homepage).
 */
export async function resolveContentLinkTargets(
  db: Db,
  schema: Schema,
  hrefs: Array<string>,
): Promise<ContentLinkTargets> {
  const out: ContentLinkTargets = {};
  const appOrigin = getPublicUrl();

  // Direct in-app / `at://` references, keyed by resolved URI → href.
  const docUriToHref = new Map<string, string>();
  const pubUriToHref = new Map<string, string>();
  // Off-site links, keyed by each canonical variant → href.
  const variantToHref = new Map<string, string>();
  // User links resolve synchronously from the URL; group idents for a batch.
  const userIdentToHrefs = new Map<string, Array<string>>();

  for (const raw of hrefs) {
    const href = raw.trim();
    if (!href) continue;

    const ident = actorLinkIdent(href);
    if (ident) {
      const list = userIdentToHrefs.get(ident) ?? [];
      list.push(href);
      userIdentToHrefs.set(ident, list);
      continue;
    }

    const internal = parseInternalRoute(href, appOrigin);
    if (internal?.to === "/a/$did/$rkey" && internal.params) {
      docUriToHref.set(
        documentUriFromParams(internal.params.did, internal.params.rkey),
        href,
      );
      continue;
    }
    if (internal?.to === "/p/$did/$rkey" && internal.params) {
      pubUriToHref.set(
        publicationUriFromParams(internal.params.did, internal.params.rkey),
        href,
      );
      continue;
    }

    if (/^https?:\/\//i.test(href)) {
      // A link to our own app is either an internal route (already handled
      // above) or app navigation — never a third-party publication/document.
      // Skip the off-site `url`/`canonical_url` match so a record that happens
      // to carry our domain doesn't get surfaced for it.
      if (isAppOriginHref(href, appOrigin)) continue;
      for (const variant of linkTargetVariants(href)) {
        if (!variantToHref.has(variant)) variantToHref.set(variant, href);
      }
    }
  }

  const variants = [...variantToHref.keys()];
  const docUris = [...docUriToHref.keys()];
  const pubUris = [...pubUriToHref.keys()];
  const idents = [...userIdentToHrefs.keys()];
  const identDids = idents.filter((i) => i.startsWith("did:"));
  const identHandles = idents.filter((i) => !i.startsWith("did:"));

  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;

  const [docRows, pubRows, profileRows] = await Promise.all([
    docUris.length > 0 || variants.length > 0
      ? db
          .select({
            uri: d.uri,
            did: d.did,
            rkey: d.rkey,
            title: d.title,
            canonicalUrl: d.canonicalUrl,
            pubDid: p.did,
            pubIconCid: p.iconCid,
            ownerAvatarUrl: pr.avatarUrl,
          })
          .from(d)
          .leftJoin(p, eq(p.uri, d.publicationUri))
          .leftJoin(pr, eq(pr.did, p.did))
          .where(
            and(
              eq(d.deleted, false),
              or(
                docUris.length > 0 ? inArray(d.uri, docUris) : undefined,
                variants.length > 0
                  ? inArray(d.canonicalUrl, variants)
                  : undefined,
              ),
            ),
          )
      : Promise.resolve([]),
    pubUris.length > 0 || variants.length > 0
      ? db
          .select({
            uri: p.uri,
            did: p.did,
            rkey: p.rkey,
            name: p.name,
            url: p.url,
            iconCid: p.iconCid,
          })
          .from(p)
          .where(
            and(
              eq(p.deleted, false),
              or(
                pubUris.length > 0 ? inArray(p.uri, pubUris) : undefined,
                variants.length > 0 ? inArray(p.url, variants) : undefined,
              ),
            ),
          )
      : Promise.resolve([]),
    identDids.length > 0 || identHandles.length > 0
      ? db
          .select({ did: pr.did, handle: pr.handle, avatarUrl: pr.avatarUrl })
          .from(pr)
          .where(
            or(
              identDids.length > 0 ? inArray(pr.did, identDids) : undefined,
              identHandles.length > 0
                ? inArray(pr.handle, identHandles)
                : undefined,
            ),
          )
      : Promise.resolve([]),
  ]);

  // Users: a matched profile fills in handle + avatar. Unmatched idents still
  // get a target (so the chip renders) with a null avatar.
  const profileByKey = new Map<
    string,
    { did: string; handle: string | null; avatarUrl: string | null }
  >();
  for (const row of profileRows) {
    profileByKey.set(row.did, row);
    if (row.handle) profileByKey.set(row.handle, row);
  }
  for (const [ident, hrefsForIdent] of userIdentToHrefs) {
    const profile = profileByKey.get(ident) ?? null;
    for (const href of hrefsForIdent) {
      out[href] = {
        kind: "user",
        ident,
        handle: profile?.handle ?? (ident.startsWith("did:") ? null : ident),
        avatarUrl: profile?.avatarUrl ?? null,
      };
    }
  }

  // A single row can be referenced by more than one href (its `at://` URI and
  // its canonical URL). Assign the target to every href that pointed at it.
  // Publications first; documents override below (an article URL beats a
  // homepage match on the same href).
  for (const row of pubRows) {
    const target: ContentLinkTarget = {
      kind: "publication",
      publicationUri: row.uri,
      did: row.did,
      rkey: row.rkey,
      name: publicationDisplayName(row.name, row.url),
      iconUrl: row.iconCid ? cdnImageUrl(row.did, row.iconCid, "png") : null,
    };
    const uriHref = pubUriToHref.get(row.uri);
    if (uriHref && !out[uriHref]) out[uriHref] = target;
    const urlHref = row.url ? variantToHref.get(row.url) : undefined;
    if (urlHref && !out[urlHref]) out[urlHref] = target;
  }
  for (const row of docRows) {
    const target: ContentLinkTarget = {
      kind: "article",
      documentUri: row.uri,
      did: row.did,
      rkey: row.rkey,
      title: row.title,
      publicationIconUrl:
        row.pubIconCid && row.pubDid
          ? cdnImageUrl(row.pubDid, row.pubIconCid, "png")
          : row.ownerAvatarUrl,
    };
    const uriHref = docUriToHref.get(row.uri);
    if (uriHref) out[uriHref] = target;
    const canonHref = row.canonicalUrl
      ? variantToHref.get(row.canonicalUrl)
      : undefined;
    if (canonHref) out[canonHref] = target;
  }

  return out;
}
