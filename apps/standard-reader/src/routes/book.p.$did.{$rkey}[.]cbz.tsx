import { createFileRoute } from "@tanstack/react-router";

import { publicationUriFromParams } from "#/components/reader/format";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { getPublicUrl } from "#/lib/public-url";
import { buildCbz } from "#/server/books/cbz";
import { comicRunFile } from "#/server/books/comic-issue";
import { bookResponse } from "#/server/books/respond";
import { bookFilename } from "#/server/books/sources";
import { selectPublicationHeader } from "#/server/reader/publication-header";

/**
 * A comic publication's whole run as one CBZ.
 *
 * The right unit for a comic whose posts carry no issue numbers: there is no
 * issue to package, so one file of everything beats a shelf of one-page files.
 */
export const Route = createFileRoute("/book/p/$did/{$rkey}.cbz")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { did, rkey } = params;
        if (!did.startsWith("did:")) {
          return new Response("Bad Request", { status: 400 });
        }

        const publicationUri = publicationUriFromParams(did, rkey);
        const header = await selectPublicationHeader(
          db,
          schema,
          publicationUri,
        );
        if (!header) {
          return new Response("Not Found", { status: 404 });
        }

        const run = await comicRunFile(
          db,
          schema,
          publicationUri,
          header.publication.name,
        );
        if (!run) {
          return new Response("Not Found", { status: 404 });
        }

        const cbz = await buildCbz({
          pageUrls: run.pageUrls,
          published: run.publishedAt,
          publisher: header.publication.name,
          series: header.publication.name,
          summary: header.publication.description,
          title: run.title,
          web: `${getPublicUrl()}/p/${did}/${rkey}`,
        });
        if (!cbz) {
          return new Response("Not Found", { status: 404 });
        }

        return bookResponse(cbz, {
          contentType: "application/vnd.comicbook+zip",
          filename: bookFilename(run.title, ".cbz"),
          request,
        });
      },
    },
  },
});
