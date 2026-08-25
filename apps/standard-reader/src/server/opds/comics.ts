/**
 * Comics in the catalog.
 *
 * A comic publication cannot use the ordinary article feed: its documents are
 * single pages, so that feed offers a comic app fifty one-page "comics" in
 * place of one series. These entries are built from the shelf instead
 * (`selectComicShelf`), which is where the app already decides what one comic
 * unit is — see `server/books/comic-issue.ts`.
 */

import type { PublicationCard } from "#/integrations/tanstack-query/api-shapes";
import type { OpdsPublicationEntry } from "#/lib/opds/model";
import { CBZ_TYPE } from "#/lib/opds/model";
import { comicIssueCbzUrl, publicationCbzUrl } from "#/lib/opds/urls";
import type { ComicShelf } from "#/server/reader/comic";

function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? "";
}

/**
 * A comic publication's shelf as OPDS entries.
 *
 * In `issues` mode each entry is an issue and carries its own CBZ. In `pages`
 * mode the titles gave nothing to group by, so a per-entry file would be one
 * page — there the whole run is offered as a single entry instead.
 *
 * Only CBZ is offered, and only one link per entry: a comic app shows a button
 * for every acquisition link it understands, and a second format is a second
 * button that downloads the same pages in a shape the app is worse at.
 */
export function comicShelfEntries(
  shelf: ComicShelf,
  publication: PublicationCard,
  baseUrl: string,
): Array<OpdsPublicationEntry> {
  const publicationRkey = rkeyOf(publication.uri);
  const byline = publication.ownerHandle
    ? [
        {
          name: publication.ownerHandle,
          uri: `${baseUrl}/u/${encodeURIComponent(publication.did)}`,
        },
      ]
    : [];

  if (shelf.mode === "pages") {
    const cover =
      shelf.issues[0]?.coverImageUrl ??
      publication.iconUrl ??
      publication.ownerAvatarUrl;
    return [
      {
        acquisitions: [
          {
            href: publicationCbzUrl(baseUrl, publication.did, publicationRkey),
            title: "CBZ",
            type: CBZ_TYPE,
          },
        ],
        authors: byline,
        coverImageUrl: cover,
        id: `${publication.uri}#run`,
        published: shelf.issues.at(-1)?.publishedAt,
        publisher: publication.name,
        summary:
          publication.description ??
          `The complete run — ${shelf.totalPages} ${shelf.totalPages === 1 ? "page" : "pages"}.`,
        thumbnailUrl: cover,
        title: publication.name,
        updated: shelf.issues[0]?.publishedAt ?? new Date(0).toISOString(),
      },
    ];
  }

  return shelf.issues.map((issue) => {
    // "Fray In The Veil #3" — on a device the file leaves the publication page
    // behind, so the series name has to travel with it. The shelf can say "#3"
    // because it is already inside the comic.
    const title = `${publication.name} ${issue.label}`;
    return {
      acquisitions: [
        {
          href: comicIssueCbzUrl(baseUrl, issue.did, issue.rkey),
          title: "CBZ",
          type: CBZ_TYPE,
        },
      ],
      authors: byline,
      coverImageUrl: issue.coverImageUrl,
      id: issue.uri,
      published: issue.publishedAt,
      publisher: publication.name,
      summary: `${issue.pageCount} ${issue.pageCount === 1 ? "page" : "pages"}`,
      thumbnailUrl: issue.coverImageUrl,
      title,
      updated: issue.publishedAt,
      webUrl: `${baseUrl}/comic/${encodeURIComponent(issue.did)}/${encodeURIComponent(issue.rkey)}`,
    };
  });
}
