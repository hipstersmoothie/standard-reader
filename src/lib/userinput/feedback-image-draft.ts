/**
 * Client-side state for a feedback screenshot between "reader dropped a file"
 * and "the record references its blob". Lives outside the picker component so
 * the dialog can read the same helpers without the component file exporting
 * non-components (which breaks fast refresh).
 */

import type { BlobRefJson, FeedbackImageAttachment } from "./space";

/**
 * One attachment as the dialog holds it. `blob` is `null` until the upload
 * resolves — the submit button waits on that, so a reader can't post a record
 * that references a blob the PDS never received.
 *
 * `file` is kept so a failed upload can be retried without asking the reader to
 * find the screenshot again.
 */
export interface FeedbackImageDraft {
  id: string;
  file: File;
  /** Object URL of the original file, revoked when the picker unmounts. */
  previewUrl: string;
  alt: string;
  blob: BlobRefJson | null;
  error: string | null;
}

/** True while any attachment is still uploading. */
export function hasPendingUploads(images: Array<FeedbackImageDraft>): boolean {
  return images.some((image) => !image.blob && !image.error);
}

/** The attachments that are safe to put on the record. */
export function readyAttachments(
  images: Array<FeedbackImageDraft>,
): Array<FeedbackImageAttachment> {
  const out: Array<FeedbackImageAttachment> = [];
  for (const image of images) {
    if (!image.blob) continue;
    const alt = image.alt.trim();
    out.push({ blob: image.blob, ...(alt ? { alt } : {}) });
  }
  return out;
}
