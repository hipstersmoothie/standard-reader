import { createFileRoute } from "@tanstack/react-router";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { renderPublicationOgImage } from "#/server/og/publication-card";
import { and, eq } from "drizzle-orm";

const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

async function loadPublicationOgMeta(did: string, rkey: string) {
  const uri = `at://${did}/${STANDARD_NSID.publication}/${rkey}`;
  const pub = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;

  const rows = await db
    .select({
      name: pub.name,
      description: pub.description,
      topic: pub.topic,
      iconUrl: pub.iconUrl,
      ownerHandle: pr.handle,
      ownerAvatarUrl: pr.avatarUrl,
      subscriberCount: st.subscriberCount,
      documentCount: st.documentCount,
      themeBackground: pub.themeBackground,
      themeForeground: pub.themeForeground,
      themeAccent: pub.themeAccent,
      themeAccentForeground: pub.themeAccentForeground,
    })
    .from(pub)
    .leftJoin(st, eq(st.publicationUri, pub.uri))
    .leftJoin(pr, eq(pr.did, pub.did))
    .where(and(eq(pub.uri, uri), eq(pub.deleted, false)))
    .limit(1);

  return rows[0] ?? null;
}

export const Route = createFileRoute("/api/og/publication")({
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
          const meta = await loadPublicationOgMeta(did, rkey);
          if (!meta?.name) {
            return new Response("Not Found", { status: 404 });
          }

          const png = await renderPublicationOgImage({
            name: meta.name,
            description: meta.description,
            topic: meta.topic,
            ownerHandle: meta.ownerHandle,
            iconUrl: meta.iconUrl,
            ownerAvatarUrl: meta.ownerAvatarUrl,
            subscriberCount: meta.subscriberCount ?? 0,
            documentCount: meta.documentCount ?? 0,
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
