import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { documentUriFromParams } from "#/components/reader/format";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { didFromParam } from "#/lib/opds/did-param";
import { getPublicUrl } from "#/lib/public-url";
import { buildCbz } from "#/server/books/cbz";
import { comicIssueFile } from "#/server/books/comic-issue";
import { bookResponse } from "#/server/books/respond";
import { bookFilename } from "#/server/books/sources";

/**
 * One comic issue as a CBZ, addressed by the document that fronts it.
 *
 * Distinct from `/book/a/:did/:rkey.cbz`, which packages a single document: on
 * this network a comic posts one page per document, so that route yields a
 * one-page file. This one collects the whole issue the page belongs to — the
 * same grouping the shelf and the reader show.
 */
export const Route = createFileRoute("/book/i/$did/{$rkey}.cbz")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { rkey } = params;
        const did = didFromParam(params.did);
        if (!did) {
          return new Response("Bad Request", { status: 400 });
        }

        const [front] = await db
          .select({
            publicationName: schema.publications.name,
            publicationUri: schema.documents.publicationUri,
            tags: schema.documents.tags,
          })
          .from(schema.documents)
          .leftJoin(
            schema.publications,
            eq(schema.publications.uri, schema.documents.publicationUri),
          )
          .where(
            and(
              eq(schema.documents.uri, documentUriFromParams(did, rkey)),
              eq(schema.documents.deleted, false),
            ),
          )
          .limit(1);

        if (!front?.publicationUri) {
          return new Response("Not Found", { status: 404 });
        }

        const issue = await comicIssueFile(
          db,
          schema,
          front.publicationUri,
          rkey,
        );
        if (!issue) {
          return new Response("Not Found", { status: 404 });
        }

        const series = front.publicationName ?? null;
        // "Fray In The Veil #3" reads better on a device's shelf than "#3",
        // which is what the in-app shelf shows under a cover that already sits
        // inside the publication.
        const title = series ? `${series} ${issue.title}` : issue.title;

        const cbz = await buildCbz({
          genres: front.tags ?? [],
          number: issue.issueNumber,
          pageUrls: issue.pageUrls,
          published: issue.publishedAt,
          publisher: series ?? "Standard Reader",
          series,
          title,
          web: `${getPublicUrl()}/comic/${did}/${rkey}`,
        });
        if (!cbz) {
          return new Response("Not Found", { status: 404 });
        }

        return bookResponse(cbz, {
          contentType: "application/vnd.comicbook+zip",
          filename: bookFilename(title, ".cbz"),
          request,
        });
      },
    },
  },
});
