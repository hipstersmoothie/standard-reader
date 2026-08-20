/**
 * The EPUB packager.
 *
 * Builds EPUB 3.2 with the EPUB 2 fallbacks that still matter in the wild: an
 * NCX table of contents alongside the EPUB 3 nav document, and the legacy
 * `<meta name="cover">` pointer alongside the `cover-image` property. KOReader,
 * Kobo, Kindle-via-conversion and Apple Books do not agree on which of those
 * they read, and carrying both costs a few hundred bytes.
 *
 * Generation is two-pass because images cannot be resolved in one (see
 * `render.tsx`): every chapter renders once to discover its image URLs, those
 * are fetched together, then the chapters render again against the map of what
 * actually arrived. Rendering is pure and cheap; the network is neither.
 *
 * Output is deterministic — same document in, byte-identical file out (see
 * `zip.ts`). Nothing here reads the clock.
 */

import { fetchImages } from "./assets";
import type { FetchedImage } from "./assets";
import type { RenderedBody } from "./render";
import {
  BOOK_STYLESHEET,
  xhtmlDocument,
  xmlEscape,
  xmlSafeText,
} from "./xhtml";
import { buildZip } from "./zip";
import type { ZipEntry } from "./zip";

const OPF_PATH = "OEBPS/content.opf";
const NAV_ID = "nav";
const NCX_ID = "ncx";
const COVER_IMAGE_ID = "cover-image";

export interface EpubChapterMeta {
  /** Byline line above the body ("Alice Example"). */
  byline?: string | null;
  /** Human date, already formatted for display. */
  dateline?: string | null;
  /** Where this piece lives on the web. */
  sourceUrl?: string | null;
  sourceLabel?: string | null;
}

export interface EpubChapterSource {
  /** Stable, filename-safe id — also the manifest id and file stem. */
  id: string;
  title: string;
  meta?: EpubChapterMeta;
  /**
   * Render the body. Called twice: once with no map (to discover images), then
   * again with the images that were fetched.
   */
  render: (localImages?: Map<string, string>) => RenderedBody;
}

export interface EpubSpec {
  /**
   * Unique, permanent id for the book — the AT-URI of the document or
   * publication it was built from. Readers use it to recognise a re-download as
   * the same book rather than a second copy.
   */
  identifier: string;
  title: string;
  authors: Array<string>;
  language?: string;
  description?: string | null;
  publisher?: string | null;
  /** ISO timestamp of publication. */
  published?: string | null;
  /**
   * ISO timestamp of the newest content in the book. EPUB 3 requires a
   * `dcterms:modified`, and using the content's own timestamp instead of "now"
   * is what keeps the output byte-stable across rebuilds.
   */
  modified: string;
  subjects?: Array<string>;
  /** Remote URL of the cover image, fetched alongside body images. */
  coverImageUrl?: string | null;
  /** Second line on the title page of a multi-piece book. */
  subtitle?: string | null;
  /** Where the collection as a whole came from. */
  sourceUrl?: string | null;
  chapters: Array<EpubChapterSource>;
}

/** EPUB 3 wants a plain UTC instant, no fractional seconds. */
function epubTimestamp(iso: string): string {
  const time = Date.parse(iso);
  const date = Number.isNaN(time) ? new Date(0) : new Date(time);
  return `${date.toISOString().split(".")[0]}Z`;
}

function chapterHref(id: string): string {
  return `text/${id}.xhtml`;
}

/** Front matter above a chapter body: who wrote it, and when. */
function chapterMetaMarkup(meta: EpubChapterMeta | undefined): string {
  if (!meta) return "";
  const parts = [meta.byline, meta.dateline].filter((part): part is string =>
    Boolean(part && part.trim()),
  );
  if (parts.length === 0) return "";
  return `<p class="sr-chapter-meta">${parts.map((part) => xmlEscape(xmlSafeText(part))).join(" · ")}</p>`;
}

/**
 * The per-chapter colophon.
 *
 * A book assembled from the network should say where each piece came from —
 * both so the reader can go back to the live version (for comments, updates,
 * the publication itself) and because attribution is the least a reader owes
 * a writer whose work they took offline.
 */
function chapterSourceMarkup(meta: EpubChapterMeta | undefined): string {
  if (!meta?.sourceUrl) return "";
  const label = meta.sourceLabel ?? meta.sourceUrl;
  return `<p class="sr-source">Read online: <a href="${xmlEscape(meta.sourceUrl)}">${xmlEscape(xmlSafeText(label))}</a></p>`;
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${OPF_PATH}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
}

function packageOpf({
  spec,
  items,
  spine,
}: {
  spec: EpubSpec;
  items: Array<ManifestItem>;
  spine: Array<string>;
}): string {
  const language = spec.language ?? "en";
  const metadata: Array<string> = [
    `<dc:identifier id="book-id">${xmlEscape(xmlSafeText(spec.identifier))}</dc:identifier>`,
    `<dc:title>${xmlEscape(xmlSafeText(spec.title))}</dc:title>`,
    `<dc:language>${xmlEscape(language)}</dc:language>`,
    `<meta property="dcterms:modified">${epubTimestamp(spec.modified)}</meta>`,
  ];
  for (const author of spec.authors) {
    metadata.push(`<dc:creator>${xmlEscape(xmlSafeText(author))}</dc:creator>`);
  }
  if (spec.description) {
    metadata.push(
      `<dc:description>${xmlEscape(xmlSafeText(spec.description))}</dc:description>`,
    );
  }
  if (spec.publisher) {
    metadata.push(
      `<dc:publisher>${xmlEscape(xmlSafeText(spec.publisher))}</dc:publisher>`,
    );
  }
  if (spec.published) {
    metadata.push(`<dc:date>${epubTimestamp(spec.published)}</dc:date>`);
  }
  if (spec.sourceUrl) {
    metadata.push(`<dc:source>${xmlEscape(spec.sourceUrl)}</dc:source>`);
  }
  for (const subject of spec.subjects ?? []) {
    metadata.push(
      `<dc:subject>${xmlEscape(xmlSafeText(subject))}</dc:subject>`,
    );
  }
  // EPUB 2 readers find the cover through this, not through `properties`.
  if (items.some((item) => item.id === COVER_IMAGE_ID)) {
    metadata.push(`<meta name="cover" content="${COVER_IMAGE_ID}"/>`);
  }

  const manifest = items
    .map(
      (item) =>
        `    <item id="${xmlEscape(item.id)}" href="${xmlEscape(item.href)}" media-type="${xmlEscape(item.mediaType)}"${item.properties ? ` properties="${xmlEscape(item.properties)}"` : ""}/>`,
    )
    .join("\n");

  const spineItems = spine
    .map((id) => `    <itemref idref="${xmlEscape(id)}"/>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${xmlEscape(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${metadata.map((line) => `    ${line}`).join("\n")}
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine toc="${NCX_ID}">
${spineItems}
  </spine>
</package>
`;
}

function navDocument(
  spec: EpubSpec,
  entries: Array<{ href: string; title: string }>,
): string {
  const items = entries
    .map(
      (entry) =>
        `      <li><a href="${xmlEscape(entry.href)}">${xmlEscape(xmlSafeText(entry.title))}</a></li>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xmlEscape(spec.language ?? "en")}">
<head>
<meta charset="utf-8"/>
<title>${xmlEscape(xmlSafeText(spec.title))}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc" role="doc-toc">
    <h1>Contents</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>
`;
}

/** The EPUB 2 table of contents, for readers that ignore the nav document. */
function ncxDocument(
  spec: EpubSpec,
  entries: Array<{ href: string; title: string }>,
): string {
  const points = entries
    .map(
      (
        entry,
        index,
      ) => `    <navPoint id="navpoint-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${xmlEscape(xmlSafeText(entry.title))}</text></navLabel>
      <content src="${xmlEscape(entry.href)}"/>
    </navPoint>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${xmlEscape(xmlSafeText(spec.identifier))}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xmlEscape(xmlSafeText(spec.title))}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`;
}

function coverDocument(spec: EpubSpec, imageHref: string): string {
  return xhtmlDocument({
    body: `<div class="sr-cover"><img src="${xmlEscape(imageHref)}" alt="${xmlEscape(xmlSafeText(spec.title))}"/></div>`,
    language: spec.language,
    title: "Cover",
  });
}

function titleDocument(spec: EpubSpec): string {
  const byline = spec.authors.length > 0 ? spec.authors.join(", ") : null;
  const lines = [
    `<h1>${xmlEscape(xmlSafeText(spec.title))}</h1>`,
    spec.subtitle
      ? `<p class="sr-subtitle">${xmlEscape(xmlSafeText(spec.subtitle))}</p>`
      : null,
    byline ? `<p>${xmlEscape(xmlSafeText(byline))}</p>` : null,
    spec.sourceUrl
      ? `<p class="sr-source"><a href="${xmlEscape(spec.sourceUrl)}">${xmlEscape(spec.sourceUrl)}</a></p>`
      : null,
  ].filter((line): line is string => line !== null);

  return xhtmlDocument({
    body: `<section class="sr-title-page">\n${lines.join("\n")}\n</section>`,
    language: spec.language,
    title: spec.title,
  });
}

/**
 * Assign in-book paths to the images that arrived, keyed by the URL the bodies
 * referenced. Names are positional, so the same book always names the same
 * image the same way.
 */
function imagePaths(
  images: Array<FetchedImage>,
): Map<string, { href: string; id: string; image: FetchedImage }> {
  const map = new Map<
    string,
    { href: string; id: string; image: FetchedImage }
  >();
  for (const [index, image] of images.entries()) {
    const id = `img${String(index + 1).padStart(4, "0")}`;
    map.set(image.url, { href: `images/${id}${image.extension}`, id, image });
  }
  return map;
}

/** Build a complete EPUB file. */
export async function buildEpub(spec: EpubSpec): Promise<Uint8Array> {
  // Pass one: render every chapter to find the images, in reading order.
  const discovery = spec.chapters.map((chapter) => chapter.render());
  const wanted: Array<string> = [];
  const seen = new Set<string>();
  const remember = (url: string | null | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    wanted.push(url);
  };
  // The cover leads, so it survives a budget that the tail of the book does not.
  remember(spec.coverImageUrl);
  for (const body of discovery) {
    for (const url of body.imageUrls) remember(url);
  }

  const fetched = await fetchImages(wanted);
  const assets = imagePaths(fetched);

  const cover = spec.coverImageUrl ? assets.get(spec.coverImageUrl) : undefined;

  // Chapter bodies live one directory below the OPF, so their image and
  // stylesheet references climb out of `text/`.
  const chapterImageHrefs = new Map<string, string>();
  for (const [url, asset] of assets) {
    chapterImageHrefs.set(url, `../${asset.href}`);
  }

  const items: Array<ManifestItem> = [
    {
      href: "nav.xhtml",
      id: NAV_ID,
      mediaType: "application/xhtml+xml",
      properties: "nav",
    },
    { href: "toc.ncx", id: NCX_ID, mediaType: "application/x-dtbncx+xml" },
    { href: "style.css", id: "style", mediaType: "text/css" },
  ];
  const spine: Array<string> = [];
  const entries: Array<ZipEntry> = [];
  const encoder = new TextEncoder();
  const addText = (name: string, text: string) => {
    entries.push({ data: encoder.encode(text), name });
  };

  // `mimetype` must come first, stored, so the file is sniffable.
  entries.push({
    data: encoder.encode("application/epub+zip"),
    method: "store",
    name: "mimetype",
  });
  addText("META-INF/container.xml", containerXml());
  addText("OEBPS/style.css", BOOK_STYLESHEET);

  if (cover) {
    items.push({
      href: cover.href,
      id: COVER_IMAGE_ID,
      mediaType: cover.image.mediaType,
      properties: "cover-image",
    });
    items.push({
      href: "text/cover.xhtml",
      id: "cover-page",
      mediaType: "application/xhtml+xml",
    });
    spine.push("cover-page");
    addText("OEBPS/text/cover.xhtml", coverDocument(spec, `../${cover.href}`));
  }

  // A single article is its own title page — its chapter already opens with the
  // title and byline. A collection needs one.
  if (spec.chapters.length > 1) {
    items.push({
      href: "text/title.xhtml",
      id: "title-page",
      mediaType: "application/xhtml+xml",
    });
    spine.push("title-page");
    addText("OEBPS/text/title.xhtml", titleDocument(spec));
  }

  const tocEntries: Array<{ href: string; title: string }> = [];

  for (const [index, chapter] of spec.chapters.entries()) {
    // Pass two: the same render, now pointing at the images we actually have.
    const body =
      fetched.length > 0
        ? chapter.render(chapterImageHrefs)
        : (discovery[index] as RenderedBody);

    const href = chapterHref(chapter.id);
    const markup = [
      `<h1>${xmlEscape(xmlSafeText(chapter.title))}</h1>`,
      chapterMetaMarkup(chapter.meta),
      body.markup,
      chapterSourceMarkup(chapter.meta),
    ]
      .filter(Boolean)
      .join("\n");

    addText(
      `OEBPS/${href}`,
      xhtmlDocument({
        body: markup,
        language: spec.language,
        title: chapter.title,
      }),
    );
    items.push({
      href,
      id: chapter.id,
      mediaType: "application/xhtml+xml",
    });
    spine.push(chapter.id);
    tocEntries.push({ href, title: chapter.title });
  }

  for (const [, asset] of assets) {
    if (asset.id === cover?.id) continue;
    items.push({
      href: asset.href,
      id: asset.id,
      mediaType: asset.image.mediaType,
    });
  }
  for (const [, asset] of assets) {
    entries.push({
      // Images are already compressed; deflating them spends CPU to add bytes.
      data: asset.image.data,
      method: "store",
      name: `OEBPS/${asset.href}`,
    });
  }

  addText("OEBPS/nav.xhtml", navDocument(spec, tocEntries));
  addText("OEBPS/toc.ncx", ncxDocument(spec, tocEntries));
  addText(OPF_PATH, packageOpf({ items, spec, spine }));

  return buildZip(entries);
}
