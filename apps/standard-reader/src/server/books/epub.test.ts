/**
 * @vitest-environment jsdom
 *
 * jsdom only for `DOMParser`: an EPUB content document is XHTML, and the
 * cheapest honest test of that is to parse it as XML and see whether a real
 * parser objects.
 */

/* eslint-disable unicorn/number-literal-case -- ZIP signatures and CRC
   constants are written the way the spec and every reference implementation
   write them, and oxfmt lowercases hex literals on save (see
   `server/reader/rail-rotation.ts` for the same conflict). */
import { inflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildEpub } from "#/server/books/epub";
import type { EpubSpec } from "#/server/books/epub";

const decoder = new TextDecoder();

/** Read an archive's entries back out, by name. */
function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, Uint8Array>();
  let at = 0;

  while (at + 4 <= bytes.length && view.getUint32(at, true) === 0x04_03_4b_50) {
    const method = view.getUint16(at + 8, true);
    const compressedSize = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const nameAt = at + 30;
    const dataAt = nameAt + nameLength + extraLength;
    const body = bytes.subarray(dataAt, dataAt + compressedSize);

    files.set(
      decoder.decode(bytes.subarray(nameAt, nameAt + nameLength)),
      method === 0 ? body : new Uint8Array(inflateRawSync(body)),
    );
    at = dataAt + compressedSize;
  }
  return files;
}

const text = (files: Map<string, Uint8Array>, name: string): string =>
  decoder.decode(files.get(name) ?? new Uint8Array());

function chapter(
  id: string,
  title: string,
  body: string,
  images: Array<string> = [],
) {
  return {
    id,
    render: (localImages: Map<string, string> | undefined) => ({
      imageUrls: images,
      markup:
        images.length > 0
          ? `${body}${images.map((url) => `<img src="${localImages?.get(url) ?? url}"/>`).join("")}`
          : body,
    }),
    title,
  };
}

function spec(overrides: Partial<EpubSpec> = {}): EpubSpec {
  return {
    authors: ["Ada Lovelace"],
    chapters: [chapter("ch0001", "First & Last", "<p>Hello</p>")],
    identifier: "at://did:plc:abc/site.standard.document/xyz",
    modified: "2026-08-01T12:30:45.123Z",
    title: "A Book",
    ...overrides,
  };
}

/** A 1×1 PNG, enough for the sniffer to call it an image. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

function stubImageFetch(bytes: Uint8Array = PNG) {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(bytes as BodyInit, {
        headers: { "content-type": "image/png" },
        status: 200,
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildEpub", () => {
  it("puts `mimetype` first and stores it uncompressed", async () => {
    // The one structural rule EPUB actually enforces: a reader identifies the
    // file from these bytes without inflating anything.
    const epub = await buildEpub(spec());
    expect(decoder.decode(epub.subarray(30, 38))).toBe("mimetype");
    expect(decoder.decode(epub.subarray(38, 58))).toBe("application/epub+zip");
  });

  it("ships a container pointing at the package document", async () => {
    const files = readZip(await buildEpub(spec()));
    expect(text(files, "META-INF/container.xml")).toContain(
      'full-path="OEBPS/content.opf"',
    );
    expect(files.has("OEBPS/content.opf")).toBe(true);
  });

  it("writes well-formed XML in every document it generates", async () => {
    const files = readZip(
      await buildEpub(
        spec({
          chapters: [
            chapter("ch0001", "One", "<p>a</p>"),
            chapter("ch0002", "Two", "<p>b</p>"),
          ],
        }),
      ),
    );

    for (const [name, bytes] of files) {
      if (!/\.(xhtml|xml|opf|ncx)$/.test(name)) continue;
      const parsed = new DOMParser().parseFromString(
        decoder.decode(bytes),
        "application/xml",
      );
      expect(
        parsed.querySelector("parsererror"),
        `${name} is not well-formed XML`,
      ).toBeNull();
    }
  });

  it("escapes record text that would otherwise break the package", async () => {
    const files = readZip(
      await buildEpub(
        spec({ subjects: ["a & b"], title: 'Tools & <Toys> "quoted"' }),
      ),
    );
    const opf = text(files, "OEBPS/content.opf");
    expect(opf).toContain("Tools &amp; &lt;Toys&gt;");
    expect(opf).toContain("<dc:subject>a &amp; b</dc:subject>");
  });

  it("strips control characters XML cannot represent", async () => {
    const files = readZip(
      await buildEpub(spec({ title: "Bad\u0007Title\u0000Here" })),
    );
    expect(text(files, "OEBPS/content.opf")).toContain(
      "<dc:title>BadTitleHere</dc:title>",
    );
  });

  it("carries both tables of contents", async () => {
    // EPUB 3 readers use the nav document; plenty of shipping devices still
    // read only the NCX.
    const files = readZip(await buildEpub(spec()));
    expect(text(files, "OEBPS/nav.xhtml")).toContain('epub:type="toc"');
    expect(text(files, "OEBPS/toc.ncx")).toContain("<navPoint");
    expect(text(files, "OEBPS/content.opf")).toContain('<spine toc="ncx">');
  });

  it("uses content time for `dcterms:modified`, not the clock", async () => {
    const files = readZip(await buildEpub(spec()));
    // Seconds precision, and derived from the newest thing in the book — which
    // is what makes a rebuild byte-identical.
    expect(text(files, "OEBPS/content.opf")).toContain(
      '<meta property="dcterms:modified">2026-08-01T12:30:45Z</meta>',
    );
  });

  it("produces identical bytes for identical input", async () => {
    const first = await buildEpub(spec());
    const second = await buildEpub(spec());
    expect(Buffer.from(first)).toEqual(Buffer.from(second));
  });

  it("gives a single article no title page, and a collection one", async () => {
    const single = readZip(await buildEpub(spec()));
    expect(single.has("OEBPS/text/title.xhtml")).toBe(false);

    const many = readZip(
      await buildEpub(
        spec({
          chapters: [
            chapter("ch0001", "One", "<p>a</p>"),
            chapter("ch0002", "Two", "<p>b</p>"),
          ],
          subtitle: "2 articles",
        }),
      ),
    );
    expect(many.has("OEBPS/text/title.xhtml")).toBe(true);
    expect(text(many, "OEBPS/text/title.xhtml")).toContain("2 articles");
  });

  it("prints the byline and dateline above a chapter body", async () => {
    const files = readZip(
      await buildEpub(
        spec({
          chapters: [
            {
              ...chapter("ch0001", "One", "<p>a</p>"),
              meta: {
                byline: "Ada Lovelace",
                dateline: "1 August 2026",
                sourceLabel: "Example",
                sourceUrl: "https://example.com/post",
              },
            },
          ],
        }),
      ),
    );
    const body = text(files, "OEBPS/text/ch0001.xhtml");
    expect(body).toContain("Ada Lovelace · 1 August 2026");
    expect(body).toContain('href="https://example.com/post"');
  });

  it("embeds fetched images and rewrites the body to point at them", async () => {
    stubImageFetch();
    const files = readZip(
      await buildEpub(
        spec({
          chapters: [
            chapter("ch0001", "One", "<p>a</p>", [
              "https://cdn.example/one.png",
            ]),
          ],
        }),
      ),
    );

    expect(files.has("OEBPS/images/img0001.png")).toBe(true);
    expect(text(files, "OEBPS/text/ch0001.xhtml")).toContain(
      '<img src="../images/img0001.png"/>',
    );
    expect(text(files, "OEBPS/content.opf")).toContain(
      'media-type="image/png"',
    );
  });

  it("keeps the remote URL when an image cannot be fetched", async () => {
    // A book missing one image is still a book; a book that failed to build
    // because a CDN was down is not.
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));
    const files = readZip(
      await buildEpub(
        spec({
          chapters: [
            chapter("ch0001", "One", "<p>a</p>", [
              "https://cdn.example/gone.png",
            ]),
          ],
        }),
      ),
    );
    expect(text(files, "OEBPS/text/ch0001.xhtml")).toContain(
      'src="https://cdn.example/gone.png"',
    );
    expect([...files.keys()].some((name) => name.includes("images/"))).toBe(
      false,
    );
  });

  it("marks a cover both ways so either generation of reader finds it", async () => {
    stubImageFetch();
    const files = readZip(
      await buildEpub(spec({ coverImageUrl: "https://cdn.example/cover.png" })),
    );
    const opf = text(files, "OEBPS/content.opf");
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('<meta name="cover" content="cover-image"/>');
    expect(files.has("OEBPS/text/cover.xhtml")).toBe(true);
  });

  it("keeps the cover out of the body-image manifest entries", async () => {
    stubImageFetch();
    const files = readZip(
      await buildEpub(spec({ coverImageUrl: "https://cdn.example/cover.png" })),
    );
    const opf = text(files, "OEBPS/content.opf");
    // One manifest item per image file — the cover must not appear twice.
    expect(opf.match(/href="images\/img0001\.png"/g)).toHaveLength(1);
  });
});

/* eslint-enable unicorn/number-literal-case */
