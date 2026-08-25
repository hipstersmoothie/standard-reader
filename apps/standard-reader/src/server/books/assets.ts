/**
 * Fetching the images a book embeds.
 *
 * A downloaded book is an offline artifact — an image left as a remote URL is
 * an image the reader does not have on the train. So every image the body
 * references is pulled into the archive.
 *
 * That makes generation a fan-out over the network, on a request the reader is
 * waiting on, so it is bounded in all three directions that can hurt: how many
 * fetches run at once, how large one image may be, and how many bytes the whole
 * book may spend on images. A book that hits a limit is still a good book —
 * it just keeps the remote URL for the images that did not fit, which resolve
 * when the reader is online.
 */

/* eslint-disable unicorn/number-literal-case -- image magic numbers are
   written the way every format spec writes them, and oxfmt lowercases hex
   literals on save (see `server/reader/rail-rotation.ts`). */

import { mapWithConcurrency } from "#/lib/concurrency";

/** Simultaneous image fetches per book. */
const CONCURRENCY = 6;

/** Per-image ceiling. Above this, the image stays a remote URL. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Whole-book image budget, across every chapter. */
const MAX_TOTAL_BYTES = 96 * 1024 * 1024;

/** How long one image gets before the book goes on without it. */
const FETCH_TIMEOUT_MS = 15_000;

export interface FetchedImage {
  /** The URL as it appeared in the body — the key callers rewrite from. */
  url: string;
  data: Uint8Array;
  mediaType: string;
  /** File extension including the dot, derived from the media type. */
  extension: string;
}

const MEDIA_TYPE_EXTENSIONS: Record<string, string> = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
};

/**
 * Media types EPUB 3 requires every reading system to support. Anything else
 * (AVIF, and WebP on older devices) is carried as-is: it is what the publisher
 * uploaded, and re-encoding it server-side would cost more than it buys.
 */
export function isSupportedImageType(mediaType: string): boolean {
  return mediaType in MEDIA_TYPE_EXTENSIONS;
}

/**
 * Identify an image from its leading bytes.
 *
 * The declared `Content-Type` is the first source, but CDNs mislabel and some
 * PDS blobs come back `application/octet-stream`; the magic number is the
 * thing that actually determines whether a reader can decode the file.
 */
export function sniffImageType(data: Uint8Array): string | null {
  if (data.length < 12) return null;
  const [b0, b1, b2, b3] = data;
  if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) return "image/jpeg";
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) {
    return "image/png";
  }
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return "image/gif";
  const ascii = (at: number, text: string) =>
    [...text].every((char, index) => data[at + index] === char.codePointAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis"))) {
    return "image/avif";
  }
  // SVG is text, and may open with a comment or an XML declaration.
  const head = new TextDecoder().decode(data.slice(0, 256)).trimStart();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) {
    return "image/svg+xml";
  }
  return null;
}

async function fetchOne(url: string): Promise<FetchedImage | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: "image/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    // Trust the header enough to skip the download when it is clearly too big;
    // the real check is on the bytes, since the header can lie or be absent.
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      return null;
    }

    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length === 0 || data.length > MAX_IMAGE_BYTES) return null;

    const declaredType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    const mediaType =
      declaredType && isSupportedImageType(declaredType)
        ? declaredType
        : sniffImageType(data);
    if (!mediaType) return null;

    return {
      data,
      extension: MEDIA_TYPE_EXTENSIONS[mediaType] ?? ".img",
      mediaType,
      url,
    };
  } catch {
    // Timeouts, DNS failures, a PDS that has gone away: the book is still
    // worth building, so the image just stays remote.
    return null;
  }
}

/**
 * Fetch every URL in `urls`, in order, until the whole-book budget runs out.
 *
 * Order matters: images earlier in the book are the ones the reader sees first,
 * so when the budget binds it should bind on the tail.
 */
export async function fetchImages(
  urls: Array<string>,
): Promise<Array<FetchedImage>> {
  if (urls.length === 0) return [];

  const results = await mapWithConcurrency(urls, CONCURRENCY, fetchOne);

  const kept: Array<FetchedImage> = [];
  let total = 0;
  for (const image of results) {
    if (!image) continue;
    if (total + image.data.length > MAX_TOTAL_BYTES) break;
    total += image.data.length;
    kept.push(image);
  }
  return kept;
}

/* eslint-enable unicorn/number-literal-case */
