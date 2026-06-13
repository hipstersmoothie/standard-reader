import type { SpeechArticle } from "#/components/reader/content/extract-text";
import type { db } from "#/db/index.server";
import type * as schema from "#/db/schema";
import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";

import {
  articleBskyPostUris,
  articleReadingText,
  articleSpeechText,
  speechAuthor,
} from "#/components/reader/content/extract-text";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { GREENGALE_CONTENT_REF } from "#/lib/greengale/types";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { PCKT_CONTENT } from "#/lib/pckt/types";
import { getPosts } from "#/server/atproto/bsky-posts";
import { authorPds } from "#/server/atproto/identity";
import { didFromAtUri } from "#/server/atproto/uri";
import { resolveGreengaleContent } from "#/server/greengale/resolve";
import { resolveLeafletContent } from "#/server/leaflet/resolve";
import { resolvePcktContent } from "#/server/pckt/resolve";
import { eq } from "drizzle-orm";

export interface ExtensionNarration {
  documentUri: string;
  title: string;
  /** Narration author (drives the reader's voice pick), may be null. */
  author: string | null;
  /** Full speech text: title, dek, byline, body — same as the app reader. */
  text: string;
  /**
   * False when the body came from the indexed search blob / description
   * fallback rather than structured content — i.e. it may be a truncated
   * excerpt. The extension then prefers reading the live page instead.
   */
  complete: boolean;
}

/**
 * Inline narration for embedded Bluesky posts, mirroring the app reader's
 * `buildNarration`: author name then post body as separate paragraphs so the
 * TTS pauses between them. Failures fall back to narrating without the embeds.
 */
async function embedPostText(
  uris: Array<string>,
): Promise<Map<string, string> | undefined> {
  if (uris.length === 0) return undefined;
  try {
    const posts = await getPosts(uris);
    const entries = posts
      .filter((post) => post.author && post.text.trim().length > 0)
      .map((post): [string, string] => [
        post.uri,
        `${post.author.displayName ?? post.author.handle}\n\n${post.text.trim()}`,
      ]);
    return entries.length > 0 ? new Map(entries) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the read-aloud narration for a document, using the same extraction the
 * in-app page reader does (`articleSpeechText` + embedded Bluesky posts).
 */
export async function resolveNarration(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
): Promise<ExtensionNarration | null> {
  const d = schemaModule.documents;
  const p = schemaModule.publications;
  const pr = schemaModule.profiles;
  const dc = schemaModule.documentContributors;

  const authorDid = didFromAtUri(documentUri);

  const [docRows, contributorRows, authorProfileRows] = await Promise.all([
    dbClient
      .select({
        uri: d.uri,
        did: d.did,
        title: d.title,
        description: d.description,
        contentJson: d.contentJson,
        contentFormat: d.contentFormat,
        textContent: d.textContent,
        pubName: p.name,
        pubOwnerHandle: pr.handle,
        pubOwnerDisplayName: pr.displayName,
      })
      .from(d)
      .leftJoin(p, eq(p.uri, d.publicationUri))
      .leftJoin(pr, eq(pr.did, p.did))
      .where(eq(d.uri, documentUri))
      .limit(1),
    dbClient
      .select({
        displayName: dc.displayName,
        profileDisplayName: pr.displayName,
        handle: pr.handle,
      })
      .from(dc)
      .leftJoin(pr, eq(pr.did, dc.did))
      .where(eq(dc.documentUri, documentUri)),
    authorDid
      ? dbClient
          .select({ pds: pr.pds })
          .from(pr)
          .where(eq(pr.did, authorDid))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const row = docRows[0];
  if (!row) return null;

  // Mirror the article view's content resolution: large Leaflet/pckt documents
  // store their body blocks out-of-record (a JSON blob on the authoring PDS)
  // and Greengale stores it behind a content ref. Without this the narration
  // would cover only the title/dek/byline for those articles.
  let contentJson = row.contentJson;
  let contentFormat = row.contentFormat;
  const needsResolve =
    contentJson != null &&
    (contentFormat === LEAFLET_CONTENT ||
      contentFormat === PCKT_CONTENT ||
      contentFormat === GREENGALE_CONTENT_REF);
  if (needsResolve) {
    try {
      const pds = await authorPds(row.did, authorProfileRows[0]?.pds ?? null);
      if (contentFormat === LEAFLET_CONTENT) {
        contentJson = (await resolveLeafletContent(
          contentJson,
          row.did,
          pds,
        )) as typeof row.contentJson;
      } else if (contentFormat === PCKT_CONTENT) {
        contentJson = (await resolvePcktContent(
          contentJson,
          row.did,
          pds,
        )) as typeof row.contentJson;
      } else {
        const resolved = await resolveGreengaleContent(
          contentJson,
          row.did,
          pds,
        );
        if (
          typeof resolved === "object" &&
          resolved !== null &&
          !Array.isArray(resolved) &&
          (resolved as { $type?: unknown }).$type === STANDARD_MARKDOWN_CONTENT
        ) {
          contentJson = resolved as typeof row.contentJson;
          contentFormat = STANDARD_MARKDOWN_CONTENT;
        }
      }
    } catch {
      // Fall back to the unresolved record; extraction degrades to textContent.
    }
  }

  const article: SpeechArticle = {
    title: row.title ?? "",
    description: row.description,
    contentFormat,
    // The column is `unknown` in the schema; the detail API applies the same
    // narrowing when it builds `ArticleDetail`.
    contentJson: contentJson as JsonValue,
    textContent: row.textContent,
    contributors: contributorRows.map((c) => ({
      displayName: c.displayName ?? c.profileDisplayName,
      handle: c.handle,
    })),
    publicationOwnerDisplayName: row.pubOwnerDisplayName,
    publicationOwnerHandle: row.pubOwnerHandle,
    publication: row.pubName ? { name: row.pubName } : null,
  };

  const embeds = await embedPostText(articleBskyPostUris(article));
  const text = articleSpeechText(article, embeds)?.trim();
  if (!text) return null;

  // `articleReadingText` falls back to the raw search blob and finally the
  // description when there's no structured body to extract — both can be
  // truncated excerpts, so flag the narration as incomplete in that case.
  const body = articleReadingText(article, embeds)?.trim() ?? "";
  const complete =
    body.length > 0 &&
    body !== (row.textContent?.trim() ?? "") &&
    body !== (row.description?.trim() ?? "");

  return {
    documentUri: row.uri,
    title: article.title.trim() || "Untitled",
    author: speechAuthor(article),
    text,
    complete,
  };
}
