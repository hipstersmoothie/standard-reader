import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import type { OpdsNavigationEntry } from "#/lib/opds/model";
import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import { opdsComicsUrl, opdsPublicationUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { cdnImageUrl } from "#/server/atproto/blob";
import {
  navigationFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";

/**
 * Comics, on their own.
 *
 * `serial_kind` is app-derived: a publication that reads forwards *and* whose
 * posts are mostly art (`recomputeSerialKinds`). Pointing a comic app at the
 * full directory would make it wade through hundreds of prose blogs to reach
 * the handful of things it can open.
 */
export const Route = createFileRoute("/opds/comics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);

        const rows = await db
          .select({
            description: schema.publications.description,
            did: schema.publications.did,
            iconCid: schema.publications.iconCid,
            lastDocumentAt: schema.publicationStats.lastDocumentAt,
            name: schema.publications.name,
            ownerAvatarUrl: schema.profiles.avatarUrl,
            rkey: schema.publications.rkey,
            uri: schema.publications.uri,
          })
          .from(schema.publications)
          .leftJoin(
            schema.publicationStats,
            eq(schema.publicationStats.publicationUri, schema.publications.uri),
          )
          .leftJoin(
            schema.profiles,
            eq(schema.profiles.did, schema.publications.did),
          )
          .where(
            and(
              eq(schema.publications.deleted, false),
              eq(schema.publications.showInDiscover, true),
              eq(schema.publications.serialKind, "comic"),
            ),
          )
          .orderBy(desc(schema.publicationStats.lastDocumentAt))
          .limit(OPDS_PAGE_SIZE)
          .offset((page - 1) * OPDS_PAGE_SIZE);

        const entries: Array<OpdsNavigationEntry> = rows.map((row) => {
          const icon = row.iconCid
            ? cdnImageUrl(row.did, row.iconCid)
            : row.ownerAvatarUrl;
          return {
            href: opdsPublicationUrl(baseUrl, row.did, row.rkey),
            id: row.uri,
            imageUrl: icon,
            kind: "acquisition",
            summary: row.description,
            thumbnailUrl: icon,
            title: row.name,
            updated:
              row.lastDocumentAt?.toISOString() ?? new Date(0).toISOString(),
          };
        });

        return opdsResponse(
          navigationFeed(entries, {
            baseUrl,
            id: opdsComicsUrl(baseUrl),
            page,
            selfHref: opdsComicsUrl(baseUrl),
            subtitle: "Comics on the network, as CBZ.",
            title: "Comics",
          }),
          opdsFormatFromRequest(request),
        );
      },
    },
  },
});
