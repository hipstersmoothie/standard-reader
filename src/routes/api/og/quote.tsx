import { createFileRoute } from "@tanstack/react-router";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { decodeQuoteParam } from "#/lib/quote-share";
import { cdnImageUrl } from "#/server/atproto/blob";
import { renderQuoteOgImage } from "#/server/og/quote-card";
import { getQuoteShareForDocument } from "#/server/reader/quote-shares";
import { and, eq } from "drizzle-orm";

const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

async function loadQuoteOgMeta(did: string, rkey: string) {
  const uri = `at://${did}/${STANDARD_NSID.document}/${rkey}`;
  const doc = schema.documents;
  const pub = schema.publications;
  const pr = schema.profiles;

  const rows = await db
    .select({
      publicationName: pub.name,
      publicationDescription: pub.description,
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

export const Route = createFileRoute("/api/og/quote")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const did = url.searchParams.get("did")?.trim();
        const rkey = url.searchParams.get("rkey")?.trim();
        const shareId = url.searchParams.get("q")?.trim();

        if (!did || !rkey || !shareId) {
          return new Response("Bad Request", { status: 400 });
        }

        const documentUri = `at://${did}/${STANDARD_NSID.document}/${rkey}`;

        try {
          const meta = await loadQuoteOgMeta(did, rkey);
          if (!meta) {
            return new Response("Not Found", { status: 404 });
          }

          const quote =
            (await getQuoteShareForDocument(shareId, documentUri)) ??
            (shareId.length > 12 ? decodeQuoteParam(shareId) : null);
          if (!quote) {
            return new Response("Not Found", { status: 404 });
          }

          const png = await renderQuoteOgImage({
            quote,
            publicationName: meta.publicationName,
            publicationDescription: meta.publicationDescription,
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
