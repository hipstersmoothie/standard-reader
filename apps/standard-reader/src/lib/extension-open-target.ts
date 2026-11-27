/**
 * Where the browser extension's "Open" action should take a reader for an
 * article it recognised on the page.
 *
 * The article route (`/a/$did/$rkey`) bounces straight back to the
 * publication's own site when the record has no body Standard Reader can
 * render — which is the page the reader is already on. So for those articles
 * "Open" goes to the publication's Standard Reader page instead (where they can
 * subscribe and browse what else it has published), and when there is no
 * publication to fall back to there is nowhere useful to go at all.
 *
 * Lives in the app's `src/lib` (shared with the extension via `#/`) so the
 * app's test runner covers it; it is plain data in, plain data out.
 */

export type ExtensionOpenTargetArticle = {
  readerUrl: string;
  /** Absent on older resolve payloads — treat as renderable, as the popup does. */
  hasRenderableBody?: boolean;
  publicationReaderUrl: string | null;
};

export type ExtensionOpenTarget = {
  url: string;
  destination: "article" | "publication";
};

export function articleOpenTarget(
  article: ExtensionOpenTargetArticle,
): ExtensionOpenTarget | null {
  if (article.hasRenderableBody ?? true) {
    return { url: article.readerUrl, destination: "article" };
  }
  if (article.publicationReaderUrl) {
    return { url: article.publicationReaderUrl, destination: "publication" };
  }
  return null;
}
