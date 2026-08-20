import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, isNotNull } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import type { OpdsNavigationEntry } from "#/lib/opds/model";
import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import { opdsCollectionsUrl, opdsCollectionUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { cdnImageUrl } from "#/server/atproto/blob";
import {
  navigationFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";

export const Route = createFileRoute("/opds/collections")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);

        // A collection is an ordinary document carrying a manifest sidecar, so
        // "the collections" is just the documents that have one.
        const rows = await db
          .select({
            coverImageCid: schema.documents.coverImageCid,
            description: schema.documents.description,
            did: schema.documents.did,
            publishedAt: schema.documents.publishedAt,
            rkey: schema.documents.rkey,
            title: schema.documents.title,
            uri: schema.documents.uri,
          })
          .from(schema.documents)
          .where(
            and(
              eq(schema.documents.deleted, false),
              isNotNull(schema.documents.collectionJson),
            ),
          )
          .orderBy(desc(schema.documents.publishedAt))
          .limit(OPDS_PAGE_SIZE)
          .offset((page - 1) * OPDS_PAGE_SIZE);

        const entries: Array<OpdsNavigationEntry> = rows.map((row) => {
          const cover = row.coverImageCid
            ? cdnImageUrl(row.did, row.coverImageCid)
            : null;
          return {
            href: opdsCollectionUrl(baseUrl, row.did, row.rkey),
            id: row.uri,
            imageUrl: cover,
            kind: "acquisition",
            summary: row.description,
            thumbnailUrl: cover,
            title: row.title,
            updated: row.publishedAt.toISOString(),
          };
        });

        return opdsResponse(
          navigationFeed(entries, {
            baseUrl,
            id: opdsCollectionsUrl(baseUrl),
            page,
            selfHref: opdsCollectionsUrl(baseUrl),
            subtitle: "Anthologies readers assembled from across the network.",
            title: "Collections",
          }),
          opdsFormatFromRequest(request),
        );
      },
    },
  },
});
