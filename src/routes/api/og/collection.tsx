import { createFileRoute } from "@tanstack/react-router";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { parseCollectionManifest } from "#/lib/collections/manifest";
import { themeFontsFromJson } from "#/lib/collections/theme";
import { cdnImageUrl } from "#/server/atproto/blob";
import {
  collectionOgCardDescription,
  renderCollectionOgImage,
} from "#/server/og/collection-card";
import { and, eq } from "drizzle-orm";

const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

async function loadCollectionOgMeta(did: string, rkey: string) {
  const uri = `at://${did}/${STANDARD_NSID.document}/${rkey}`;
  const doc = schema.documents;
  const pub = schema.publications;
  const pr = schema.profiles;

  const rows = await db
    .select({
      did: doc.did,
      name: doc.title,
      description: doc.description,
      coverImageCid: doc.coverImageCid,
      collectionJson: doc.collectionJson,
      publicationName: pub.name,
      publicationDid: pub.did,
      publicationOwnerHandle: pr.handle,
      publicationOwnerDisplayName: pr.displayName,
      publicationIconCid: pub.iconCid,
      publicationOwnerAvatarUrl: pr.avatarUrl,
      themeBackground: pub.themeBackground,
      themeForeground: pub.themeForeground,
      themeAccent: pub.themeAccent,
      themeAccentForeground: pub.themeAccentForeground,
      themeJson: pub.themeJson,
    })
    .from(doc)
    .leftJoin(pub, eq(pub.uri, doc.publicationUri))
    .leftJoin(pr, eq(pr.did, pub.did))
    .where(and(eq(doc.uri, uri), eq(doc.deleted, false)))
    .limit(1);

  const row = rows[0];
  if (!row?.name) return null;

  const manifest = parseCollectionManifest(row.collectionJson);
  if (!manifest) return null;

  const themeFonts = themeFontsFromJson(row.themeJson);

  return {
    name: row.name,
    publicationName: row.publicationName,
    description: collectionOgCardDescription({
      editorialBody: manifest.editorial?.body ?? null,
      documentDescription: row.description,
    }),
    coverImageUrl: row.coverImageCid
      ? cdnImageUrl(row.did, row.coverImageCid, "jpeg")
      : null,
    ownerHandle: row.publicationOwnerHandle,
    ownerDisplayName: row.publicationOwnerDisplayName,
    publicationIconUrl:
      row.publicationIconCid && row.publicationDid
        ? cdnImageUrl(row.publicationDid, row.publicationIconCid, "png")
        : null,
    publicationOwnerAvatarUrl: row.publicationOwnerAvatarUrl,
    fontTitle: themeFonts.title,
    fontBody: themeFonts.body,
    featureCount: manifest.items.length,
    themeBackground: row.themeBackground,
    themeForeground: row.themeForeground,
    themeAccent: row.themeAccent,
    themeAccentForeground: row.themeAccentForeground,
  };
}

export const Route = createFileRoute("/api/og/collection")({
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
          const meta = await loadCollectionOgMeta(did, rkey);
          if (!meta?.name) {
            return new Response("Not Found", { status: 404 });
          }

          const png = await renderCollectionOgImage(meta);

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
