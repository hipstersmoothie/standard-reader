/**
 * Start a download without disturbing the page.
 *
 * A synthetic `<a download>` click rather than `location.assign`: the book
 * routes answer with `Content-Disposition: attachment`, so either one ends up
 * as a file, but only this one is guaranteed never to begin a navigation. That
 * matters in the comic theater, where the reader may be in full screen — and a
 * browser that treats an attachment as a navigation attempt drops out of it.
 *
 * `download` is honored same-origin, which our own book routes are. If the
 * public URL ever differs from the serving origin (a preview deployment on its
 * own domain), the attribute is ignored and the browser falls back to the
 * navigation path — where `Content-Disposition` still makes it a download.
 */
export function startDownload(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  // Empty string means "use the filename the server sent".
  anchor.download = "";
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
