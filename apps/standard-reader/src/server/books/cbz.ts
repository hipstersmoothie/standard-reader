/**
 * The CBZ packager — comics, as comic readers expect them.
 *
 * A comic issue on this network is a document whose body is a run of images
 * (see `lib/document/images.ts`, and `server/reader/comic.ts` for how the app
 * flattens a serial into one continuous page list). Wrapping those pages in an
 * EPUB would technically work and would read badly: comic readers have page
 * turns, spread detection, zoom and a page-number scrubber, and they get none
 * of it from a reflowable book.
 *
 * So comics are offered as CBZ as well — a ZIP of page images in filename
 * order, plus the `ComicInfo.xml` sidecar that Panels, Chunky, Komga, Kavita
 * and KOReader all read for series and issue metadata.
 */

import { fetchImages } from "./assets";
import { xmlEscape, xmlSafeText } from "./xhtml";
import { buildZip } from "./zip";
import type { ZipEntry } from "./zip";

export interface CbzSpec {
  /** Issue title ("Chapter 3"). */
  title: string;
  /** Series the issue belongs to — the publication name. */
  series?: string | null;
  /** Issue number within the series, when the title parses as one. */
  number?: number | null;
  /** Total issues in the series, when known. */
  count?: number | null;
  summary?: string | null;
  writer?: string | null;
  publisher?: string | null;
  /** ISO timestamp of publication. */
  published?: string | null;
  web?: string | null;
  genres?: Array<string>;
  /** Page image URLs, in reading order. */
  pageUrls: Array<string>;
}

/**
 * ComicInfo.xml — the de-facto metadata sidecar for comic archives.
 *
 * Undefined fields are omitted rather than written empty: readers treat an
 * empty `<Series/>` as a series literally named "", which is worse than none.
 */
function comicInfoXml(spec: CbzSpec, pageCount: number): string {
  const published = spec.published ? new Date(spec.published) : null;
  const valid = published && !Number.isNaN(published.getTime());

  const fields: Array<[string, string | number | null | undefined]> = [
    ["Title", spec.title],
    ["Series", spec.series],
    ["Number", spec.number],
    ["Count", spec.count],
    ["Summary", spec.summary],
    ["Writer", spec.writer],
    ["Publisher", spec.publisher],
    ["Year", valid ? published.getUTCFullYear() : null],
    ["Month", valid ? published.getUTCMonth() + 1 : null],
    ["Day", valid ? published.getUTCDate() : null],
    ["Web", spec.web],
    ["Genre", spec.genres?.length ? spec.genres.join(", ") : null],
    ["PageCount", pageCount],
    ["Manga", "No"],
  ];

  const body = fields
    .filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    )
    .map(
      ([name, value]) =>
        `  <${name}>${xmlEscape(xmlSafeText(String(value)))}</${name}>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
${body}
</ComicInfo>
`;
}

/**
 * Build a CBZ. Returns `null` when no page survived fetching — an empty archive
 * is a file that opens to nothing, and a 404 is the more honest answer.
 */
export async function buildCbz(spec: CbzSpec): Promise<Uint8Array | null> {
  const images = await fetchImages(spec.pageUrls);
  if (images.length === 0) return null;

  // Comic readers sort pages by filename, so the numbering *is* the reading
  // order. Zero-padded to the archive's own width so page 10 never sorts
  // before page 2.
  const width = Math.max(3, String(images.length).length);
  const entries: Array<ZipEntry> = images.map((image, index) => ({
    // Already-compressed pixels: storing is smaller in practice and much faster.
    data: image.data,
    method: "store",
    name: `${String(index + 1).padStart(width, "0")}${image.extension}`,
  }));

  entries.push({
    data: new TextEncoder().encode(comicInfoXml(spec, images.length)),
    name: "ComicInfo.xml",
  });

  return buildZip(entries);
}
