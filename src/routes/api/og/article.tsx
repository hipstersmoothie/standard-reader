import { createFileRoute } from "@tanstack/react-router";
import { readingMinutes } from "#/components/reader/format";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { cdnImageUrl } from "#/server/atproto/blob";
import { renderArticleOgImage } from "#/server/og/article-card";
import { and, eq } from "drizzle-orm";

const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

async function loadArticleOgMeta(did: string, rkey: string) {
  const uri = `at://${did}/${STANDARD_NSID.document}/${rkey}`;
  const doc = schema.documents;
  const pub = schema.publications;
  const pr = schema.profiles;

  const rows = await db
    .select({
      did: doc.did,
      title: doc.title,
      description: doc.description,
      coverImageCid: doc.coverImageCid,
      publishedAt: doc.publishedAt,
      textContent: doc.textContent,
      publicationName: pub.name,
      publicationDid: pub.did,
      publicationOwnerHandle: pr.handle,
      publicationIconCid: pub.iconCid,
      publicationOwnerAvatarUrl: pr.avatarUrl,
      themeBackground: pub.themeBackground,
      themeForeground: pub.themeForeground,
      themeAccent: pub.themeAccent,
      themeAccentForeground: pub.themeAccentForeground,
    })
    .from(doc)
    .leftJoin(pub, eq(pub.uri, doc.publicationUri))
    .leftJoin(pr, eq(pr.did, pub.did))
    .where(and(eq(doc.uri, uri), eq(doc.deleted, false)))
    .limit(1);

  return rows[0] ?? null;
}

export const Route = createFileRoute("/api/og/article")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const did = url.searchParams.get("did")?.trim();
        const rkey = url.searchParams.get("rkey")?.trim();

        if (!did || !rkey) {
          return new Response("Bad Request", { status: 400 });
        }

        try {
          const meta = await loadArticleOgMeta(did, rkey);
          if (!meta?.title) {
            return new Response("Not Found", { status: 404 });
          }

          const png = await renderArticleOgImage({
            title: meta.title,
            description: meta.description,
            coverImageUrl: meta.coverImageCid
              ? cdnImageUrl(meta.did, meta.coverImageCid, "jpeg")
              : null,
            publishedAt: meta.publishedAt?.toISOString() ?? null,
            readingMinutes: readingMinutes(meta.textContent),
            publicationName: meta.publicationName,
            publicationOwnerHandle: meta.publicationOwnerHandle,
            publicationIconUrl:
              meta.publicationIconCid && meta.publicationDid
                ? cdnImageUrl(
                    meta.publicationDid,
                    meta.publicationIconCid,
                    "png",
                  )
                : null,
            publicationOwnerAvatarUrl: meta.publicationOwnerAvatarUrl,
            themeBackground: meta.themeBackground,
            themeForeground: meta.themeForeground,
            themeAccent: meta.themeAccent,
            themeAccentForeground: meta.themeAccentForeground,
          });

          return new Response(Buffer.from(png), {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": CACHE_CONTROL,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to render image";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
