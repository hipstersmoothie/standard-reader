import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { documentUriFromParams } from "#/components/reader/format";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { parseComicIssueTitle } from "#/lib/comic/issue-title";
import { documentImages } from "#/lib/document/images";
import { didFromParam } from "#/lib/opds/did-param";
import { getPublicUrl } from "#/lib/public-url";
import { buildCbz } from "#/server/books/cbz";
import { bookResponse } from "#/server/books/respond";
import { bookFilename } from "#/server/books/sources";
import { rememberDownloadHashes } from "#/server/kosync/register";

export const Route = createFileRoute("/book/a/$did/{$rkey}.cbz")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { rkey } = params;
        const did = didFromParam(params.did);
        if (!did) {
          return new Response("Bad Request", { status: 400 });
        }

        const uri = documentUriFromParams(did, rkey);
        const [row] = await db
          .select({
            canonicalUrl: schema.documents.canonicalUrl,
            contentFormat: schema.documents.contentFormat,
            contentJson: schema.documents.contentJson,
            description: schema.documents.description,
            did: schema.documents.did,
            publicationName: schema.publications.name,
            publishedAt: schema.documents.publishedAt,
            tags: schema.documents.tags,
            title: schema.documents.title,
          })
          .from(schema.documents)
          .leftJoin(
            schema.publications,
            eq(schema.publications.uri, schema.documents.publicationUri),
          )
          .where(
            and(
              eq(schema.documents.uri, uri),
              eq(schema.documents.deleted, false),
            ),
          )
          .limit(1);

        if (!row) {
          return new Response("Not Found", { status: 404 });
        }

        // The same page list the comic reader flips through, in the same order.
        const pages = documentImages({
          contentFormat: row.contentFormat,
          contentJson: row.contentJson as never,
          did: row.did,
        });
        if (pages.length === 0) {
          return new Response("Not Found", { status: 404 });
        }

        const issue = parseComicIssueTitle(row.title);
        const cbz = await buildCbz({
          genres: row.tags ?? [],
          number: issue?.issueNumber ?? null,
          pageUrls: pages.map((page) => page.url),
          published: row.publishedAt.toISOString(),
          publisher: row.publicationName ?? "Standard Reader",
          series: row.publicationName ?? (issue?.series || null),
          summary: row.description,
          title: row.title,
          web: row.canonicalUrl ?? `${getPublicUrl()}/comic/${did}/${rkey}`,
        });
        if (!cbz) {
          return new Response("Not Found", { status: 404 });
        }

        const filename = bookFilename(row.title, ".cbz");
        await rememberDownloadHashes(uri, cbz, filename);

        return bookResponse(cbz, {
          contentType: "application/vnd.comicbook+zip",
          filename,
          request,
        });
      },
    },
  },
});
