import type { ListOgMember } from "#/server/og/list-card";

import { createFileRoute } from "@tanstack/react-router";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { cdnImageUrl } from "#/server/atproto/blob";
import { resolveIdentity } from "#/server/atproto/identity";
import { renderListOgImage } from "#/server/og/list-card";
import { fetchPublicList } from "#/server/reader/saved-lists";
import { and, eq, inArray } from "drizzle-orm";

/** Lists are editable, so cache more briefly than article/publication cards. */
const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

const MAX_MEMBERS = 6;

/** First few member publications (in list order), hydrated for their icons. */
async function loadMembers(uris: Array<string>): Promise<Array<ListOgMember>> {
  const wanted = uris.slice(0, MAX_MEMBERS);
  if (wanted.length === 0) {
    return [];
  }
  const pub = schema.publications;
  const pr = schema.profiles;
  const rows = await db
    .select({
      uri: pub.uri,
      did: pub.did,
      name: pub.name,
      iconCid: pub.iconCid,
      ownerAvatarUrl: pr.avatarUrl,
    })
    .from(pub)
    .leftJoin(pr, eq(pr.did, pub.did))
    .where(and(inArray(pub.uri, wanted), eq(pub.deleted, false)));

  const byUri = new Map(rows.map((row) => [row.uri, row]));
  return wanted
    .map((uri) => byUri.get(uri))
    .filter((row) => row != null)
    .map((row) => ({
      name: row.name ?? "",
      iconUrl:
        row.iconCid && row.did
          ? cdnImageUrl(row.did, row.iconCid, "png")
          : null,
      ownerAvatarUrl: row.ownerAvatarUrl,
    }));
}

async function lookupOwnerHandle(did: string): Promise<string | null> {
  const pr = schema.profiles;
  const rows = await db
    .select({ handle: pr.handle })
    .from(pr)
    .where(eq(pr.did, did))
    .limit(1);
  if (rows[0]?.handle) {
    return rows[0].handle;
  }
  const identity = await resolveIdentity(did);
  return identity.handle;
}

export const Route = createFileRoute("/api/og/list")({
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
          const list = await fetchPublicList(did, rkey);
          if (!list) {
            return new Response("Not Found", { status: 404 });
          }

          const [members, ownerHandle] = await Promise.all([
            loadMembers(list.publications),
            lookupOwnerHandle(did),
          ]);

          const png = await renderListOgImage({
            name: list.name,
            description: list.description,
            ownerHandle,
            publicationCount: list.publications.length,
            members,
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
