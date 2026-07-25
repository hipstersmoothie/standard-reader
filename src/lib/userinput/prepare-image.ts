/**
 * Client-side preparation of feedback screenshots.
 *
 * The `app.userinput.discussion` lexicon caps each attached blob at 1 MB
 * (`FEEDBACK_IMAGE_MAX_BYTES`) — well under what a retina screenshot weighs, so
 * uploading the file as-is would fail at the PDS for most real bug evidence.
 * Everything oversized is decoded, downscaled, and re-encoded here until it
 * fits, before a single byte leaves the browser.
 *
 * Anything already small enough *and* in an accepted format is passed through
 * untouched — re-encoding a 200 KB PNG would only lose fidelity.
 */

import { FEEDBACK_IMAGE_MAX_BYTES, FEEDBACK_IMAGE_MIME_TYPES } from "./space";

export type FeedbackImageMimeType = (typeof FEEDBACK_IMAGE_MIME_TYPES)[number];

export interface PreparedFeedbackImage {
  dataBase64: string;
  mimeType: FeedbackImageMimeType;
  /** Byte length after preparation — what the PDS will see. */
  bytes: number;
}

/**
 * Why preparation gave up. This module has no `i18n` instance (it's pure, and
 * the app builds a fresh one per locale — see the i18n notes in AGENTS.md), so
 * it throws a code and the calling component renders the translated sentence.
 */
export type PrepareImageErrorCode =
  | "read-failed"
  | "gif-too-large"
  | "unreadable"
  | "too-large";

export class PrepareImageError extends Error {
  readonly code: PrepareImageErrorCode;

  constructor(code: PrepareImageErrorCode) {
    super(`prepare-image: ${code}`);
    this.name = "PrepareImageError";
    this.code = code;
  }
}

/**
 * Longest-edge ceilings, tried in order. 2000px keeps a full 5K screenshot
 * legible; the smaller steps are the escape hatch for dense screenshots that
 * won't compress at full size.
 */
const MAX_DIMENSIONS = [2000, 1600, 1280, 1024];

/** Encoder qualities tried at each dimension, best first. */
const QUALITIES = [0.9, 0.8, 0.68, 0.55];

function isAcceptedMimeType(value: string): value is FeedbackImageMimeType {
  return (FEEDBACK_IMAGE_MIME_TYPES as ReadonlyArray<string>).includes(value);
}

/** Strip the `data:<mime>;base64,` prefix a `FileReader` data URL carries. */
async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    });
    reader.addEventListener("error", () => {
      reject(new PrepareImageError("read-failed"));
    });
    reader.readAsDataURL(blob);
  });
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (!base64) throw new PrepareImageError("read-failed");
  return base64;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Pick the lossy encoder to target. WebP holds screenshot text far better than
 * JPEG at the same byte budget, but `toBlob` silently falls back to PNG when a
 * type is unsupported — so probe once with a 1×1 canvas and check what actually
 * came back rather than trusting the request.
 */
async function resolveEncoder(): Promise<"image/webp" | "image/jpeg"> {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const blob = await canvasToBlob(probe, "image/webp", 0.9);
  return blob?.type === "image/webp" ? "image/webp" : "image/jpeg";
}

/** Draw the bitmap onto a canvas whose longest edge is at most `maxDimension`. */
function drawScaled(
  bitmap: ImageBitmap,
  maxDimension: number,
  opaque: boolean,
): HTMLCanvasElement {
  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PrepareImageError("unreadable");
  // JPEG has no alpha channel: without this, transparent regions of a PNG
  // screenshot encode as black instead of the white they appear as on screen.
  if (opaque) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Normalize `file` into something the PDS will accept, downscaling and
 * re-encoding as needed. Throws a reader-facing message when the image can't be
 * decoded or can't be squeezed under the cap.
 */
export async function prepareFeedbackImage(
  file: File,
): Promise<PreparedFeedbackImage> {
  if (isAcceptedMimeType(file.type) && file.size <= FEEDBACK_IMAGE_MAX_BYTES) {
    return {
      bytes: file.size,
      dataBase64: await blobToBase64(file),
      mimeType: file.type,
    };
  }

  // An animated GIF can't survive a canvas round trip — the canvas holds one
  // frame — so an oversized one is rejected rather than silently flattened.
  if (file.type === "image/gif") {
    throw new PrepareImageError("gif-too-large");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PrepareImageError("unreadable");
  }

  try {
    const mimeType = await resolveEncoder();
    const opaque = mimeType === "image/jpeg";
    for (const maxDimension of MAX_DIMENSIONS) {
      const canvas = drawScaled(bitmap, maxDimension, opaque);
      for (const quality of QUALITIES) {
        const blob = await canvasToBlob(canvas, mimeType, quality);
        if (!blob) continue;
        if (blob.size <= FEEDBACK_IMAGE_MAX_BYTES) {
          return {
            bytes: blob.size,
            dataBase64: await blobToBase64(blob),
            mimeType,
          };
        }
      }
    }
    throw new PrepareImageError("too-large");
  } finally {
    bitmap.close();
  }
}
